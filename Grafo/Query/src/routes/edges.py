"""
Endpoints relacionados con aristas (relaciones) del grafo.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from ..models import GraphEdge, GetRelatedNodesRequest
from ..services import GraphQueryService

router = APIRouter(prefix="/edges", tags=["Edges"])


def get_graph_service() -> GraphQueryService:
    """Dependency placeholder - será reemplazado por el servidor."""
    raise RuntimeError("Graph service not configured")


@router.get("/project/{project_id}", response_model=List[GraphEdge])
async def get_edges_by_project(
    project_id: str,
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Obtiene todas las aristas de un proyecto."""
    edges = await graph_service.get_edges_by_project(project_id)
    return edges


@router.post("/related")
async def get_related_nodes(
    request: GetRelatedNodesRequest,
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """Obtiene nodos relacionados a un nodo específico."""
    result = await graph_service.get_related_nodes(request)
    
    if not result.get("sourceNode"):
        raise HTTPException(status_code=404, detail=f"Node {request.nodeId} not found")
    
    return result

