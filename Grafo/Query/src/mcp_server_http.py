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
from starlette.routing import Mount
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

    # Mostrar configuración para Cursor (usando print para salida limpia)
    print("")
    print("="*60)
    print("📋 CONFIGURACIÓN PARA CURSOR/VSCODE")
    print("="*60)
    print("")
    print("Copia este JSON en tu archivo de configuración MCP:")
    print("")
    print('  Windows: %APPDATA%\\Cursor\\User\\mcp.json')
    print('  macOS/Linux: ~/.cursor/mcp.json')
    print("")
    print("Contenido del archivo mcp.json:")
    print("")
    print("{")
    print('  "mcpServers": {')
    print('    "grafo-query-http": {')
    print('      "url": "http://localhost:8083/sse",')
    print('      "transport": "sse"')
    print('    }')
    print('  }')
    print("}")
    print("")
    print("="*60)
    print("✅ MCP Server listo en http://localhost:8083/sse")
    print("="*60)
    print("")

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

# Crear transporte SSE
sse_transport = SseServerTransport("/messages/")

# Montar el manejador de mensajes POST
fastapi_app.router.routes.append(
    Mount("/messages", app=sse_transport.handle_post_message)
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
        # Conectar usando el transporte SSE
        async with sse_transport.connect_sse(
            request.scope,
            request.receive,
            request._send
        ) as streams:
            logger.info(f"🔗 Streams establecidos para {request.client.host}")

            # Inicializar opciones del servidor MCP
            init_options = mcp_app.create_initialization_options()

            # Ejecutar el servidor MCP con los streams
            await mcp_app.run(
                streams[0],  # read stream
                streams[1],  # write stream
                init_options
            )

            logger.info(f"🔌 Sesión MCP cerrada desde {request.client.host}")

    except Exception as e:
        logger.error(f"❌ Error en sesión SSE: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    import uvicorn

    logger.info("🌐 Iniciando servidor MCP HTTP en puerto 8082...")
    uvicorn.run(
        fastapi_app,
        host="0.0.0.0",
        port=8082,
        log_level="info"
    )
