"""
Service for querying versioned nodes collections (v2.1 schema).
Each version has its own collection: nodes_6_5_0, nodes_6_7_5, etc.
No version field in documents, no version suffix in IDs.
$graphLookup works without restrictSearchWithMatch.
"""
import logging
import re
from typing import List, Optional, Dict, Any
from .mongodb_service import MongoDBService

logger = logging.getLogger(__name__)


class NodesQueryService:
    """
    Query service for versioned nodes collections.
    Collection naming: nodes_{version} where . -> _ (e.g., nodes_6_7_5)
    IDs are semantic without version suffix: grafo:{kind}/{identifier}
    """

    def __init__(self, mongodb_service: MongoDBService):
        self.mongodb = mongodb_service

    # ============================================================================
    # COLLECTION HELPERS
    # ============================================================================

    def _get_collection_name(self, version: str) -> str:
        """Convert version to collection name: 6.7.5 -> nodes_6_7_5"""
        return f"nodes_{version.replace('.', '_')}"

    def _get_collection(self, version: str):
        """Get the MongoDB collection for a specific version."""
        return self.mongodb.get_collection(self._get_collection_name(version))

    def _version_from_collection(self, collection_name: str) -> str:
        """Extract version from collection name: nodes_6_7_5 -> 6.7.5"""
        if collection_name.startswith("nodes_"):
            return collection_name[6:].replace("_", ".")
        return ""

    # ============================================================================
    # VERSION MANAGEMENT
    # ============================================================================

    async def get_available_versions(self) -> List[str]:
        """Get list of all available graph versions (collections)."""
        try:
            collections = await self.mongodb.db.list_collection_names()
            versions = []
            for name in collections:
                if name.startswith("nodes_"):
                    version = self._version_from_collection(name)
                    if version:
                        versions.append(version)
            return sorted(versions)
        except Exception as e:
            logger.error(f"Error getting available versions: {e}")
            return []

    async def get_version_statistics(self, version: str) -> Dict[str, Any]:
        """Get statistics for a specific version."""
        try:
            collection = self._get_collection(version)
            total_nodes = await collection.count_documents({})

            # Count by type
            type_pipeline = [
                {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]

            nodes_by_type = {}
            async for doc in collection.aggregate(type_pipeline):
                nodes_by_type[doc["_id"]] = doc["count"]

            # Count solutions
            solution_pipeline = [
                {"$group": {"_id": "$solution"}},
                {"$count": "total"}
            ]

            solutions_count = 0
            async for doc in collection.aggregate(solution_pipeline):
                solutions_count = doc.get("total", 0)

            return {
                "version": version,
                "collection": self._get_collection_name(version),
                "totalNodes": total_nodes,
                "totalSolutions": solutions_count,
                "nodesByType": nodes_by_type
            }

        except Exception as e:
            logger.error(f"Error getting version statistics for {version}: {e}")
            return {"version": version, "error": str(e)}

    async def check_version_exists(self, version: str) -> bool:
        """Check if a version collection exists and has data."""
        try:
            collection = self._get_collection(version)
            count = await collection.count_documents({})
            return count > 0
        except Exception:
            return False

    # ============================================================================
    # NODE QUERIES
    # ============================================================================

    async def search_nodes(
        self,
        version: str,
        query: str,
        node_type: Optional[str] = None,
        solution: Optional[str] = None,
        project: Optional[str] = None,
        limit: int = 50,
        exact_first: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Search nodes by name/fullName in a specific version.

        If exact_first=True (default):
        1. First tries exact match on name (case-insensitive)
        2. If no results, falls back to regex/like search
        """
        try:
            collection = self._get_collection(version)

            # Build base filters (type, solution, project)
            base_conditions = []
            if node_type:
                base_conditions.append({"kind": node_type.lower()})
            if solution:
                base_conditions.append({"solution": {"$regex": solution, "$options": "i"}})
            if project:
                base_conditions.append({"project": {"$regex": project, "$options": "i"}})

            results = []

            # STEP 1: Try exact match first (case-insensitive)
            if query and exact_first:
                exact_conditions = base_conditions.copy()
                # Exact match on name (case-insensitive using regex ^query$)
                exact_conditions.append({"name": {"$regex": f"^{re.escape(query)}$", "$options": "i"}})

                exact_query = {"$and": exact_conditions} if len(exact_conditions) > 1 else exact_conditions[0]
                cursor = collection.find(exact_query).limit(limit)
                async for doc in cursor:
                    results.append(self._normalize_node(doc))

                if results:
                    logger.info(f"Found {len(results)} exact matches for '{query}' in v{version}")
                    return results

            # STEP 2: Fall back to regex/like search if no exact matches
            if query:
                like_conditions = base_conditions.copy()
                like_conditions.append({
                    "$or": [
                        {"name": {"$regex": query, "$options": "i"}},
                        {"fullName": {"$regex": query, "$options": "i"}}
                    ]
                })

                like_query = {"$and": like_conditions} if len(like_conditions) > 1 else like_conditions[0]
                cursor = collection.find(like_query).limit(limit)
                async for doc in cursor:
                    results.append(self._normalize_node(doc))

                logger.info(f"Found {len(results)} partial matches for '{query}' in v{version}")

            return results

        except Exception as e:
            logger.error(f"Error searching nodes: {e}")
            return []

    async def get_node_by_id(self, version: str, node_id: str) -> Optional[Dict[str, Any]]:
        """Get a node by its semantic ID."""
        try:
            collection = self._get_collection(version)
            doc = await collection.find_one({"_id": node_id})
            if doc:
                return self._normalize_node(doc)
            return None
        except Exception as e:
            logger.error(f"Error getting node {node_id}: {e}")
            return None

    async def get_nodes_by_solution(
        self,
        version: str,
        solution: str,
        node_type: Optional[str] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Get all nodes for a specific solution."""
        try:
            collection = self._get_collection(version)
            query = {"solution": solution}
            if node_type:
                query["kind"] = node_type.lower()

            cursor = collection.find(query).limit(limit)
            results = []
            async for doc in cursor:
                results.append(self._normalize_node(doc))
            return results
        except Exception as e:
            logger.error(f"Error getting nodes for solution {solution}: {e}")
            return []

    async def get_nodes_by_project(
        self,
        version: str,
        project: str,
        node_type: Optional[str] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Get all nodes for a specific project."""
        try:
            collection = self._get_collection(version)
            query = {"project": {"$regex": project, "$options": "i"}}
            if node_type:
                query["kind"] = node_type.lower()

            cursor = collection.find(query).limit(limit)
            results = []
            async for doc in cursor:
                results.append(self._normalize_node(doc))
            return results
        except Exception as e:
            logger.error(f"Error getting nodes for project {project}: {e}")
            return []

    # ============================================================================
    # GRAPH TRAVERSAL WITH $graphLookup (no restrictSearchWithMatch needed)
    # ============================================================================

    async def find_callers(
        self,
        version: str,
        target_id: str,
        max_depth: int = 3,
        include_indirect: bool = True
    ) -> Dict[str, Any]:
        """
        Find all methods that call a specific method using $graphLookup.
        Since each version is in its own collection, no version filtering needed.
        """
        try:
            collection = self._get_collection(version)
            collection_name = self._get_collection_name(version)

            # Get target node
            target = await self.get_node_by_id(version, target_id)
            if not target:
                return {"found": False, "message": f"Node {target_id} not found in v{version}"}

            # Find direct callers
            pipeline = [
                {"$match": {"_id": target_id}},
                {"$graphLookup": {
                    "from": collection_name,
                    "startWith": "$_id",
                    "connectFromField": "_id",
                    "connectToField": "calls",
                    "as": "callers",
                    "maxDepth": max_depth,
                    "depthField": "depth"
                }}
            ]

            results = []
            async for doc in collection.aggregate(pipeline):
                for caller in doc.get("callers", []):
                    results.append({
                        "node": self._normalize_node(caller),
                        "depth": caller.get("depth", 0)
                    })

            # Find indirect callers (via interfaces)
            indirect_callers = []
            if include_indirect:
                indirect_pipeline = [
                    {"$match": {"_id": target_id}},
                    {"$graphLookup": {
                        "from": collection_name,
                        "startWith": "$_id",
                        "connectFromField": "_id",
                        "connectToField": "indirectCall",
                        "as": "indirectCallers",
                        "maxDepth": max_depth,
                        "depthField": "depth"
                    }}
                ]

                async for doc in collection.aggregate(indirect_pipeline):
                    for caller in doc.get("indirectCallers", []):
                        indirect_callers.append({
                            "node": self._normalize_node(caller),
                            "depth": caller.get("depth", 0),
                            "indirect": True
                        })

            return {
                "found": True,
                "target": target,
                "version": version,
                "callers": results,
                "indirectCallers": indirect_callers,
                "totalCallers": len(results) + len(indirect_callers)
            }

        except Exception as e:
            logger.error(f"Error finding callers for {target_id}: {e}")
            return {"found": False, "error": str(e)}

    async def find_callees(
        self,
        version: str,
        source_id: str,
        max_depth: int = 3,
        include_via_interface: bool = True
    ) -> Dict[str, Any]:
        """Find all methods called by a specific method."""
        try:
            collection = self._get_collection(version)
            collection_name = self._get_collection_name(version)

            source = await self.get_node_by_id(version, source_id)
            if not source:
                return {"found": False, "message": f"Node {source_id} not found in v{version}"}

            # Find direct callees
            pipeline = [
                {"$match": {"_id": source_id}},
                {"$graphLookup": {
                    "from": collection_name,
                    "startWith": "$calls",
                    "connectFromField": "calls",
                    "connectToField": "_id",
                    "as": "callees",
                    "maxDepth": max_depth,
                    "depthField": "depth"
                }}
            ]

            results = []
            async for doc in collection.aggregate(pipeline):
                for callee in doc.get("callees", []):
                    results.append({
                        "node": self._normalize_node(callee),
                        "depth": callee.get("depth", 0)
                    })

            # Find calls via interface
            via_interface = []
            if include_via_interface:
                via_pipeline = [
                    {"$match": {"_id": source_id}},
                    {"$graphLookup": {
                        "from": collection_name,
                        "startWith": "$callsVia",
                        "connectFromField": "callsVia",
                        "connectToField": "_id",
                        "as": "viaInterface",
                        "maxDepth": max_depth,
                        "depthField": "depth"
                    }}
                ]

                async for doc in collection.aggregate(via_pipeline):
                    for callee in doc.get("viaInterface", []):
                        via_interface.append({
                            "node": self._normalize_node(callee),
                            "depth": callee.get("depth", 0),
                            "viaInterface": True
                        })

            return {
                "found": True,
                "source": source,
                "version": version,
                "callees": results,
                "viaInterface": via_interface,
                "totalCallees": len(results) + len(via_interface)
            }

        except Exception as e:
            logger.error(f"Error finding callees for {source_id}: {e}")
            return {"found": False, "error": str(e)}

    async def find_implementations(
        self,
        version: str,
        interface_id: str
    ) -> Dict[str, Any]:
        """Find all classes that implement a specific interface."""
        try:
            collection = self._get_collection(version)

            interface = await self.get_node_by_id(version, interface_id)
            if not interface:
                return {"found": False, "message": f"Interface {interface_id} not found in v{version}"}

            # Find classes that have this interface in their implements array
            cursor = collection.find({"implements": interface_id})

            implementations = []
            async for doc in cursor:
                implementations.append(self._normalize_node(doc))

            return {
                "found": True,
                "interface": interface,
                "version": version,
                "implementations": implementations,
                "count": len(implementations)
            }

        except Exception as e:
            logger.error(f"Error finding implementations for {interface_id}: {e}")
            return {"found": False, "error": str(e)}

    async def find_inheritance_chain(
        self,
        version: str,
        class_id: str,
        max_depth: int = 10
    ) -> Dict[str, Any]:
        """Find the full inheritance chain (ancestors and descendants) of a class."""
        try:
            collection = self._get_collection(version)
            collection_name = self._get_collection_name(version)

            class_node = await self.get_node_by_id(version, class_id)
            if not class_node:
                return {"found": False, "message": f"Class {class_id} not found in v{version}"}

            # Find ancestors
            ancestors_pipeline = [
                {"$match": {"_id": class_id}},
                {"$graphLookup": {
                    "from": collection_name,
                    "startWith": "$inherits",
                    "connectFromField": "inherits",
                    "connectToField": "_id",
                    "as": "ancestors",
                    "maxDepth": max_depth,
                    "depthField": "depth"
                }}
            ]

            ancestors = []
            async for doc in collection.aggregate(ancestors_pipeline):
                for ancestor in doc.get("ancestors", []):
                    ancestors.append({
                        "node": self._normalize_node(ancestor),
                        "depth": ancestor.get("depth", 0)
                    })

            # Find descendants
            descendants_pipeline = [
                {"$match": {"_id": class_id}},
                {"$graphLookup": {
                    "from": collection_name,
                    "startWith": "$_id",
                    "connectFromField": "_id",
                    "connectToField": "inherits",
                    "as": "descendants",
                    "maxDepth": max_depth,
                    "depthField": "depth"
                }}
            ]

            descendants = []
            async for doc in collection.aggregate(descendants_pipeline):
                for descendant in doc.get("descendants", []):
                    descendants.append({
                        "node": self._normalize_node(descendant),
                        "depth": descendant.get("depth", 0)
                    })

            return {
                "found": True,
                "class": class_node,
                "version": version,
                "ancestors": sorted(ancestors, key=lambda x: x["depth"]),
                "descendants": sorted(descendants, key=lambda x: x["depth"]),
                "hierarchyDepth": max([a["depth"] for a in ancestors], default=0)
            }

        except Exception as e:
            logger.error(f"Error finding inheritance chain for {class_id}: {e}")
            return {"found": False, "error": str(e)}

    # ============================================================================
    # STATISTICS
    # ============================================================================

    async def get_statistics(self, version: str) -> Dict[str, Any]:
        """Get overall statistics for a version."""
        try:
            collection = self._get_collection(version)
            total_nodes = await collection.count_documents({})

            # Count by type
            type_pipeline = [
                {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]

            nodes_by_type = {}
            async for doc in collection.aggregate(type_pipeline):
                nodes_by_type[doc["_id"]] = doc["count"]

            # Count projects
            project_pipeline = [
                {"$group": {"_id": "$project"}},
                {"$count": "total"}
            ]

            projects_count = 0
            async for doc in collection.aggregate(project_pipeline):
                projects_count = doc.get("total", 0)

            # Count solutions
            solution_pipeline = [
                {"$group": {"_id": "$solution"}},
                {"$count": "total"}
            ]

            solutions_count = 0
            async for doc in collection.aggregate(solution_pipeline):
                solutions_count = doc.get("total", 0)

            return {
                "version": version,
                "totalNodes": total_nodes,
                "totalProjects": projects_count,
                "totalSolutions": solutions_count,
                "nodesByType": nodes_by_type
            }

        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return {"error": str(e)}

    # ============================================================================
    # SEMANTIC STATISTICS (v2.1)
    # ============================================================================

    async def get_semantic_stats(self, version: str) -> Dict[str, Any]:
        """Get semantic relationship statistics for a version."""
        try:
            collection = self._get_collection(version)

            # Count relationships using aggregation
            pipeline = [
                {"$project": {
                    "calls_count": {"$size": {"$ifNull": ["$calls", []]}},
                    "callsVia_count": {"$size": {"$ifNull": ["$callsVia", []]}},
                    "implements_count": {"$size": {"$ifNull": ["$implements", []]}},
                    "inherits_count": {"$size": {"$ifNull": ["$inherits", []]}},
                    "uses_count": {"$size": {"$ifNull": ["$uses", []]}},
                    "contains_count": {"$size": {"$ifNull": ["$contains", []]}}
                }},
                {"$group": {
                    "_id": None,
                    "Calls": {"$sum": "$calls_count"},
                    "CallsVia": {"$sum": "$callsVia_count"},
                    "Implements": {"$sum": "$implements_count"},
                    "Inherits": {"$sum": "$inherits_count"},
                    "Uses": {"$sum": "$uses_count"},
                    "Contains": {"$sum": "$contains_count"}
                }}
            ]

            relationships = {
                "Inherits": 0, "Implements": 0, "Calls": 0,
                "CallsVia": 0, "Uses": 0, "Contains": 0
            }

            async for doc in collection.aggregate(pipeline):
                relationships["Calls"] = doc.get("Calls", 0)
                relationships["CallsVia"] = doc.get("CallsVia", 0)
                relationships["Implements"] = doc.get("Implements", 0)
                relationships["Inherits"] = doc.get("Inherits", 0)
                relationships["Uses"] = doc.get("Uses", 0)
                relationships["Contains"] = doc.get("Contains", 0)

            total_semantic = sum(relationships.values())

            # Count classes and interfaces
            class_count = await collection.count_documents({"kind": "class"})
            interface_count = await collection.count_documents({"kind": "interface"})

            return {
                "version": version,
                "relationships": relationships,
                "totalSemanticEdges": total_semantic,
                "nodes": {
                    "totalClasses": class_count,
                    "totalInterfaces": interface_count
                }
            }

        except Exception as e:
            logger.error(f"Error getting semantic stats: {e}")
            return {"error": str(e)}

    # ============================================================================
    # HELPERS
    # ============================================================================

    def _normalize_node(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize a node document for consistent output."""
        return {
            "id": doc.get("_id", ""),
            "name": doc.get("name", ""),
            "fullName": doc.get("fullName", doc.get("name", "")),
            "type": doc.get("@type", "").replace("grafo:", ""),
            "kind": doc.get("kind", ""),
            "language": doc.get("language", "csharp"),
            "namespace": doc.get("namespace"),
            "project": doc.get("project"),
            "solution": doc.get("solution"),
            "source": doc.get("source"),
            "accessibility": doc.get("accessibility"),
            "isAbstract": doc.get("isAbstract", False),
            "isStatic": doc.get("isStatic", False),
            "isSealed": doc.get("isSealed", False),
            "layer": doc.get("layer"),
            "containedIn": doc.get("containedIn"),
            "contains": doc.get("contains", []),
            "calls": doc.get("calls", []),
            "callsVia": doc.get("callsVia", []),
            "indirectCall": doc.get("indirectCall", []),
            "implements": doc.get("implements", []),
            "inherits": doc.get("inherits", []),
            "uses": doc.get("uses", [])
        }
