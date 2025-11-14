"""
Servicio principal para consultas de grafo de código.
Proporciona métodos de alto nivel para el MCP y otras aplicaciones.
"""
import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from ..models import (
    ProjectInfo, ProjectSummary, GraphNode, GraphEdge,
    SearchNodesRequest, SearchProjectsRequest, GetRelatedNodesRequest,
    CodeContextRequest, CodeContextResponse
)
from .mongodb_service import MongoDBService

logger = logging.getLogger(__name__)


class GraphQueryService:
    """Servicio de consultas de alto nivel para el grafo de código."""
    
    def __init__(self, mongodb_service: MongoDBService):
        self.mongodb = mongodb_service
    
    # ============================================================================
    # CONSULTAS DE PROYECTOS
    # ============================================================================
    
    async def get_all_projects(self, limit: int = 100) -> List[ProjectSummary]:
        """Obtiene lista de todos los proyectos (resumen)."""
        try:
            projects_col = self.mongodb.projects_collection
            cursor = projects_col.find(
                {},
                {
                    "ProjectId": 1, "ProjectName": 1, "Layer": 1,
                    "NodeCount": 1, "EdgeCount": 1, "LastProcessed": 1,
                    "SourceFile": 1
                }
            ).limit(limit)
            
            results = []
            async for doc in cursor:
                results.append(ProjectSummary(
                    MongoId=str(doc.get("_id", "")),
                    ProjectId=doc.get("ProjectId", ""),
                    ProjectName=doc.get("ProjectName", ""),
                    Layer=doc.get("Layer", ""),
                    NodeCount=doc.get("NodeCount", 0),
                    EdgeCount=doc.get("EdgeCount", 0),
                    LastProcessed=doc.get("LastProcessed", datetime.utcnow()),
                    SourceFile=doc.get("SourceFile", "")
                ))
            
            return results
        except Exception as e:
            logger.error(f"Error getting projects: {e}")
            return []
    
    async def search_projects(self, request: SearchProjectsRequest) -> List[ProjectSummary]:
        """Busca proyectos por nombre o capa."""
        try:
            query = {}
            
            if request.query:
                query["ProjectName"] = {"$regex": request.query, "$options": "i"}
            
            if request.layer:
                query["Layer"] = request.layer
            
            projects_col = self.mongodb.projects_collection
            cursor = projects_col.find(
                query,
                {
                    "ProjectId": 1, "ProjectName": 1, "Layer": 1,
                    "NodeCount": 1, "EdgeCount": 1, "LastProcessed": 1,
                    "SourceFile": 1
                }
            ).limit(request.limit)
            
            results = []
            async for doc in cursor:
                results.append(ProjectSummary(
                    MongoId=str(doc.get("_id", "")),
                    ProjectId=doc.get("ProjectId", ""),
                    ProjectName=doc.get("ProjectName", ""),
                    Layer=doc.get("Layer", ""),
                    NodeCount=doc.get("NodeCount", 0),
                    EdgeCount=doc.get("EdgeCount", 0),
                    LastProcessed=doc.get("LastProcessed", datetime.utcnow()),
                    SourceFile=doc.get("SourceFile", "")
                ))
            
            logger.info(f"Found {len(results)} projects matching query")
            return results
            
        except Exception as e:
            logger.error(f"Error searching projects: {e}")
            return []
    
    async def get_project_by_id(self, project_id: str, include_graph: bool = False) -> Optional[ProjectInfo]:
        """Obtiene un proyecto específico por su ID."""
        try:
            projects_col = self.mongodb.projects_collection
            
            projection = None if include_graph else {
                "Nodes": 0, "Edges": 0
            }
            
            doc = await projects_col.find_one({"ProjectId": project_id}, projection)
            
            if not doc:
                return None
            
            # Convertir ObjectId a string para Pydantic
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            
            return ProjectInfo(**doc)
            
        except Exception as e:
            logger.error(f"Error getting project {project_id}: {e}")
            return None
    
    async def get_projects_by_layer(self) -> Dict[str, int]:
        """Obtiene conteo de proyectos por capa arquitectónica."""
        try:
            projects_col = self.mongodb.projects_collection
            pipeline = [
                {"$group": {"_id": "$Layer", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            
            result = {}
            async for doc in projects_col.aggregate(pipeline):
                layer = doc.get("_id", "Unknown")
                count = doc.get("count", 0)
                result[layer] = count
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting layer statistics: {e}")
            return {}
    
    # ============================================================================
    # CONSULTAS DE NODOS
    # ============================================================================
    
    async def search_nodes(self, request: SearchNodesRequest) -> List[GraphNode]:
        """Busca nodos en el grafo por criterios."""
        try:
            projects_col = self.mongodb.projects_collection
            
            # Construir query para búsqueda dentro de arrays
            match_conditions = []
            
            # Filtro de texto en nombre (búsqueda amplia)
            match_conditions.append({
                "$or": [
                    {"Nodes.Name": {"$regex": request.query, "$options": "i"}},
                    {"Nodes.FullName": {"$regex": request.query, "$options": "i"}},
                    {"Nodes.Id": {"$regex": request.query, "$options": "i"}}
                ]
            })
            
            # Filtros adicionales
            if request.nodeType:
                match_conditions.append({"Nodes.Type": request.nodeType})
            
            if request.project:
                match_conditions.append({"ProjectId": request.project})
            
            if request.namespace:
                match_conditions.append({"Nodes.Namespace": {"$regex": request.namespace, "$options": "i"}})
            
            # Pipeline de agregación para buscar dentro de arrays
            pipeline = [
                {"$match": {"$and": match_conditions} if len(match_conditions) > 1 else match_conditions[0]},
                {"$unwind": "$Nodes"},
                {"$match": {
                    "$and": [
                        {
                            "$or": [
                                {"Nodes.Name": {"$regex": request.query, "$options": "i"}},
                                {"Nodes.FullName": {"$regex": request.query, "$options": "i"}},
                                {"Nodes.Id": {"$regex": request.query, "$options": "i"}}
                            ]
                        }
                    ] + (
                        [{"Nodes.Type": request.nodeType}] if request.nodeType else []
                    ) + (
                        [{"Nodes.Namespace": {"$regex": request.namespace, "$options": "i"}}] if request.namespace else []
                    )
                }},
                {"$limit": request.limit},
                {"$replaceRoot": {"newRoot": "$Nodes"}}
            ]
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                try:
                    node = GraphNode(**doc)
                    results.append(node)
                except Exception as e:
                    logger.warning(f"Error parsing node: {e}")
                    continue
            
            logger.info(f"Found {len(results)} nodes matching query")
            return results
            
        except Exception as e:
            logger.error(f"Error searching nodes: {e}")
            return []
    
    async def get_node_by_id(self, node_id: str) -> Optional[Tuple[GraphNode, str]]:
        """
        Obtiene un nodo específico por su ID.
        Retorna tupla (nodo, project_id) o None si no se encuentra.
        """
        try:
            projects_col = self.mongodb.projects_collection
            
            pipeline = [
                {"$unwind": "$Nodes"},
                {"$match": {"Nodes._id": node_id}},  # CORREGIDO: usar _id en lugar de Id
                {"$project": {
                    "node": "$Nodes",
                    "projectId": "$ProjectId"
                }},
                {"$limit": 1}
            ]
            
            async for doc in projects_col.aggregate(pipeline):
                node = GraphNode(**doc["node"])
                project_id = doc["projectId"]
                return (node, project_id)
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting node {node_id}: {e}")
            return None
    
    async def get_nodes_by_project(self, project_id: str, node_type: Optional[str] = None) -> List[GraphNode]:
        """Obtiene todos los nodos de un proyecto específico."""
        try:
            projects_col = self.mongodb.projects_collection
            
            match_filter = {"ProjectId": project_id}
            
            pipeline = [
                {"$match": match_filter},
                {"$unwind": "$Nodes"},
            ]
            
            if node_type:
                pipeline.append({"$match": {"Nodes.Type": node_type}})
            
            pipeline.append({"$replaceRoot": {"newRoot": "$Nodes"}})
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                try:
                    results.append(GraphNode(**doc))
                except Exception as e:
                    logger.warning(f"Error parsing node: {e}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting nodes for project {project_id}: {e}")
            return []
    
    # ============================================================================
    # CONSULTAS DE ARISTAS Y RELACIONES
    # ============================================================================
    
    async def get_edges_by_project(self, project_id: str) -> List[GraphEdge]:
        """Obtiene todas las aristas de un proyecto."""
        try:
            projects_col = self.mongodb.projects_collection
            
            pipeline = [
                {"$match": {"ProjectId": project_id}},
                {"$unwind": "$Edges"},
                {"$replaceRoot": {"newRoot": "$Edges"}}
            ]
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                try:
                    results.append(GraphEdge(**doc))
                except Exception as e:
                    logger.warning(f"Error parsing edge: {e}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting edges for project {project_id}: {e}")
            return []
    
    async def get_related_nodes(self, request: GetRelatedNodesRequest) -> Dict[str, Any]:
        """Obtiene nodos relacionados a un nodo específico."""
        try:
            # Primero encontrar el proyecto que contiene el nodo
            node_info = await self.get_node_by_id(request.nodeId)
            if not node_info:
                return {
                    "sourceNode": None,
                    "relatedNodes": [],
                    "edges": [],
                    "message": "Node not found"
                }
            
            source_node, project_id = node_info
            
            # Obtener las aristas del proyecto
            projects_col = self.mongodb.projects_collection
            project = await projects_col.find_one({"ProjectId": project_id})
            
            if not project:
                return {
                    "sourceNode": source_node.dict(),
                    "relatedNodes": [],
                    "edges": [],
                    "message": "Project not found"
                }
            
            # Filtrar aristas relevantes según dirección
            relevant_edges = []
            related_node_ids = set()
            
            for edge_doc in project.get("Edges", []):
                edge = GraphEdge(**edge_doc)
                
                # Filtrar por tipo de relación si se especifica
                if request.relationshipType and edge.Relationship != request.relationshipType:
                    continue
                
                # Filtrar por dirección
                if request.direction in ["outgoing", "both"] and edge.Source == request.nodeId:
                    relevant_edges.append(edge)
                    related_node_ids.add(edge.Target)
                
                if request.direction in ["incoming", "both"] and edge.Target == request.nodeId:
                    relevant_edges.append(edge)
                    related_node_ids.add(edge.Source)
            
            # Obtener los nodos relacionados
            related_nodes = []
            for node_doc in project.get("Nodes", []):
                if node_doc["_id"] in related_node_ids:  # CORREGIDO: usar _id en lugar de Id
                    related_nodes.append(GraphNode(**node_doc))
            
            return {
                "sourceNode": source_node.dict(),
                "relatedNodes": [n.dict() for n in related_nodes],
                "edges": [e.dict() for e in relevant_edges],
                "projectId": project_id,
                "totalRelated": len(related_nodes)
            }
            
        except Exception as e:
            logger.error(f"Error getting related nodes for {request.nodeId}: {e}")
            return {
                "sourceNode": None,
                "relatedNodes": [],
                "edges": [],
                "error": str(e)
            }
    
    # ============================================================================
    # CONSULTA ESPECIALIZADA PARA EL MCP
    # ============================================================================
    
    async def get_code_context(self, request: CodeContextRequest) -> CodeContextResponse:
        """
        Obtiene contexto de código para asistir al MCP en generación/modificación de código.
        Esta es una consulta de alto nivel que combina múltiples búsquedas.
        """
        try:
            main_element = None
            related_elements = []
            edges = []
            project_info = None
            suggestions = []
            
            # Estrategia 1: Búsqueda por className
            if request.className:
                search_req = SearchNodesRequest(
                    query=request.className,
                    nodeType="Class" if not request.methodName else None,
                    project=request.projectName,
                    namespace=request.namespace,
                    limit=5
                )
                nodes = await self.search_nodes(search_req)
                
                if nodes:
                    main_element = nodes[0]
                    
                    # Si también busca un método, buscar dentro de la clase
                    if request.methodName and main_element:
                        # Buscar métodos relacionados
                        related_req = GetRelatedNodesRequest(
                            nodeId=main_element.Id,
                            relationshipType="Contains",
                            direction="outgoing"
                        )
                        related_result = await self.get_related_nodes(related_req)
                        
                        # Filtrar por nombre de método
                        for node_dict in related_result.get("relatedNodes", []):
                            node = GraphNode(**node_dict)
                            if request.methodName.lower() in node.Name.lower() and node.Type == "Method":
                                main_element = node
                                break
            
            # Estrategia 2: Búsqueda por relativePath o absolutePath
            elif request.relativePath or request.absolutePath:
                # Buscar nodos que coincidan con el filepath
                projects_col = self.mongodb.projects_collection
                
                # Construir condición de búsqueda
                path_conditions = []
                if request.relativePath:
                    path_conditions.append({"Nodes.Location.RelativePath": {"$regex": request.relativePath, "$options": "i"}})
                if request.absolutePath:
                    path_conditions.append({"Nodes.Location.AbsolutePath": {"$regex": request.absolutePath, "$options": "i"}})
                
                pipeline = [
                    {"$unwind": "$Nodes"},
                    {"$match": {"$or": path_conditions}},
                    {"$limit": 10},
                    {"$replaceRoot": {"newRoot": "$Nodes"}}
                ]
                
                async for doc in projects_col.aggregate(pipeline):
                    node = GraphNode(**doc)
                    # Priorizar clases e interfaces, pero también permitir métodos
                    if not main_element and node.Type in ["Class", "Interface", "Method"]:
                        main_element = node
                    else:
                        related_elements.append(node)
            
            # Si encontramos elemento principal, obtener contexto relacionado
            if main_element and request.includeRelated:
                related_req = GetRelatedNodesRequest(
                    nodeId=main_element.Id,
                    direction="both",
                    maxDepth=1
                )
                related_result = await self.get_related_nodes(related_req)
                
                # Limitar elementos relacionados
                for node_dict in related_result.get("relatedNodes", [])[:request.maxRelated]:
                    related_elements.append(GraphNode(**node_dict))
                
                for edge_dict in related_result.get("edges", []):
                    edges.append(GraphEdge(**edge_dict))
                
                # Obtener información del proyecto
                project_id = related_result.get("projectId")
                if project_id:
                    project = await self.get_project_by_id(project_id, include_graph=False)
                    if project:
                        project_info = ProjectSummary(
                            MongoId=project.MongoId,
                            ProjectId=project.ProjectId,
                            ProjectName=project.ProjectName,
                            Layer=project.Layer,
                            NodeCount=project.NodeCount,
                            EdgeCount=project.EdgeCount,
                            LastProcessed=project.LastProcessed,
                            SourceFile=project.SourceFile
                        )
                
                # Generar sugerencias basadas en el contexto
                suggestions = self._generate_suggestions(main_element, related_elements, edges)
            
            return CodeContextResponse(
                found=main_element is not None,
                mainElement=main_element,
                relatedElements=related_elements,
                edges=edges,
                projectInfo=project_info,
                suggestions=suggestions
            )
            
        except Exception as e:
            logger.error(f"Error getting code context: {e}")
            return CodeContextResponse(found=False, suggestions=[f"Error: {str(e)}"])
    
    def _generate_suggestions(
        self, 
        main_element: GraphNode, 
        related: List[GraphNode], 
        edges: List[GraphEdge]
    ) -> List[str]:
        """Genera sugerencias basadas en el contexto del código."""
        suggestions = []
        
        # Sugerencias basadas en el tipo de elemento principal
        if main_element.Type == "Class":
            # Verificar si tiene métodos
            has_methods = any(n.Type == "Method" for n in related)
            if not has_methods:
                suggestions.append("Esta clase no tiene métodos públicos. Considera agregar métodos para exponer funcionalidad.")
            
            # Verificar si implementa interfaces
            implements = any(e.Relationship == "Implements" for e in edges if e.Source == main_element.Id)
            if implements:
                suggestions.append("Esta clase implementa interfaces. Asegúrate de implementar todos los miembros requeridos.")
        
        elif main_element.Type == "Method":
            # Verificar dependencias
            dependencies = [e for e in edges if e.Source == main_element.Id and e.Relationship == "Uses"]
            if len(dependencies) > 10:
                suggestions.append(f"Este método tiene {len(dependencies)} dependencias. Considera refactorizar para reducir acoplamiento.")
        
        # Sugerencias sobre el namespace
        if main_element.Namespace:
            suggestions.append(f"Namespace actual: {main_element.Namespace}. Mantén consistencia con otros elementos en este namespace.")
        
        return suggestions
    
    # ============================================================================
    # ESTADÍSTICAS
    # ============================================================================
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Obtiene estadísticas generales del grafo."""
        try:
            projects_col = self.mongodb.projects_collection
            
            total_projects = await projects_col.count_documents({})
            
            # Estadísticas agregadas
            pipeline = [
                {
                    "$group": {
                        "_id": None,
                        "totalNodes": {"$sum": "$NodeCount"},
                        "totalEdges": {"$sum": "$EdgeCount"},
                        "avgNodesPerProject": {"$avg": "$NodeCount"},
                        "avgEdgesPerProject": {"$avg": "$EdgeCount"}
                    }
                }
            ]
            
            stats = {
                "totalProjects": total_projects,
                "totalNodes": 0,
                "totalEdges": 0,
                "avgNodesPerProject": 0,
                "avgEdgesPerProject": 0
            }
            
            async for doc in projects_col.aggregate(pipeline):
                stats.update({
                    "totalNodes": doc.get("totalNodes", 0),
                    "totalEdges": doc.get("totalEdges", 0),
                    "avgNodesPerProject": round(doc.get("avgNodesPerProject", 0), 2),
                    "avgEdgesPerProject": round(doc.get("avgEdgesPerProject", 0), 2)
                })
            
            # Estadísticas por capa
            stats["projectsByLayer"] = await self.get_projects_by_layer()
            
            # Estadísticas del Semantic Model
            semantic_stats = await self.get_semantic_stats()
            if semantic_stats:
                stats["semantic"] = semantic_stats
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return {}
    
    # ============================================================================
    # CONSULTAS DE SEMANTIC MODEL
    # ============================================================================
    
    async def get_semantic_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas detalladas del Semantic Model."""
        try:
            projects_col = self.mongodb.projects_collection
            
            # Contar todos los edges por tipo de relación
            pipeline = [
                {"$unwind": "$Edges"},
                {"$group": {
                    "_id": "$Edges.Relationship",
                    "count": {"$sum": 1}
                }}
            ]
            
            relationship_counts = {}
            async for doc in projects_col.aggregate(pipeline):
                relationship_counts[doc["_id"]] = doc["count"]
            
            # Contar nodos con namespace completo
            nodes_pipeline = [
                {"$unwind": "$Nodes"},
                {"$match": {
                    "$or": [
                        {"Nodes.Type": "Class"},
                        {"Nodes.Type": "Interface"}
                    ]
                }},
                {"$group": {
                    "_id": "$Nodes.Type",
                    "withNamespace": {
                        "$sum": {
                            "$cond": [
                                {"$and": [
                                    {"$ne": ["$Nodes.Namespace", ""]},
                                    {"$ne": ["$Nodes.Namespace", None]}
                                ]},
                                1,
                                0
                            ]
                        }
                    },
                    "total": {"$sum": 1}
                }}
            ]
            
            node_stats = {}
            async for doc in projects_col.aggregate(nodes_pipeline):
                node_type = doc["_id"]
                node_stats[node_type] = {
                    "withNamespace": doc["withNamespace"],
                    "total": doc["total"]
                }
            
            # Construir respuesta
            stats = {
                "relationships": {
                    "Inherits": relationship_counts.get("Inherits", 0),
                    "Implements": relationship_counts.get("Implements", 0),
                    "Calls": relationship_counts.get("Calls", 0),
                    "Uses": relationship_counts.get("Uses", 0),
                    "Contains": relationship_counts.get("Contains", 0),
                    "Other": sum(v for k, v in relationship_counts.items() 
                               if k not in ["Inherits", "Implements", "Calls", "Uses", "Contains"])
                },
                "totalSemanticEdges": (
                    relationship_counts.get("Inherits", 0) +
                    relationship_counts.get("Implements", 0) +
                    relationship_counts.get("Calls", 0) +
                    relationship_counts.get("Uses", 0)
                ),
                "totalEdges": sum(relationship_counts.values()),
                "nodes": {
                    "classesWithNamespace": node_stats.get("Class", {}).get("withNamespace", 0),
                    "totalClasses": node_stats.get("Class", {}).get("total", 0),
                    "interfacesWithNamespace": node_stats.get("Interface", {}).get("withNamespace", 0),
                    "totalInterfaces": node_stats.get("Interface", {}).get("total", 0)
                }
            }
            
            logger.info(f"Calculated semantic stats: {stats['totalSemanticEdges']} semantic edges")
            return stats
            
        except Exception as e:
            logger.error(f"Error getting semantic stats: {e}")
            return {}
    
    async def get_inheritance_relationships(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Obtiene relaciones de herencia (Inherits)."""
        try:
            projects_col = self.mongodb.projects_collection
            
            pipeline = [
                {"$unwind": "$Edges"},
                {"$match": {"Edges.Relationship": "Inherits"}},
                {"$limit": limit},
                {"$project": {
                    "source": "$Edges.Source",
                    "target": "$Edges.Target",
                    "relationship": "$Edges.Relationship",
                    "projectId": "$ProjectId",
                    "projectName": "$ProjectName"
                }}
            ]
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                results.append({
                    "source": doc.get("source", ""),
                    "target": doc.get("target", ""),
                    "relationship": doc.get("relationship", ""),
                    "projectId": doc.get("projectId", ""),
                    "projectName": doc.get("projectName", "")
                })
            
            logger.info(f"Found {len(results)} inheritance relationships")
            return results
            
        except Exception as e:
            logger.error(f"Error getting inheritance relationships: {e}")
            return []
    
    async def get_implementation_relationships(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Obtiene relaciones de implementación de interfaces (Implements)."""
        try:
            projects_col = self.mongodb.projects_collection
            
            pipeline = [
                {"$unwind": "$Edges"},
                {"$match": {"Edges.Relationship": "Implements"}},
                {"$limit": limit},
                {"$project": {
                    "source": "$Edges.Source",
                    "target": "$Edges.Target",
                    "relationship": "$Edges.Relationship",
                    "projectId": "$ProjectId",
                    "projectName": "$ProjectName"
                }}
            ]
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                results.append({
                    "source": doc.get("source", ""),
                    "target": doc.get("target", ""),
                    "relationship": doc.get("relationship", ""),
                    "projectId": doc.get("projectId", ""),
                    "projectName": doc.get("projectName", "")
                })
            
            logger.info(f"Found {len(results)} implementation relationships")
            return results
            
        except Exception as e:
            logger.error(f"Error getting implementation relationships: {e}")
            return []
    
    async def get_method_calls(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Obtiene relaciones de llamadas a métodos (Calls)."""
        try:
            projects_col = self.mongodb.projects_collection
            
            pipeline = [
                {"$unwind": "$Edges"},
                {"$match": {"Edges.Relationship": "Calls"}},
                {"$limit": limit},
                {"$project": {
                    "source": "$Edges.Source",
                    "target": "$Edges.Target",
                    "relationship": "$Edges.Relationship",
                    "count": "$Edges.Count",
                    "projectId": "$ProjectId",
                    "projectName": "$ProjectName"
                }}
            ]
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                results.append({
                    "source": doc.get("source", ""),
                    "target": doc.get("target", ""),
                    "relationship": doc.get("relationship", ""),
                    "count": doc.get("count", 1),
                    "projectId": doc.get("projectId", ""),
                    "projectName": doc.get("projectName", "")
                })
            
            logger.info(f"Found {len(results)} method call relationships")
            return results
            
        except Exception as e:
            logger.error(f"Error getting method calls: {e}")
            return []
    
    async def get_type_usages(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Obtiene relaciones de uso de tipos (Uses)."""
        try:
            projects_col = self.mongodb.projects_collection
            
            pipeline = [
                {"$unwind": "$Edges"},
                {"$match": {"Edges.Relationship": "Uses"}},
                {"$limit": limit},
                {"$project": {
                    "source": "$Edges.Source",
                    "target": "$Edges.Target",
                    "relationship": "$Edges.Relationship",
                    "count": "$Edges.Count",
                    "projectId": "$ProjectId",
                    "projectName": "$ProjectName"
                }}
            ]
            
            results = []
            async for doc in projects_col.aggregate(pipeline):
                results.append({
                    "source": doc.get("source", ""),
                    "target": doc.get("target", ""),
                    "relationship": doc.get("relationship", ""),
                    "count": doc.get("count", 1),
                    "projectId": doc.get("projectId", ""),
                    "projectName": doc.get("projectName", "")
                })
            
            logger.info(f"Found {len(results)} type usage relationships")
            return results
            
        except Exception as e:
            logger.error(f"Error getting type usages: {e}")
            return []
    
    async def get_class_hierarchy(self, class_id: str, max_depth: int = 5) -> Dict[str, Any]:
        """Obtiene la jerarquía de herencia de una clase específica."""
        try:
            projects_col = self.mongodb.projects_collection
            
            # Buscar la clase
            class_pipeline = [
                {"$unwind": "$Nodes"},
                {"$match": {"Nodes.Id": class_id}},
                {"$limit": 1}
            ]
            
            class_node = None
            async for doc in projects_col.aggregate(class_pipeline):
                class_node = GraphNode(**doc["Nodes"])
                break
            
            if not class_node:
                return {
                    "found": False,
                    "message": f"Class {class_id} not found"
                }
            
            # Buscar ancestros (clases de las que hereda)
            ancestors = []
            current_id = class_id
            depth = 0
            
            while depth < max_depth:
                edge_pipeline = [
                    {"$unwind": "$Edges"},
                    {"$match": {
                        "Edges.Source": current_id,
                        "Edges.Relationship": "Inherits"
                    }},
                    {"$limit": 1}
                ]
                
                found_parent = False
                async for edge_doc in projects_col.aggregate(edge_pipeline):
                    parent_id = edge_doc["Edges"]["Target"]
                    
                    # Buscar información del padre
                    parent_pipeline = [
                        {"$unwind": "$Nodes"},
                        {"$match": {"Nodes.Id": parent_id}},
                        {"$limit": 1}
                    ]
                    
                    async for parent_doc in projects_col.aggregate(parent_pipeline):
                        parent_node = GraphNode(**parent_doc["Nodes"])
                        ancestors.append({
                            "id": parent_node.Id,
                            "name": parent_node.Name,
                            "fullName": parent_node.FullName,
                            "namespace": parent_node.Namespace,
                            "depth": depth + 1
                        })
                        current_id = parent_id
                        found_parent = True
                        break
                    
                    break
                
                if not found_parent:
                    break
                
                depth += 1
            
            # Buscar descendientes (clases que heredan de esta)
            descendants_pipeline = [
                {"$unwind": "$Edges"},
                {"$match": {
                    "Edges.Target": class_id,
                    "Edges.Relationship": "Inherits"
                }},
                {"$limit": 50}
            ]
            
            descendants = []
            async for edge_doc in projects_col.aggregate(descendants_pipeline):
                child_id = edge_doc["Edges"]["Source"]
                
                # Buscar información del hijo
                child_pipeline = [
                    {"$unwind": "$Nodes"},
                    {"$match": {"Nodes.Id": child_id}},
                    {"$limit": 1}
                ]
                
                async for child_doc in projects_col.aggregate(child_pipeline):
                    child_node = GraphNode(**child_doc["Nodes"])
                    descendants.append({
                        "id": child_node.Id,
                        "name": child_node.Name,
                        "fullName": child_node.FullName,
                        "namespace": child_node.Namespace
                    })
                    break
            
            return {
                "found": True,
                "class": {
                    "id": class_node.Id,
                    "name": class_node.Name,
                    "fullName": class_node.FullName,
                    "namespace": class_node.Namespace,
                    "isAbstract": class_node.IsAbstract,
                    "isSealed": class_node.IsSealed
                },
                "ancestors": ancestors,
                "descendants": descendants,
                "hierarchyDepth": len(ancestors)
            }
            
        except Exception as e:
            logger.error(f"Error getting class hierarchy for {class_id}: {e}")
            return {"found": False, "error": str(e)}
    
    async def get_interface_implementations(self, interface_id: str) -> Dict[str, Any]:
        """Obtiene todas las implementaciones de una interfaz."""
        try:
            projects_col = self.mongodb.projects_collection
            
            # Buscar la interfaz
            interface_pipeline = [
                {"$unwind": "$Nodes"},
                {"$match": {"Nodes.Id": interface_id}},
                {"$limit": 1}
            ]
            
            interface_node = None
            async for doc in projects_col.aggregate(interface_pipeline):
                interface_node = GraphNode(**doc["Nodes"])
                break
            
            if not interface_node:
                return {
                    "found": False,
                    "message": f"Interface {interface_id} not found"
                }
            
            # Buscar todas las clases que implementan esta interfaz
            implementations_pipeline = [
                {"$unwind": "$Edges"},
                {"$match": {
                    "Edges.Target": interface_id,
                    "Edges.Relationship": "Implements"
                }}
            ]
            
            implementations = []
            async for edge_doc in projects_col.aggregate(implementations_pipeline):
                impl_id = edge_doc["Edges"]["Source"]
                project_id = edge_doc.get("ProjectId", "")
                
                # Buscar información de la clase implementadora
                impl_pipeline = [
                    {"$unwind": "$Nodes"},
                    {"$match": {"Nodes.Id": impl_id}},
                    {"$limit": 1}
                ]
                
                async for impl_doc in projects_col.aggregate(impl_pipeline):
                    impl_node = GraphNode(**impl_doc["Nodes"])
                    implementations.append({
                        "id": impl_node.Id,
                        "name": impl_node.Name,
                        "fullName": impl_node.FullName,
                        "namespace": impl_node.Namespace,
                        "projectId": project_id,
                        "isAbstract": impl_node.IsAbstract
                    })
                    break
            
            return {
                "found": True,
                "interface": {
                    "id": interface_node.Id,
                    "name": interface_node.Name,
                    "fullName": interface_node.FullName,
                    "namespace": interface_node.Namespace
                },
                "implementations": implementations,
                "implementationCount": len(implementations)
            }
            
        except Exception as e:
            logger.error(f"Error getting interface implementations for {interface_id}: {e}")
            return {"found": False, "error": str(e)}

