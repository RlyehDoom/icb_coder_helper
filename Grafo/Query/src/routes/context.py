"""
Endpoints especializados para el MCP - Contexto de código.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from ..models import CodeContextRequest, CodeContextResponse
from ..services import GraphQueryService

router = APIRouter(prefix="/context", tags=["Code Context (MCP)"])


def get_graph_service() -> GraphQueryService:
    """Dependency placeholder - será reemplazado por el servidor."""
    raise RuntimeError("Graph service not configured")


@router.post("/code", response_model=CodeContextResponse)
async def get_code_context(
    request: CodeContextRequest,
    graph_service: GraphQueryService = Depends(get_graph_service)
):
    """
    Obtiene contexto de código para asistir al MCP.
    
    Este endpoint está diseñado específicamente para ser consumido por el MCP
    cuando necesita información del grafo para:
    - Crear nuevo código
    - Modificar código existente
    - Entender dependencias
    - Sugerir mejores prácticas
    """
    result = await graph_service.get_code_context(request)
    return result


@router.get("/statistics")
async def get_statistics(
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """Obtiene estadísticas generales del grafo."""
    stats = await graph_service.get_statistics()
    return stats

