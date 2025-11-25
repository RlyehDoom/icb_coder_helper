"""
Servicio principal para consultas de grafo de código.
Proporciona métodos de alto nivel para el MCP y otras aplicaciones.
"""
import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from bson import ObjectId
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
                    "SourceFile": 1, "ProcessingStateId": 1
                }
            ).limit(limit)

            results = []
            async for doc in cursor:
                # Get version from ProcessingState if ProcessingStateId exists
                version = None
                if doc.get("ProcessingStateId"):
                    states_col = self.mongodb.states_collection
                    state = await states_col.find_one({"_id": doc["ProcessingStateId"]})
                    if state:
                        version = state.get("Version")

                results.append(ProjectSummary(
                    MongoId=str(doc.get("_id", "")),
                    ProjectId=doc.get("ProjectId", ""),
                    ProjectName=doc.get("ProjectName", ""),
                    Layer=doc.get("Layer", ""),
                    NodeCount=doc.get("NodeCount", 0),
                    EdgeCount=doc.get("EdgeCount", 0),
                    LastProcessed=doc.get("LastProcessed", datetime.utcnow()),
                    SourceFile=doc.get("SourceFile", ""),
                    Version=version
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

            # Filter by version using ProcessingState relationship
            processing_state_id = None
            if request.version:
                states_col = self.mongodb.states_collection
                state = await states_col.find_one({"Version": request.version})
                if state:
                    # Mantener como ObjectId para coincidir con el tipo en MongoDB
                    processing_state_id = state["_id"]
                    query["ProcessingStateId"] = processing_state_id
                else:
                    # No processing state found for this version, return empty
                    logger.warning(f"No processing state found for version: {request.version}")
                    return []

            projects_col = self.mongodb.projects_collection
            cursor = projects_col.find(
                query,
                {
                    "ProjectId": 1, "ProjectName": 1, "Layer": 1,
                    "NodeCount": 1, "EdgeCount": 1, "LastProcessed": 1,
                    "SourceFile": 1, "ProcessingStateId": 1
                }
            ).limit(request.limit)

            results = []
            async for doc in cursor:
                # Get version from ProcessingState if ProcessingStateId exists
                version = None
                if doc.get("ProcessingStateId"):
                    states_col = self.mongodb.states_collection
                    state = await states_col.find_one({"_id": doc["ProcessingStateId"]})
                    if state:
                        version = state.get("Version")

                results.append(ProjectSummary(
                    MongoId=str(doc.get("_id", "")),
                    ProjectId=doc.get("ProjectId", ""),
                    ProjectName=doc.get("ProjectName", ""),
                    Layer=doc.get("Layer", ""),
                    NodeCount=doc.get("NodeCount", 0),
                    EdgeCount=doc.get("EdgeCount", 0),
                    LastProcessed=doc.get("LastProcessed", datetime.utcnow()),
                    SourceFile=doc.get("SourceFile", ""),
                    Version=version
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

            # Convertir ProcessingStateId de ObjectId a string si existe
            if "ProcessingStateId" in doc and doc["ProcessingStateId"] is not None:
                doc["ProcessingStateId"] = str(doc["ProcessingStateId"])

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
        """
        Busca nodos en el grafo por criterios.

        COMPORTAMIENTO MEJORADO:
        - Primero busca matches EXACTOS (nombre exacto, case-insensitive)
        - Si hay matches exactos, retorna SOLO esos (evita retornar ProcessMessageIn cuando busca ProcessMessage)
        - Si NO hay matches exactos, usa búsqueda parcial (tipo LIKE)
        """
        try:
            projects_col = self.mongodb.projects_collection

            # Construir condiciones a nivel de documento (no del array Nodes)
            doc_conditions = []

            if request.project:
                doc_conditions.append({"ProjectId": request.project})

            # Filter by version using ProcessingState relationship
            processing_state_id = None
            if request.version:
                states_col = self.mongodb.states_collection
                state = await states_col.find_one({"Version": request.version})
                if state:
                    processing_state_id = state["_id"]
                    doc_conditions.append({"ProcessingStateId": processing_state_id})
                else:
                    logger.warning(f"No processing state found for version: {request.version}")
                    return []

            # Construir condiciones para el array Nodes (deben aplicar al MISMO elemento)
            def build_node_conditions(name_condition: dict, exact_namespace: bool = True) -> dict:
                """Construye condiciones $elemMatch para que apliquen al mismo nodo."""
                node_conds = [name_condition]
                if request.nodeType:
                    node_conds.append({"Type": request.nodeType})
                if request.namespace:
                    if exact_namespace:
                        # Búsqueda exacta: namespace termina con el valor o es exacto
                        # Ej: "Geolocation" matchea "Infocorp.Banking.Geolocation" pero NO "GeolocationService"
                        ns_exact = f"(^|\\.){request.namespace}$"
                        node_conds.append({"Namespace": {"$regex": ns_exact, "$options": "i"}})
                    else:
                        # Búsqueda parcial
                        node_conds.append({"Namespace": {"$regex": request.namespace, "$options": "i"}})

                if len(node_conds) == 1:
                    return {"Nodes": {"$elemMatch": node_conds[0]}}
                return {"Nodes": {"$elemMatch": {"$and": node_conds}}}

            # PASO 1: Intentar búsqueda EXACTA primero (nombre exacto + namespace exacto)
            exact_query = f"^{request.query}$"  # Regex para match exacto del nombre
            exact_name_cond = {"Name": {"$regex": exact_query, "$options": "i"}}
            exact_elem_match = build_node_conditions(exact_name_cond, exact_namespace=True)

            # Pipeline para búsqueda exacta
            exact_doc_match = [exact_elem_match] + doc_conditions
            exact_node_match = {"Name": {"$regex": exact_query, "$options": "i"}}
            if request.nodeType:
                exact_node_match["Type"] = request.nodeType
            if request.namespace:
                # Namespace exacto: debe terminar con el valor (ej: ".Geolocation" o ser exacto)
                ns_exact = f"(^|\\.){request.namespace}$"
                exact_node_match["Namespace"] = {"$regex": ns_exact, "$options": "i"}

            # Después del $unwind, Nodes ya no es array, usar match directo
            post_unwind_exact = {f"Nodes.{k}": v for k, v in exact_node_match.items()}
            exact_pipeline = [
                {"$match": {"$and": exact_doc_match} if len(exact_doc_match) > 1 else exact_doc_match[0]},
                {"$unwind": "$Nodes"},
                {"$match": post_unwind_exact},
                {"$limit": request.limit},
                {"$replaceRoot": {"newRoot": "$Nodes"}}
            ]

            exact_results = []
            async for doc in projects_col.aggregate(exact_pipeline):
                try:
                    node = GraphNode(**doc)
                    exact_results.append(node)
                except Exception as e:
                    logger.warning(f"Error parsing node (exact): {e}")
                    continue

            # Si encontramos matches exactos, retornamos SOLO esos
            if exact_results:
                logger.info(f"Found {len(exact_results)} EXACT matches for '{request.query}'")
                return exact_results

            # PASO 2: Si no hay matches exactos, hacer búsqueda parcial (tipo LIKE)
            logger.info(f"No exact matches for '{request.query}', falling back to partial search")

            # Para búsqueda parcial, buscar en Name, FullName, o Id
            partial_name_cond = {
                "$or": [
                    {"Name": {"$regex": request.query, "$options": "i"}},
                    {"FullName": {"$regex": request.query, "$options": "i"}},
                    {"Id": {"$regex": request.query, "$options": "i"}}
                ]
            }

            # Construir condiciones para partial search
            partial_node_conds = [partial_name_cond]
            if request.nodeType:
                partial_node_conds.append({"Type": request.nodeType})
            if request.namespace:
                partial_node_conds.append({"Namespace": {"$regex": request.namespace, "$options": "i"}})

            partial_elem_match = {"Nodes": {"$elemMatch": {"$and": partial_node_conds} if len(partial_node_conds) > 1 else partial_node_conds[0]}}
            partial_doc_match = [partial_elem_match] + doc_conditions

            # Post-unwind match para partial
            post_unwind_partial = {}
            post_unwind_partial["$or"] = [
                {"Nodes.Name": {"$regex": request.query, "$options": "i"}},
                {"Nodes.FullName": {"$regex": request.query, "$options": "i"}},
                {"Nodes.Id": {"$regex": request.query, "$options": "i"}}
            ]
            if request.nodeType:
                post_unwind_partial["Nodes.Type"] = request.nodeType
            if request.namespace:
                post_unwind_partial["Nodes.Namespace"] = {"$regex": request.namespace, "$options": "i"}

            # Wrap conditions properly
            if request.nodeType or request.namespace:
                post_unwind_partial = {"$and": [
                    {"$or": [
                        {"Nodes.Name": {"$regex": request.query, "$options": "i"}},
                        {"Nodes.FullName": {"$regex": request.query, "$options": "i"}},
                        {"Nodes.Id": {"$regex": request.query, "$options": "i"}}
                    ]}
                ] + (
                    [{"Nodes.Type": request.nodeType}] if request.nodeType else []
                ) + (
                    [{"Nodes.Namespace": {"$regex": request.namespace, "$options": "i"}}] if request.namespace else []
                )}

            partial_pipeline = [
                {"$match": {"$and": partial_doc_match} if len(partial_doc_match) > 1 else partial_doc_match[0]},
                {"$unwind": "$Nodes"},
                {"$match": post_unwind_partial},
                {"$limit": request.limit},
                {"$replaceRoot": {"newRoot": "$Nodes"}}
            ]

            results = []
            async for doc in projects_col.aggregate(partial_pipeline):
                try:
                    node = GraphNode(**doc)
                    results.append(node)
                except Exception as e:
                    logger.warning(f"Error parsing node (partial): {e}")
                    continue

            logger.info(f"Found {len(results)} partial matches for '{request.query}'")
            return results

        except Exception as e:
            logger.error(f"Error searching nodes: {e}")
            return []
    
    async def get_node_by_id(self, node_id: str) -> Optional[Tuple[GraphNode, str, str]]:
        """
        Obtiene un nodo específico por su ID.
        Retorna tupla (nodo, project_id, mongo_doc_id) o None si no se encuentra.
        El mongo_doc_id es el _id del documento de MongoDB para queries exactas.
        """
        try:
            projects_col = self.mongodb.projects_collection

            pipeline = [
                {"$unwind": "$Nodes"},
                {"$match": {"Nodes._id": node_id}},  # CORREGIDO: usar _id en lugar de Id
                {"$project": {
                    "node": "$Nodes",
                    "projectId": "$ProjectId",
                    "mongoDocId": {"$toString": "$_id"}
                }},
                {"$limit": 1}
            ]

            async for doc in projects_col.aggregate(pipeline):
                node = GraphNode(**doc["node"])
                project_id = doc["projectId"]
                mongo_doc_id = doc["mongoDocId"]
                return (node, project_id, mongo_doc_id)
            
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

            source_node, project_id, mongo_doc_id = node_info

            # Obtener el proyecto exacto usando MongoDB _id para garantizar version correcta
            projects_col = self.mongodb.projects_collection
            project = await projects_col.find_one({"_id": ObjectId(mongo_doc_id)})
            
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

        OPTIMIZADO v2: Usa el campo ContainingType para búsqueda directa de métodos por clase,
        eliminando las heurísticas de namespace y reduciendo consultas.
        """
        try:
            main_element = None
            related_elements = []
            edges = []
            project_info = None
            suggestions = []

            # Estrategia 1: Búsqueda por className
            if request.className:
                # Si busca método + clase, usar ContainingType para búsqueda directa
                if request.methodName:
                    logger.info(f"🔍 Buscando método '{request.methodName}' en clase '{request.className}' usando ContainingType")

                    # Búsqueda directa usando ContainingType (una sola consulta optimizada)
                    method_result = await self._search_method_by_containing_type(
                        method_name=request.methodName,
                        class_name=request.className,
                        project=request.projectName,
                        namespace=request.namespace,
                        version=request.version
                    )

                    if method_result:
                        main_element = method_result["class"]
                        found_method = method_result["method"]
                        logger.info(f"✅ Encontrado método '{found_method.Name}' en clase '{main_element.Name}' (ContainingType: {found_method.ContainingType})")

                        if method_result.get("alternatives"):
                            suggestions.append(f"ℹ️ Se encontraron {len(method_result['alternatives'])} coincidencias adicionales")
                            for alt in method_result["alternatives"][:3]:
                                alt_method = alt.get("method")
                                if alt_method:
                                    suggestions.append(f"  - {alt_method.Name} en {alt_method.ContainingType or 'N/A'} (proyecto: {alt.get('projectName', 'N/A')})")
                    else:
                        # Fallback: buscar solo la clase si no se encontró el método
                        logger.warning(f"⚠️ No se encontró método '{request.methodName}' con ContainingType que coincida con '{request.className}'")

                        class_search_req = SearchNodesRequest(
                            query=request.className,
                            nodeType="Class",
                            project=request.projectName,
                            namespace=request.namespace,
                            version=request.version,
                            limit=5
                        )
                        class_candidates = await self.search_nodes(class_search_req)

                        if class_candidates:
                            main_element = class_candidates[0]
                            suggestions.append(f"⚠️ Método '{request.methodName}' no encontrado en clase '{request.className}'")
                            suggestions.append(f"Retornando clase: {main_element.FullName} (proyecto: {main_element.Project})")

                            if len(class_candidates) > 1:
                                suggestions.append(f"\nℹ️ Otras clases '{request.className}' encontradas:")
                                for i, cls in enumerate(class_candidates[1:5], 2):
                                    suggestions.append(f"  {i}. {cls.Namespace} (proyecto: {cls.Project})")
                        else:
                            suggestions.append(f"❌ No se encontró clase '{request.className}'")

                else:
                    # Solo busca clase (sin método)
                    search_req = SearchNodesRequest(
                        query=request.className,
                        nodeType="Class",
                        project=request.projectName,
                        namespace=request.namespace,
                        version=request.version,
                        limit=5
                    )
                    nodes = await self.search_nodes(search_req)

                    if nodes:
                        if len(nodes) > 1:
                            logger.warning(f"⚠️ Múltiples clases '{request.className}' encontradas ({len(nodes)}). Usando la primera.")
                            for i, n in enumerate(nodes):
                                logger.warning(f"  {i+1}. {n.FullName} en {n.Namespace}")
                        main_element = nodes[0]
            
            # Estrategia 2: Búsqueda por relativePath o absolutePath
            elif request.relativePath or request.absolutePath:
                # Buscar nodos que coincidan con el filepath
                projects_col = self.mongodb.projects_collection

                # Filter by version using ProcessingState relationship
                version_filter = {}
                if request.version:
                    states_col = self.mongodb.states_collection
                    state = await states_col.find_one({"Version": request.version})
                    if state:
                        # Mantener como ObjectId para coincidir con el tipo en MongoDB
                        processing_state_id = state["_id"]
                        version_filter = {"ProcessingStateId": processing_state_id}
                    else:
                        # No processing state found for this version, return empty
                        logger.warning(f"No processing state found for version: {request.version}")
                        # Continue but won't find any results
                        version_filter = {"ProcessingStateId": ObjectId("000000000000000000000000")}

                # Construir condición de búsqueda
                path_conditions = []
                if request.relativePath:
                    path_conditions.append({"Nodes.Location.RelativePath": {"$regex": request.relativePath, "$options": "i"}})
                if request.absolutePath:
                    path_conditions.append({"Nodes.Location.AbsolutePath": {"$regex": request.absolutePath, "$options": "i"}})

                # Construir pipeline con filtro de versión opcional
                match_stage = {"$or": path_conditions}

                # Combine version filter and path conditions at document level
                document_filter = {**version_filter}
                if document_filter:
                    pipeline = [
                        {"$match": document_filter},
                        {"$unwind": "$Nodes"},
                        {"$match": match_stage},
                        {"$limit": 10},
                        {"$replaceRoot": {"newRoot": "$Nodes"}}
                    ]
                else:
                    pipeline = [
                        {"$unwind": "$Nodes"},
                        {"$match": match_stage},
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
                        # Obtener Version desde ProcessingState si existe
                        version = None
                        if project.ProcessingStateId:
                            try:
                                states_col = self.mongodb.states_collection
                                state = await states_col.find_one({"_id": project.ProcessingStateId})
                                if state:
                                    version = state.get("Version")
                            except Exception as e:
                                logger.debug(f"No se pudo obtener Version desde ProcessingState: {e}")

                        project_info = ProjectSummary(
                            MongoId=project.MongoId,
                            ProjectId=project.ProjectId,
                            ProjectName=project.ProjectName,
                            Layer=project.Layer,
                            NodeCount=project.NodeCount,
                            EdgeCount=project.EdgeCount,
                            LastProcessed=project.LastProcessed,
                            SourceFile=project.SourceFile,
                            Version=version
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

    async def _search_method_by_containing_type(
        self,
        method_name: str,
        class_name: str,
        project: Optional[str] = None,
        namespace: Optional[str] = None,
        version: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Busca un método usando el campo ContainingType para asociación directa con su clase.

        Esta búsqueda es mucho más eficiente que la heurística anterior basada en namespaces
        porque usa un campo indexado directamente en MongoDB.

        Returns:
            Dict con keys: 'method', 'class', 'alternatives' (si hay múltiples coincidencias)
            None si no se encuentra el método
        """
        try:
            projects_col = self.mongodb.projects_collection

            # Construir condiciones de búsqueda
            match_conditions = [
                {"Nodes.Name": {"$regex": f"^{method_name}$", "$options": "i"}},
                {"Nodes.Type": "Method"},
                # ContainingType debe contener el nombre de la clase
                {"Nodes.ContainingType": {"$regex": class_name, "$options": "i"}}
            ]

            # Filtro por proyecto si se especifica
            if project:
                match_conditions.append({"ProjectId": project})

            # Filtro por versión usando ProcessingState
            if version:
                states_col = self.mongodb.states_collection
                state = await states_col.find_one({"Version": version})
                if state:
                    match_conditions.append({"ProcessingStateId": state["_id"]})
                else:
                    logger.warning(f"No processing state found for version: {version}")
                    return None

            # Pipeline optimizado: busca métodos con ContainingType que coincida
            pipeline = [
                {"$match": {"$and": match_conditions}},
                {"$unwind": "$Nodes"},
                {"$match": {
                    "$and": [
                        {"Nodes.Name": {"$regex": f"^{method_name}$", "$options": "i"}},
                        {"Nodes.Type": "Method"},
                        {"Nodes.ContainingType": {"$regex": class_name, "$options": "i"}}
                    ]
                }},
                {"$limit": 10},
                {"$project": {
                    "method": "$Nodes",
                    "projectId": "$ProjectId",
                    "projectName": "$ProjectName"
                }}
            ]

            results = []
            async for doc in projects_col.aggregate(pipeline):
                try:
                    method_node = GraphNode(**doc["method"])
                    results.append({
                        "method": method_node,
                        "projectId": doc.get("projectId", ""),
                        "projectName": doc.get("projectName", "")
                    })
                except Exception as e:
                    logger.warning(f"Error parsing method node: {e}")
                    continue

            if not results:
                logger.info(f"No se encontró método '{method_name}' con ContainingType que contenga '{class_name}'")
                return None

            logger.info(f"Encontrados {len(results)} método(s) '{method_name}' en clases que coinciden con '{class_name}'")

            # Buscar la clase correspondiente al primer método encontrado
            best_match = results[0]
            containing_type = best_match["method"].ContainingType

            if containing_type:
                # Buscar la clase usando el ContainingType exacto
                class_pipeline = [
                    {"$unwind": "$Nodes"},
                    {"$match": {
                        "Nodes.FullName": containing_type,
                        "Nodes.Type": {"$in": ["Class", "Interface"]}
                    }},
                    {"$limit": 1},
                    {"$replaceRoot": {"newRoot": "$Nodes"}}
                ]

                class_node = None
                async for doc in projects_col.aggregate(class_pipeline):
                    try:
                        class_node = GraphNode(**doc)
                        break
                    except Exception as e:
                        logger.warning(f"Error parsing class node: {e}")

                if class_node:
                    return {
                        "method": best_match["method"],
                        "class": class_node,
                        "alternatives": results[1:] if len(results) > 1 else None
                    }
                else:
                    logger.warning(f"No se encontró clase con FullName='{containing_type}'")

            # Fallback: retornar método sin clase asociada
            # Crear un GraphNode sintético para la clase basándose en ContainingType
            if containing_type:
                synthetic_class = GraphNode(
                    Id=f"component:{containing_type}",
                    Name=containing_type.split(".")[-1] if "." in containing_type else containing_type,
                    FullName=containing_type,
                    Type="Class",
                    Project=best_match.get("projectName", ""),
                    Namespace=".".join(containing_type.split(".")[:-1]) if "." in containing_type else ""
                )
                return {
                    "method": best_match["method"],
                    "class": synthetic_class,
                    "alternatives": results[1:] if len(results) > 1 else None
                }

            return None

        except Exception as e:
            logger.error(f"Error searching method by ContainingType: {e}")
            return None

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

