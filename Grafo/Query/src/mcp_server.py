"""
Servidor MCP para el Query Service.

Este servidor expone las funcionalidades del Query Service como herramientas MCP
que pueden ser consumidas por IDEs como Cursor o VSCode.
"""
import asyncio
import logging
from mcp.server import Server
from mcp.types import TextContent, Tool

from .config import validate_config, display_config
from .services import MongoDBService, GraphQueryService, get_mongodb_service
from .mcp_tools import GraphMCPTools

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Servicios globales
mongodb_service: MongoDBService = None
graph_service: GraphQueryService = None
mcp_tools: GraphMCPTools = None


async def initialize_services():
    """Inicializa los servicios del Query Service."""
    global mongodb_service, graph_service, mcp_tools

    logger.info("🚀 Iniciando MCP Server para Grafo Query Service...")

    try:
        # Validar y mostrar configuración
        validate_config()
        display_config()

        # Conectar a MongoDB
        mongodb_service = get_mongodb_service()
        await mongodb_service.connect()
        logger.info("✅ Conectado a MongoDB")

        # Inicializar servicio de consultas
        graph_service = GraphQueryService(mongodb_service)
        logger.info("✅ GraphQueryService inicializado")

        # Inicializar herramientas MCP
        mcp_tools = GraphMCPTools(graph_service)
        logger.info("✅ Herramientas MCP inicializadas")

        logger.info("✅ MCP Server listo")

    except Exception as e:
        logger.error(f"❌ Error durante la inicialización: {e}", exc_info=True)
        raise


async def cleanup_services():
    """Limpia los servicios al cerrar."""
    global mongodb_service

    logger.info("🔌 Cerrando MCP Server...")
    if mongodb_service:
        await mongodb_service.disconnect()
    logger.info("👋 MCP Server cerrado")


# Crear servidor MCP
app = Server("grafo-query")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """Lista las herramientas disponibles."""
    if mcp_tools is None:
        logger.warning("MCP Tools not initialized yet")
        return []

    tools = mcp_tools.get_tools()
    logger.info(f"📋 Listando {len(tools)} herramientas MCP")
    return tools


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """
    Ejecuta una herramienta MCP.

    Args:
        name: Nombre de la herramienta
        arguments: Argumentos de la herramienta

    Returns:
        Lista de contenidos de texto con el resultado
    """
    logger.info(f"🔧 Ejecutando herramienta: {name}")
    logger.debug(f"Argumentos: {arguments}")

    if mcp_tools is None:
        error_msg = "MCP Tools not initialized"
        logger.error(error_msg)
        return [TextContent(type="text", text=error_msg)]

    try:
        result = await mcp_tools.execute_tool(name, arguments)
        logger.info(f"✅ Herramienta {name} ejecutada exitosamente")
        return [TextContent(type="text", text=result)]

    except Exception as e:
        error_msg = f"Error ejecutando herramienta {name}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return [TextContent(type="text", text=error_msg)]


# Nota: Este módulo proporciona la lógica core del MCP Server.
# Para iniciar el servidor, usa start_mcp_http.py que ejecuta sobre HTTP/SSE.
