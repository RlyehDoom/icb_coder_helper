"""
Servidor FastAPI principal para el servicio Query.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import (
    SERVER_HOST, SERVER_PORT, CORS_ORIGINS, LOG_LEVEL,
    validate_config, display_config
)
from .services import MongoDBService, GraphQueryService, get_mongodb_service
from .services import RedisService, get_redis_service
from .routes import projects, nodes, edges, context, semantic, graph_traversal

# Configurar logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Variables globales para servicios
mongodb_service: MongoDBService = None
graph_service: GraphQueryService = None
redis_service: RedisService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestión del ciclo de vida de la aplicación."""
    global mongodb_service, graph_service, redis_service

    # Startup
    logger.info("🚀 Iniciando Grafo Query Service...")

    try:
        validate_config()
        display_config()

        # Conectar a MongoDB
        mongodb_service = get_mongodb_service()
        await mongodb_service.connect()

        # Conectar a Redis (opcional - no falla si no está disponible)
        redis_service = get_redis_service()
        redis_connected = await redis_service.connect()
        if redis_connected:
            logger.info("✅ Redis cache conectado")
        else:
            logger.warning("⚠️ Redis no disponible - cache deshabilitado")

        # Inicializar servicio de consultas
        graph_service = GraphQueryService(mongodb_service)

        logger.info("✅ Grafo Query Service iniciado correctamente")

    except Exception as e:
        logger.error(f"❌ Error durante el inicio: {e}")
        raise

    yield

    # Shutdown
    logger.info("🔌 Cerrando Grafo Query Service...")
    if redis_service:
        await redis_service.disconnect()
    if mongodb_service:
        await mongodb_service.disconnect()
    logger.info("👋 Grafo Query Service cerrado")


# Crear aplicación FastAPI
app = FastAPI(
    title="Grafo Query Service",
    description="API REST para consultar el grafo de código C#",
    version="1.0.0",
    lifespan=lifespan
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependency para inyectar servicios en las rutas
def get_graph_service() -> GraphQueryService:
    """Dependency para obtener el servicio de consultas."""
    if graph_service is None:
        raise RuntimeError("Graph service not initialized")
    return graph_service


# Override de las dependencies en los routers
def setup_dependencies():
    """Configura las dependencies de FastAPI usando override."""
    # Override the get_graph_service dependency en cada router
    from . import routes

    # Override para cada router (excepto nodes que usa v2.1 con su propio servicio)
    app.dependency_overrides[routes.projects.get_graph_service] = get_graph_service
    # routes.nodes ahora usa NodesQueryService directamente (v2.1)
    app.dependency_overrides[routes.edges.get_graph_service] = get_graph_service
    app.dependency_overrides[routes.context.get_graph_service] = get_graph_service
    # routes.semantic ahora usa NodesQueryService directamente (v2.1)


# Registrar routers
app.include_router(projects.router, prefix="/api")
app.include_router(nodes.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(context.router, prefix="/api")
app.include_router(semantic.router, prefix="/api")
app.include_router(graph_traversal.router)  # Graph traversal routes (v2.1)

# Configurar dependencies después de registrar routers
setup_dependencies()


# Health check endpoint
@app.get("/health")
async def health_check():
    """Verifica el estado del servicio."""
    mongo_healthy = await mongodb_service.is_healthy() if mongodb_service else False
    redis_connected = redis_service.is_connected if redis_service else False

    return {
        "status": "healthy" if mongo_healthy else "degraded",
        "service": "Grafo Query Service",
        "version": "1.0.0",
        "mongodb": "connected" if mongo_healthy else "disconnected",
        "redis": "connected" if redis_connected else "disconnected"
    }


@app.get("/cache/stats")
async def cache_stats():
    """Obtiene estadísticas del cache."""
    if redis_service:
        return await redis_service.get_stats()
    return {"enabled": False, "connected": False}


@app.get("/cache/keys")
async def cache_keys(version: str = None, limit: int = 100):
    """
    Lista las claves de cache.
    - Si se especifica version, solo muestra las claves de esa versión
    - Agrupa las claves por versión y tipo
    """
    if not redis_service or not redis_service.is_connected:
        return {"keys": [], "message": "Cache not available"}

    try:
        pattern = f"grafo:*:v{version}:*" if version else "grafo:*"
        keys_by_version = {}
        count = 0

        async for key in redis_service.client.scan_iter(match=pattern):
            if count >= limit:
                break
            count += 1

            # Parse key: grafo:{prefix}:v{version}:{hash}
            parts = key.split(':')
            if len(parts) >= 4 and parts[2].startswith('v'):
                ver = parts[2][1:]  # Remove 'v' prefix
                prefix = parts[1]
                if ver not in keys_by_version:
                    keys_by_version[ver] = {}
                if prefix not in keys_by_version[ver]:
                    keys_by_version[ver][prefix] = 0
                keys_by_version[ver][prefix] += 1
            else:
                # Legacy format without version
                if 'unknown' not in keys_by_version:
                    keys_by_version['unknown'] = {}
                prefix = parts[1] if len(parts) > 1 else 'other'
                if prefix not in keys_by_version['unknown']:
                    keys_by_version['unknown'][prefix] = 0
                keys_by_version['unknown'][prefix] += 1

        return {
            "total_scanned": count,
            "limit": limit,
            "by_version": keys_by_version
        }
    except Exception as e:
        return {"error": str(e)}


@app.delete("/cache/clear")
async def cache_clear(
    prefix: str = None,
    version: str = None
):
    """
    Limpia el cache.
    - Si se especifica version, limpia solo las keys de esa versión
    - Si se especifica prefix, limpia las keys con ese prefijo
    - Sin parámetros, limpia todo el cache
    """
    if not redis_service or not redis_service.is_connected:
        return {"cleared": False, "message": "Cache not available"}

    if version:
        # Clear all keys for a specific version
        pattern = f"*:v{version}:*"
        deleted = await redis_service.clear_prefix(pattern)
        return {"cleared": True, "version": version, "keys_deleted": deleted}
    elif prefix:
        deleted = await redis_service.clear_prefix(prefix)
        return {"cleared": True, "prefix": prefix, "keys_deleted": deleted}
    else:
        await redis_service.clear_all()
        return {"cleared": True, "message": "All cache cleared"}


@app.get("/")
async def root():
    """Endpoint raíz con información del servicio."""
    return {
        "service": "Grafo Query Service",
        "version": "1.0.0",
        "description": "API REST para consultar el grafo de código C#",
        "docs": "/docs",
        "health": "/health"
    }


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Manejo global de excepciones."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc)
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"🌐 Starting server on {SERVER_HOST}:{SERVER_PORT}")
    uvicorn.run(
        "src.server:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=True,
        log_level=LOG_LEVEL.lower()
    )

