"""
Endpoints relacionados con proyectos.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from ..models import ProjectSummary, ProjectInfo, SearchProjectsRequest
from ..services import GraphQueryService

router = APIRouter(prefix="/projects", tags=["Projects"])

# Esta función será reemplazada por el servidor para inyectar el servicio real
def get_graph_service() -> GraphQueryService:
    """Dependency placeholder - será reemplazado por el servidor."""
    raise RuntimeError("Graph service not configured")


@router.get("/", response_model=List[ProjectSummary])
async def get_all_projects(
    limit: int = Query(default=100, ge=1, le=500),
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Obtiene lista de todos los proyectos."""
    projects = await graph_service.get_all_projects(limit=limit)
    return projects


@router.post("/search", response_model=List[ProjectSummary])
async def search_projects(
    request: SearchProjectsRequest,
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Busca proyectos por nombre o capa arquitectónica."""
    results = await graph_service.search_projects(request)
    return results


@router.get("/{project_id}", response_model=ProjectInfo)
async def get_project_by_id(
    project_id: str,
    include_graph: bool = Query(default=False, description="Incluir nodos y aristas"),
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Obtiene un proyecto específico por ID."""
    project = await graph_service.get_project_by_id(project_id, include_graph=include_graph)
    
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    
    return project


@router.get("/layers/statistics")
async def get_layer_statistics(
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """Obtiene estadísticas de proyectos por capa arquitectónica."""
    stats = await graph_service.get_projects_by_layer()
    return {"layers": stats}

