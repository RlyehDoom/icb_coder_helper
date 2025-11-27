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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestión del ciclo de vida de la aplicación."""
    global mongodb_service, graph_service
    
    # Startup
    logger.info("🚀 Iniciando Grafo Query Service...")
    
    try:
        validate_config()
        display_config()
        
        # Conectar a MongoDB
        mongodb_service = get_mongodb_service()
        await mongodb_service.connect()
        
        # Inicializar servicio de consultas
        graph_service = GraphQueryService(mongodb_service)
        
        logger.info("✅ Grafo Query Service iniciado correctamente")
        
    except Exception as e:
        logger.error(f"❌ Error durante el inicio: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("🔌 Cerrando Grafo Query Service...")
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
    is_healthy = await mongodb_service.is_healthy() if mongodb_service else False
    
    return {
        "status": "healthy" if is_healthy else "degraded",
        "service": "Grafo Query Service",
        "version": "1.0.0",
        "mongodb": "connected" if is_healthy else "disconnected"
    }


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

