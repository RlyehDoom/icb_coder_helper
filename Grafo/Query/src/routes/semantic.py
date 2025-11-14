"""
Endpoints especializados para consultas del Semantic Model.
Permite consultar relaciones semánticas como herencias, implementaciones,
llamadas a métodos y usos de tipos.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any
from ..models import (
    SemanticRelationshipRequest,
    ClassHierarchyRequest,
    InterfaceImplementationsRequest
)
from ..services import GraphQueryService

router = APIRouter(prefix="/semantic", tags=["Semantic Model"])


def get_graph_service() -> GraphQueryService:
    """Dependency placeholder - será reemplazado por el servidor."""
    raise RuntimeError("Graph service not configured")


@router.get("/stats", summary="Estadísticas del Semantic Model")
async def get_semantic_stats(
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene estadísticas completas del Semantic Model.
    
    Retorna conteos de:
    - Relaciones de herencia (Inherits)
    - Implementaciones de interfaces (Implements)
    - Llamadas a métodos (Calls)
    - Usos de tipos (Uses)
    - Nodos con namespace completo
    """
    stats = await graph_service.get_semantic_stats()
    
    if not stats:
        raise HTTPException(status_code=500, detail="Error calculating semantic statistics")
    
    return stats


@router.get("/inherits", summary="Relaciones de herencia")
async def get_inheritance_relationships(
    limit: int = Query(default=100, ge=1, le=500, description="Límite de resultados"),
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene relaciones de herencia (Inherits).
    
    Retorna pares de source → target donde source hereda de target.
    """
    relationships = await graph_service.get_inheritance_relationships(limit=limit)
    
    return {
        "relationshipType": "Inherits",
        "count": len(relationships),
        "relationships": relationships
    }


@router.get("/implements", summary="Implementaciones de interfaces")
async def get_implementation_relationships(
    limit: int = Query(default=100, ge=1, le=500, description="Límite de resultados"),
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene relaciones de implementación de interfaces (Implements).
    
    Retorna pares de source → target donde source implementa la interfaz target.
    """
    relationships = await graph_service.get_implementation_relationships(limit=limit)
    
    return {
        "relationshipType": "Implements",
        "count": len(relationships),
        "relationships": relationships
    }


@router.get("/calls", summary="Llamadas a métodos")
async def get_method_calls(
    limit: int = Query(default=100, ge=1, le=500, description="Límite de resultados"),
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene relaciones de llamadas a métodos (Calls).
    
    Retorna pares de source → target donde source llama al método target.
    Incluye el conteo de llamadas si está disponible.
    """
    relationships = await graph_service.get_method_calls(limit=limit)
    
    return {
        "relationshipType": "Calls",
        "count": len(relationships),
        "relationships": relationships
    }


@router.get("/uses", summary="Usos de tipos")
async def get_type_usages(
    limit: int = Query(default=100, ge=1, le=500, description="Límite de resultados"),
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene relaciones de uso de tipos (Uses).
    
    Retorna pares de source → target donde source usa el tipo target
    (como parámetro, variable local, retorno, etc.).
    """
    relationships = await graph_service.get_type_usages(limit=limit)
    
    return {
        "relationshipType": "Uses",
        "count": len(relationships),
        "relationships": relationships
    }


@router.post("/hierarchy", summary="Jerarquía de herencia de una clase")
async def get_class_hierarchy(
    request: ClassHierarchyRequest,
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene la jerarquía completa de herencia de una clase.
    
    Retorna:
    - Información de la clase
    - Ancestros (clases de las que hereda)
    - Descendientes (clases que heredan de esta)
    - Profundidad de la jerarquía
    """
    result = await graph_service.get_class_hierarchy(
        class_id=request.classId,
        max_depth=request.maxDepth
    )
    
    if not result.get("found"):
        raise HTTPException(
            status_code=404,
            detail=result.get("message", f"Class {request.classId} not found")
        )
    
    return result


@router.post("/implementations", summary="Implementaciones de una interfaz")
async def get_interface_implementations(
    request: InterfaceImplementationsRequest,
    graph_service: GraphQueryService = Depends(get_graph_service)
) -> Dict[str, Any]:
    """
    Obtiene todas las clases que implementan una interfaz específica.
    
    Retorna:
    - Información de la interfaz
    - Lista de todas las clases implementadoras
    - Conteo de implementaciones
    """
    result = await graph_service.get_interface_implementations(
        interface_id=request.interfaceId
    )
    
    if not result.get("found"):
        raise HTTPException(
            status_code=404,
            detail=result.get("message", f"Interface {request.interfaceId} not found")
        )
    
    return result

