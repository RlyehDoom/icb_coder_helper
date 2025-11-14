"""
Endpoints relacionados con nodos del grafo.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from ..models import GraphNode, SearchNodesRequest
from ..services import GraphQueryService

router = APIRouter(prefix="/nodes", tags=["Nodes"])


def get_graph_service() -> GraphQueryService:
    """Dependency placeholder - será reemplazado por el servidor."""
    raise RuntimeError("Graph service not configured")


@router.post("/search", response_model=List[GraphNode])
async def search_nodes(
    request: SearchNodesRequest,
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Busca nodos en el grafo por criterios."""
    results = await graph_service.search_nodes(request)
    return results


@router.get("/{node_id}", response_model=GraphNode)
async def get_node_by_id(
    node_id: str,
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Obtiene un nodo específico por su ID."""
    result = await graph_service.get_node_by_id(node_id)
    
    if not result:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    
    node, project_id = result
    return node


@router.get("/project/{project_id}", response_model=List[GraphNode])
async def get_nodes_by_project(
    project_id: str,
    node_type: Optional[str] = Query(None, description="Filtrar por tipo de nodo"),
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Obtiene todos los nodos de un proyecto específico."""
    nodes = await graph_service.get_nodes_by_project(project_id, node_type=node_type)
    return nodes

