"""
Endpoints para estadísticas semánticas usando schema v2.1.
Consulta colecciones versionadas: nodes_{version}
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any
from ..services.nodes_query_service import NodesQueryService
from ..services import get_mongodb_service
from ..config import GRAFO_DEFAULT_VERSION

router = APIRouter(prefix="/semantic", tags=["Semantic Stats v2.1"])


def get_nodes_service() -> NodesQueryService:
    """Get NodesQueryService instance."""
    return NodesQueryService(get_mongodb_service())


@router.get("/stats", summary="Estadísticas semánticas v2.1")
async def get_semantic_stats(
    version: str = Query(default=None, description="Graph version (default from config)")
) -> Dict[str, Any]:
    """
    Estadísticas de relaciones semánticas del grafo.

    Retorna conteos de: Calls, CallsVia, Implements, Inherits, Uses, Contains
    """
    service = get_nodes_service()
    ver = version or GRAFO_DEFAULT_VERSION

    if not await service.check_version_exists(ver):
        raise HTTPException(status_code=404, detail=f"Version {ver} not found")

    stats = await service.get_semantic_stats(ver)

    if "error" in stats:
        raise HTTPException(status_code=500, detail=stats["error"])

    return stats
