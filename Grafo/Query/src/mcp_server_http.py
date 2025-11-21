"""
Servidor MCP sobre HTTP usando SSE (Server-Sent Events) en modo híbrido.

Este servidor permite que múltiples clientes se conecten simultáneamente
a la misma instancia del MCP Server a través de HTTP.

Arquitectura Híbrida:
- GET /sse: Stream SSE para eventos del servidor (heartbeats, notificaciones)
- POST /messages/: Todos los comandos MCP (initialize, tools/list, tools/call)
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from fastapi import FastAPI
from starlette.requests import Request

from .config import validate_config, display_config
from .services import MongoDBService, GraphQueryService, get_mongodb_service
from .mcp_tools import GraphMCPTools
from .mcp_server import app as mcp_app, initialize_services, cleanup_services, create_session_tools

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Almacenamiento de sesiones activas
# Mapea session_id -> {"tools": GraphMCPTools, "version": str, "initialized": bool}
active_sessions: Dict[str, Dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida de la aplicación."""
    logger.info("🚀 Iniciando MCP Server HTTP...")

    # Inicializar servicios al inicio
    await initialize_services()
    logger.info("✅ Servicios MCP inicializados")

    # Mostrar configuración para Cursor (usando print para salida limpia)
    from .config import GRAFO_DEFAULT_VERSION
    import os

    # Obtener puerto del servidor (mismo que start_mcp_http.py)
    server_port = int(os.getenv("SERVER_PORT", "9083"))

    print("")
    print("="*70)
    print("📋 CONFIGURACIÓN PARA CURSOR/VSCODE")
    print("="*70)
    print("")
    print("Copia este JSON en tu archivo de configuración MCP:")
    print("")
    print('  Windows: %APPDATA%\\Cursor\\User\\mcp.json')
    print('  macOS/Linux: ~/.cursor/mcp.json')
    print("")
    print("━"*70)
    print("OPCIÓN 1: Especificar versión en la URL (RECOMENDADO)")
    print("━"*70)
    print("")
    print("Cada cliente puede consultar una versión diferente:")
    print("")
    print("{")
    print('  "mcpServers": {')
    print('    "grafo-7.10.3": {')
    print(f'      "url": "http://localhost:{server_port}/sse?version=7.10.3",')
    print('      "transport": "sse"')
    print('    }')
    print('  }')
    print("}")
    print("")
    print("💡 Puedes agregar múltiples versiones con nombres diferentes:")
    print("")
    print("{")
    print('  "mcpServers": {')
    print('    "grafo-prod": {')
    print(f'      "url": "http://localhost:{server_port}/sse?version=7.10.3",')
    print('      "transport": "sse"')
    print('    },')
    print('    "grafo-dev": {')
    print(f'      "url": "http://localhost:{server_port}/sse?version=7.11.0-beta",')
    print('      "transport": "sse"')
    print('    }')
    print('  }')
    print("}")
    print("")
    print("━"*70)
    print("OPCIÓN 2: Sin versión (usa todas las versiones o default del servidor)")
    print("━"*70)
    print("")
    print("{")
    print('  "mcpServers": {')
    print('    "grafo-query-http": {')
    print(f'      "url": "http://localhost:{server_port}/sse",')
    print('      "transport": "sse"')
    print('    }')
    print('  }')
    print("}")

    if GRAFO_DEFAULT_VERSION:
        print("")
        print(f"🏷️  Versión por defecto del servidor: {GRAFO_DEFAULT_VERSION}")
        print("   (se usa cuando el cliente no especifica versión en la URL)")
    else:
        print("")
        print("ℹ️  Sin versión por defecto - consultará todas las versiones")
        print("   cuando el cliente no especifique versión en la URL")

    print("")
    print("="*70)
    print(f"✅ MCP Server listo en http://localhost:{server_port}/sse")
    print("="*70)
    print("")

    yield

    # Limpiar al cerrar
    logger.info("🔌 Cerrando MCP Server HTTP...")
    await cleanup_services()
    logger.info("👋 MCP Server HTTP cerrado")


