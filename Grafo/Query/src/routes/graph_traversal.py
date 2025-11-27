"""
API routes for graph traversal queries using the v2.1 nodes schema.
Supports $graphLookup for call chain analysis.
Supports multi-version queries - version is passed via URL query parameter.

IMPORTANT: When version is specified, all queries filter by that version.
This ensures queries never mix data from different graph versions.
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.mongodb_service import get_mongodb_service
from ..services.nodes_query_service import NodesQueryService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/graph", tags=["graph-traversal"])


# Request/Response Models
# Note: All request models now include an optional version field
class FindCallersRequest(BaseModel):
    targetId: str = Field(..., description="ID of the target method/node")
    maxDepth: int = Field(default=3, ge=1, le=10, description="Maximum depth to traverse")
    includeIndirect: bool = Field(default=True, description="Include indirect calls via interfaces")
    version: Optional[str] = Field(default=None, description="Graph version to query (e.g., '7.9.2')")


class FindCalleesRequest(BaseModel):
    sourceId: str = Field(..., description="ID of the source method/node")
    maxDepth: int = Field(default=3, ge=1, le=10, description="Maximum depth to traverse")
    includeViaInterface: bool = Field(default=True, description="Include calls via interfaces")
    version: Optional[str] = Field(default=None, description="Graph version to query (e.g., '7.9.2')")


class FindImplementationsRequest(BaseModel):
    interfaceId: str = Field(..., description="ID of the interface")
    version: Optional[str] = Field(default=None, description="Graph version to query (e.g., '7.9.2')")


class FindInheritanceRequest(BaseModel):
    classId: str = Field(..., description="ID of the class")
    maxDepth: int = Field(default=10, ge=1, le=20, description="Maximum depth to traverse")
    version: Optional[str] = Field(default=None, description="Graph version to query (e.g., '7.9.2')")


class SearchNodesRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    nodeType: Optional[str] = Field(default=None, description="Filter by node type (Class, Method, etc.)")
    solution: Optional[str] = Field(default=None, description="Filter by solution name")
    project: Optional[str] = Field(default=None, description="Filter by project name")
    version: Optional[str] = Field(default=None, description="Graph version to query (e.g., '7.9.2')")
    limit: int = Field(default=50, ge=1, le=500, description="Maximum results")


def get_nodes_service() -> NodesQueryService:
    """Get the NodesQueryService instance."""
    mongodb = get_mongodb_service()
    return NodesQueryService(mongodb)


@router.get("/schema-check")
async def check_schema():
    """
    Check if the v2.1 schema (nodes collection) is available.
    Returns whether the graph traversal features are enabled.
    """
    try:
        service = get_nodes_service()
        has_v21 = await service.check_v21_schema()
        return {
            "v21SchemaAvailable": has_v21,
            "message": "v2.1 schema is available" if has_v21 else "v2.1 schema not found. Use --output-mongodb in Indexer to populate."
        }
    except Exception as e:
        logger.error(f"Error checking schema: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/versions")
async def list_versions():
    """
    List all available graph versions.
    Returns the list of versions that can be used to filter queries.
    """
    try:
        service = get_nodes_service()
        versions = await service.get_available_versions()
        return {
            "versions": versions,
            "count": len(versions),
            "message": "Use ?version=X.Y.Z query parameter to filter queries by version"
        }
    except Exception as e:
        logger.error(f"Error listing versions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/versions/{version}/statistics")
async def get_version_statistics(version: str):
    """
    Get statistics for a specific graph version.
    """
    try:
        service = get_nodes_service()
        stats = await service.get_version_statistics(version)
        return stats
    except Exception as e:
        logger.error(f"Error getting version statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/solutions")
async def list_solutions():
    """
    List all indexed solutions.
    """
    try:
        service = get_nodes_service()
        solutions = await service.get_solutions()
        return {
            "solutions": solutions,
            "count": len(solutions)
        }
    except Exception as e:
        logger.error(f"Error listing solutions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_nodes(request: SearchNodesRequest):
    """
    Search nodes in the graph.
    When version is specified, only returns nodes from that version.
    """
    try:
        service = get_nodes_service()
        nodes = await service.search_nodes(
            query=request.query,
            node_type=request.nodeType,
            solution=request.solution,
            project=request.project,
            version=request.version,
            limit=request.limit
        )
        return {
            "nodes": nodes,
            "count": len(nodes),
            "version": request.version
        }
    except Exception as e:
        logger.error(f"Error searching nodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/node/{node_id}")
async def get_node(
    node_id: str,
    version: Optional[str] = Query(default=None, description="Graph version to query (e.g., '7.9.2')")
):
    """
    Get a specific node by ID.
    When version is specified, looks for the versioned node ID.
    """
    try:
        service = get_nodes_service()
        node = await service.get_node_by_id(node_id, version)
        if not node:
            raise HTTPException(
                status_code=404,
                detail=f"Node {node_id} not found" + (f" (version: {version})" if version else "")
            )
        return node
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/callers")
async def find_callers(request: FindCallersRequest):
    """
    Find all methods that call a specific method.
    Uses $graphLookup for efficient graph traversal.
    When version is specified, only traverses within that version's data.

    This is useful for impact analysis - finding what code would be affected
    if you change a specific method.
    """
    try:
        service = get_nodes_service()
        result = await service.find_callers(
            target_id=request.targetId,
            max_depth=request.maxDepth,
            include_indirect=request.includeIndirect,
            version=request.version
        )

        if not result.get("found"):
            raise HTTPException(status_code=404, detail=result.get("message", "Target not found"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding callers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/callees")
async def find_callees(request: FindCalleesRequest):
    """
    Find all methods called by a specific method.
    Uses $graphLookup for efficient graph traversal.
    When version is specified, only traverses within that version's data.

    This is useful for understanding dependencies - what code does this method
    depend on.
    """
    try:
        service = get_nodes_service()
        result = await service.find_callees(
            source_id=request.sourceId,
            max_depth=request.maxDepth,
            include_via_interface=request.includeViaInterface,
            version=request.version
        )

        if not result.get("found"):
            raise HTTPException(status_code=404, detail=result.get("message", "Source not found"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding callees: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/implementations")
async def find_implementations(request: FindImplementationsRequest):
    """
    Find all classes that implement a specific interface.
    When version is specified, only returns implementations from that version.

    Useful for finding all concrete implementations when working with
    dependency injection patterns.
    """
    try:
        service = get_nodes_service()
        result = await service.find_implementations(
            interface_id=request.interfaceId,
            version=request.version
        )

        if not result.get("found"):
            raise HTTPException(status_code=404, detail=result.get("message", "Interface not found"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding implementations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inheritance")
async def find_inheritance_chain(request: FindInheritanceRequest):
    """
    Find the full inheritance chain (ancestors and descendants) of a class.
    When version is specified, only traverses within that version's data.

    Returns both parent classes and child classes in the inheritance hierarchy.
    """
    try:
        service = get_nodes_service()
        result = await service.find_inheritance_chain(
            class_id=request.classId,
            max_depth=request.maxDepth,
            version=request.version
        )

        if not result.get("found"):
            raise HTTPException(status_code=404, detail=result.get("message", "Class not found"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding inheritance chain: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
async def get_graph_statistics(solution: Optional[str] = None):
    """
    Get statistics for the graph.
    Optionally filter by solution name.
    """
    try:
        service = get_nodes_service()
        stats = await service.get_statistics(solution=solution)
        return stats
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
