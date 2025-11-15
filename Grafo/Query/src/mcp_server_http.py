"""
Servidor MCP sobre HTTP usando SSE (Server-Sent Events).

Este servidor permite que múltiples clientes se conecten simultáneamente
a la misma instancia del MCP Server a través de HTTP.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse
from mcp.server.sse import SseServerTransport

from .config import validate_config, display_config
from .services import MongoDBService, GraphQueryService, get_mongodb_service
from .mcp_tools import GraphMCPTools
from .mcp_server import app as mcp_app, initialize_services, cleanup_services

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida de la aplicación."""
    logger.info("🚀 Iniciando MCP Server HTTP...")

    # Inicializar servicios al inicio
    await initialize_services()
    logger.info("✅ Servicios MCP inicializados")

    yield

    # Limpiar al cerrar
    logger.info("🔌 Cerrando MCP Server HTTP...")
    await cleanup_services()
    logger.info("👋 MCP Server HTTP cerrado")


# Crear aplicación FastAPI
fastapi_app = FastAPI(
    title="Grafo MCP Server",
    description="Model Context Protocol Server para Query Service",
    version="1.0.0",
    lifespan=lifespan
)


@fastapi_app.get("/")
async def root():
    """Endpoint raíz con información del servidor."""
    return {
        "service": "Grafo MCP Server",
        "version": "1.0.0",
        "protocol": "MCP over SSE",
        "status": "running",
        "endpoints": {
            "sse": "/sse",
            "health": "/health"
        }
    }


@fastapi_app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Grafo MCP Server",
        "protocol": "SSE"
    }


@fastapi_app.get("/sse")
async def handle_sse(request: Request):
    """
    Endpoint SSE para conexiones MCP.

    Los clientes se conectan a este endpoint y el servidor
    mantiene la conexión abierta para comunicación bidireccional usando SSE.
    """
    logger.info(f"📡 Nueva conexión SSE desde {request.client.host}")

    try:
        # Crear transporte SSE
        transport = SseServerTransport("/messages")

        async def event_generator():
            """Generador de eventos SSE"""
            try:
                # Inicializar opciones del servidor MCP
                init_options = mcp_app.create_initialization_options()

                # Ejecutar el servidor MCP con este transporte
                await mcp_app.run(
                    transport.read_stream,
                    transport.write_stream,
                    init_options
                )
            except Exception as e:
                logger.error(f"❌ Error en sesión MCP: {e}", exc_info=True)
                raise
            finally:
                logger.info(f"🔌 Sesión MCP cerrada desde {request.client.host}")

        # Retornar respuesta SSE
        return EventSourceResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:
        logger.error(f"❌ Error configurando SSE: {e}", exc_info=True)
        return {"error": str(e)}


@fastapi_app.post("/messages")
async def handle_messages(request: Request):
    """
    Endpoint para recibir mensajes del cliente.

    Los clientes envían mensajes MCP JSON-RPC a este endpoint.
    """
    try:
        message = await request.json()
        logger.debug(f"📨 Mensaje recibido: {message.get('method', 'unknown')}")
        # El transporte SSE maneja los mensajes automáticamente
        return {"status": "received"}
    except Exception as e:
        logger.error(f"❌ Error procesando mensaje: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}, 400


if __name__ == "__main__":
    import uvicorn

    logger.info("🌐 Iniciando servidor MCP HTTP en puerto 8082...")
    uvicorn.run(
        fastapi_app,
        host="0.0.0.0",
        port=8082,
        log_level="info"
    )