# Crear aplicación FastAPI
fastapi_app = FastAPI(
    title="Grafo MCP Server",
    description="Model Context Protocol Server para Query Service (Modo Híbrido)",
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


@fastapi_app.post("/messages/")
async def handle_messages(request: Request):
    """
    Endpoint para mensajes MCP individuales en modo híbrido.

    Soporta todos los tipos de mensajes MCP:
    - initialize: Handshake inicial
    - ping: Keep-alive
    - tools/list: Listar herramientas disponibles
    - tools/call: Ejecutar una herramienta
    - notifications: Logs, eventos, estado
    - completion: (Opcional) Autocompletado
    """
    try:
        body = await request.json()
        session_id = request.query_params.get("session_id", "default")
        method = body.get("method", "")
        msg_id = body.get("id")
        params = body.get("params", {})

        logger.info(f"📨 [{session_id}] Mensaje: {method}")

        # === INITIALIZE ===
        if method == "initialize":
            # La versión puede venir de:
            # 1. Query parameter de la URL SSE original (?version=7.10.2)
            # 2. Parámetro 'version' en el body del mensaje initialize
            # Prioridad: body > query param > default del servidor
            version = params.get("version") or request.query_params.get("version")
            client_info = params.get("clientInfo", {})

            # Crear sesión con herramientas
            session_tools = await create_session_tools(version)
            active_sessions[session_id] = {
                "tools": session_tools,
                "version": version,
                "initialized": True,
                "client_info": client_info
            }

            logger.info(f"✅ [{session_id}] Sesión inicializada (versión: {version or 'default'})")

            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {
                        "name": "Grafo MCP Server",
                        "version": "1.0.0"
                    },
                    "capabilities": {
                        "tools": {}
                    }
                }
            }

        # === INITIALIZED (notificación post-initialize) ===
        elif method == "notifications/initialized":
            logger.info(f"✅ [{session_id}] Cliente confirmó inicialización")
            # Si tiene id, devolver respuesta con id; si no, solo acknowledgment
            if msg_id is not None:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {}
                }
            else:
                return {"jsonrpc": "2.0"}

        # === PING ===
        elif method == "ping":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {}
            }

        # === TOOLS/LIST ===
        elif method == "tools/list":
            session = active_sessions.get(session_id)
            if not session:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32001,
                        "message": "Session not initialized"
                    }
                }

            tools = session["tools"].get_tools()
            logger.info(f"📋 [{session_id}] Listando {len(tools)} herramientas")

            # Serializar herramientas eliminando campos None/null
            # Cursor no acepta campos null en la respuesta
            tools_dict = [
                {k: v for k, v in tool.model_dump(exclude_none=True).items()}
                for tool in tools
            ]

            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "tools": tools_dict
                }
            }

        # === TOOLS/CALL ===
        elif method == "tools/call":
            session = active_sessions.get(session_id)
            if not session:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32001,
                        "message": "Session not initialized"
                    }
                }

            tool_name = params.get("name")
            tool_args = params.get("arguments", {})

            logger.info(f"🔧 [{session_id}] Ejecutando: {tool_name}")

            try:
                result = await session["tools"].execute_tool(tool_name, tool_args)
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": result
                            }
                        ]
                    }
                }
            except Exception as e:
                logger.error(f"❌ [{session_id}] Error ejecutando {tool_name}: {e}")
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32603,
                        "message": f"Error ejecutando herramienta: {str(e)}"
                    }
                }

        # === NOTIFICATIONS ===
        elif method.startswith("notifications/"):
            logger.info(f"📢 [{session_id}] Notificación: {method}")
            # Si tiene id, devolver respuesta con id; si no, solo acknowledgment
            if msg_id is not None:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {}
                }
            else:
                return {"jsonrpc": "2.0"}

        # === COMPLETION (Opcional) ===
        elif method == "completion/complete":
            # Por ahora, retornar lista vacía de completions
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "completion": {
                        "values": [],
                        "total": 0,
                        "hasMore": False
                    }
                }
            }

        # === MÉTODO NO SOPORTADO ===
        else:
            logger.warning(f"⚠️ [{session_id}] Método no soportado: {method}")
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }

    except Exception as e:
        logger.error(f"❌ Error procesando mensaje: {e}", exc_info=True)
        # Intentar obtener el id del mensaje (puede ser None)
        error_id = None
        try:
            if 'msg_id' in locals():
                error_id = msg_id
            elif 'body' in locals():
                error_id = body.get("id")
        except:
            pass

        return {
            "jsonrpc": "2.0",
            "id": error_id,
            "error": {
                "code": -32603,
                "message": str(e)
            }
        }


@fastapi_app.api_route("/sse", methods=["GET", "POST"])
async def handle_sse(request: Request):
    """
    Endpoint SSE para conexiones MCP.

    GET: Establece conexión SSE y envía evento 'endpoint' con la URL de mensajes
    POST: Procesa comandos MCP (igual que /messages/)

    Soporta ambos modos:
    - StreamableHttp: POST directo a /sse
    - SSE + /messages/: GET /sse + POST /messages/

    Query Parameters:
        version (str, optional): Versión del grafo a consultar (e.g., "7.10.3")
                                 Se pasa a la sesión cuando el cliente envíe 'initialize'
    """
    # Si es POST, procesar como mensaje MCP (delegar a handle_messages)
    if request.method == "POST":
        # Cursor en modo streamableHttp envía POST directamente a /sse
        # Procesamos igual que /messages/
        logger.info(f"📨 POST recibido en /sse (modo streamableHttp)")
        return await handle_messages(request)

    # GET: Establecer conexión SSE
    from sse_starlette.sse import EventSourceResponse
    import asyncio

    client_version = request.query_params.get("version")
    client_host = request.client.host

    logger.info(f"📡 Nueva conexión SSE desde {client_host} (versión: {client_version or 'default'})")

    async def event_generator():
        """
        Genera eventos SSE para mantener la conexión abierta.
        Envía heartbeats cada 30 segundos.
        """
        try:
            # Enviar evento endpoint con la URL donde enviar mensajes
            # Importante: data debe ser solo la URL, no un objeto JSON
            yield {
                "event": "endpoint",
                "data": "/messages/",
            }

            # Mantener conexión con heartbeats
            while True:
                await asyncio.sleep(30)
                yield {
                    "event": "ping",
                    "data": "{}",
                }
        except asyncio.CancelledError:
            logger.info(f"🔌 Conexión SSE cerrada desde {client_host}")
            raise

    return EventSourceResponse(event_generator())


if __name__ == "__main__":
    import uvicorn

    logger.info("🌐 Iniciando servidor MCP HTTP en puerto 8082...")
    uvicorn.run(
        fastapi_app,
        host="0.0.0.0",
        port=8082,
        log_level="info"
    )
