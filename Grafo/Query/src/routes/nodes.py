"""
API routes for nodes queries (v2.1 schema with versioned collections).
Collection: nodes_{version} (e.g., nodes_6_5_0, nodes_6_7_5)
"""
from fastapi import APIRouter, HTTPException, Query, Path
from typing import List, Optional, Dict, Any
from ..services.nodes_query_service import NodesQueryService
from ..services import get_mongodb_service
from ..config import GRAFO_DEFAULT_VERSION

router = APIRouter(prefix="/v1", tags=["Nodes v2.1"])


def get_nodes_service() -> NodesQueryService:
    """Get the NodesQueryService instance."""
    return NodesQueryService(get_mongodb_service())


# ============================================================================
# VERSION MANAGEMENT
# ============================================================================

@router.get("/versions")
async def list_versions():
    """List all available graph versions."""
    service = get_nodes_service()
    versions = await service.get_available_versions()
    return {
        "versions": versions,
        "default": GRAFO_DEFAULT_VERSION,
        "count": len(versions)
    }


@router.get("/versions/{version}/stats")
async def get_version_stats(
    version: str = Path(..., description="Graph version (e.g., 6.5.0)")
):
    """Get statistics for a specific version."""
    service = get_nodes_service()
    if not await service.check_version_exists(version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    return await service.get_version_statistics(version)


# ============================================================================
# NODE QUERIES
# ============================================================================

@router.get("/nodes/{version}/search")
async def search_nodes(
    version: str = Path(..., description="Graph version (e.g., 6.5.0)"),
    q: str = Query(..., description="Search query (name or fullName)"),
    type: Optional[str] = Query(None, description="Node type: class, method, interface, etc."),
    solution: Optional[str] = Query(None, description="Filter by solution"),
    project: Optional[str] = Query(None, description="Filter by project"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    exact_first: bool = Query(True, description="Prioritize exact name matches")
):
    """Search nodes by name/fullName in a specific version."""
    service = get_nodes_service()
    if not await service.check_version_exists(version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    results = await service.search_nodes(
        version=version,
        query=q,
        node_type=type,
        solution=solution,
        project=project,
        limit=limit,
        exact_first=exact_first
    )
    return {"version": version, "query": q, "results": results, "count": len(results)}


@router.get("/nodes/{version}/id/{node_id:path}")
async def get_node_by_id(
    version: str = Path(..., description="Graph version"),
    node_id: str = Path(..., description="Node ID (e.g., grafo:class/MyClass)")
):
    """Get a node by its semantic ID."""
    service = get_nodes_service()
    node = await service.get_node_by_id(version, node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in v{version}")
    return node


@router.get("/nodes/{version}/solution/{solution}")
async def get_nodes_by_solution(
    version: str = Path(..., description="Graph version"),
    solution: str = Path(..., description="Solution name"),
    type: Optional[str] = Query(None, description="Filter by node type"),
    limit: int = Query(1000, ge=1, le=5000)
):
    """Get all nodes for a specific solution."""
    service = get_nodes_service()
    results = await service.get_nodes_by_solution(
        version=version,
        solution=solution,
        node_type=type,
        limit=limit
    )
    return {"version": version, "solution": solution, "nodes": results, "count": len(results)}


@router.get("/nodes/{version}/project/{project}")
async def get_nodes_by_project(
    version: str = Path(..., description="Graph version"),
    project: str = Path(..., description="Project name"),
    type: Optional[str] = Query(None, description="Filter by node type"),
    limit: int = Query(1000, ge=1, le=5000)
):
    """Get all nodes for a specific project."""
    service = get_nodes_service()
    results = await service.get_nodes_by_project(
        version=version,
        project=project,
        node_type=type,
        limit=limit
    )
    return {"version": version, "project": project, "nodes": results, "count": len(results)}


# ============================================================================
# GRAPH TRAVERSAL
# ============================================================================

@router.get("/graph/{version}/callers/{node_id:path}")
async def find_callers(
    version: str = Path(..., description="Graph version"),
    node_id: str = Path(..., description="Target node ID"),
    max_depth: int = Query(3, ge=1, le=10, description="Max traversal depth"),
    include_indirect: bool = Query(True, description="Include indirect calls via interfaces")
):
    """Find all methods that call a specific method."""
    service = get_nodes_service()
    result = await service.find_callers(
        version=version,
        target_id=node_id,
        max_depth=max_depth,
        include_indirect=include_indirect
    )
    if not result.get("found"):
        raise HTTPException(status_code=404, detail=result.get("message", "Not found"))
    return result


@router.get("/graph/{version}/callees/{node_id:path}")
async def find_callees(
    version: str = Path(..., description="Graph version"),
    node_id: str = Path(..., description="Source node ID"),
    max_depth: int = Query(3, ge=1, le=10, description="Max traversal depth"),
    include_via_interface: bool = Query(True, description="Include calls via interfaces")
):
    """Find all methods called by a specific method."""
    service = get_nodes_service()
    result = await service.find_callees(
        version=version,
        source_id=node_id,
        max_depth=max_depth,
        include_via_interface=include_via_interface
    )
    if not result.get("found"):
        raise HTTPException(status_code=404, detail=result.get("message", "Not found"))
    return result


@router.get("/graph/{version}/implementations/{node_id:path}")
async def find_implementations(
    version: str = Path(..., description="Graph version"),
    node_id: str = Path(..., description="Interface node ID")
):
    """Find all classes that implement a specific interface."""
    service = get_nodes_service()
    result = await service.find_implementations(
        version=version,
        interface_id=node_id
    )
    if not result.get("found"):
        raise HTTPException(status_code=404, detail=result.get("message", "Not found"))
    return result


@router.get("/graph/{version}/inheritance/{node_id:path}")
async def find_inheritance_chain(
    version: str = Path(..., description="Graph version"),
    node_id: str = Path(..., description="Class node ID"),
    max_depth: int = Query(10, ge=1, le=20, description="Max depth to traverse")
):
    """Find the inheritance chain (ancestors and descendants) of a class."""
    service = get_nodes_service()
    result = await service.find_inheritance_chain(
        version=version,
        class_id=node_id,
        max_depth=max_depth
    )
    if not result.get("found"):
        raise HTTPException(status_code=404, detail=result.get("message", "Not found"))
    return result


# ============================================================================
# STATISTICS
# ============================================================================

@router.get("/stats/{version}")
async def get_statistics(
    version: str = Path(..., description="Graph version")
):
    """Get statistics for a specific version."""
    service = get_nodes_service()
    if not await service.check_version_exists(version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    return await service.get_statistics(version)


@router.get("/layers/{version}")
async def get_projects_by_layer(
    version: str = Path(..., description="Graph version")
):
    """Get projects grouped by architectural layer."""
    service = get_nodes_service()
    if not await service.check_version_exists(version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    return await service.get_projects_by_layer(version)


# ============================================================================
# CLASS MEMBERS
# ============================================================================

@router.get("/graph/{version}/members/{node_id:path}")
async def get_class_members(
    version: str = Path(..., description="Graph version"),
    node_id: str = Path(..., description="Class node ID (e.g., grafo:cls/xxxxx)"),
    types: Optional[str] = Query(None, description="Filter member types: method,property,field (comma-separated)")
):
    """
    Get all members (methods, properties, fields) of a class.

    Returns the class info along with its members grouped by type.
    """
    service = get_nodes_service()
    if not await service.check_version_exists(version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    # Parse types filter
    member_types = None
    if types:
        member_types = [t.strip() for t in types.split(',') if t.strip()]

    result = await service.get_class_members(
        version=version,
        class_id=node_id,
        member_types=member_types
    )

    if not result.get("found"):
        raise HTTPException(status_code=404, detail=result.get("message", "Class not found"))

    return result


# ============================================================================
# CROSS-SOLUTION DEPENDENCIES
# ============================================================================

@router.get("/graph/{version}/solution-dependencies")
async def get_solution_dependencies(
    version: str = Path(..., description="Graph version")
):
    """
    Find cross-solution dependencies based on inherits/implements relationships.

    Analyzes which solutions depend on which others by examining class inheritance
    and interface implementations that cross solution boundaries.

    Returns a list of dependencies with the source solution, target solution,
    and the specific class relationships that create the dependency.
    """
    service = get_nodes_service()
    if not await service.check_version_exists(version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    return await service.get_solution_dependencies(version)
