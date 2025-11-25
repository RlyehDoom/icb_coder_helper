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
import os
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from fastapi import FastAPI
from starlette.requests import Request

from .config import validate_config, display_config
from .services import MongoDBService, GraphQueryService, get_mongodb_service
from .mcp_tools import GraphMCPTools
from .mcp_server import app as mcp_app, initialize_services, cleanup_services, create_session_tools

# Configurar logging desde variable de entorno
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
log_level_map = {
    'DEBUG': logging.DEBUG,
    'INFO': logging.INFO,
    'WARNING': logging.WARNING,
    'ERROR': logging.ERROR,
    'CRITICAL': logging.CRITICAL
}
logging.basicConfig(
    level=log_level_map.get(LOG_LEVEL, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.info(f"📊 Log level configurado: {LOG_LEVEL}")

# Variable global para rastrear el nivel de log actual
current_log_level = LOG_LEVEL

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

        # Traza completa del body recibido (útil para debugging)
        import json
        logger.debug(f"📦 Body completo recibido:\n{json.dumps(body, indent=2, ensure_ascii=False)}")

        method = body.get("method", "")
        msg_id = body.get("id")
        params = body.get("params", {})

        # Obtener session_id temporal del query param (generado durante GET /sse en modo SSE estándar)
        # En modo streamableHttp (POST directo a /sse), NO habrá session_id en query param
        session_id = request.query_params.get("session_id")

        # ESTÁNDAR MCP: Durante initialize, el cliente envía clientState.sessionId (su ID real)
        client_state = body.get("clientState", {})
        client_session_id = client_state.get("sessionId") if client_state else None

        # Si no hay session_id (modo streamableHttp o cliente sin SSE), generar uno basado en fingerprint
        if not session_id:
            import hashlib
            client_ip = request.client.host if request.client else "unknown"
            user_agent = request.headers.get("user-agent", "")
            client_fingerprint = f"{client_ip}:{user_agent}"
            session_id = hashlib.md5(client_fingerprint.encode()).hexdigest()[:8]

            # Solo logear warning durante initialize si tampoco hay clientState
            if method == "initialize" and not client_session_id:
                logger.warning(f"⚠️ Initialize sin session_id ni clientState, generando: [{session_id}]")
            elif method == "initialize":
                logger.debug(f"🔍 Modo streamableHttp detectado, usando fingerprint: [{session_id}]")

        # Logging con ambos IDs cuando están disponibles
        if client_session_id:
            logger.info(f"📨 [{session_id}|{client_session_id}] Mensaje: {method}")
        else:
            logger.info(f"📨 [{session_id}] Mensaje: {method}")

        # === INITIALIZE ===
        if method == "initialize":
            # La versión puede venir de:
            # 1. Query parameter de la URL SSE original (?version=7.10.2)
            # 2. Parámetro 'version' en el body del mensaje initialize
            # Prioridad: body > query param > default del servidor
            version = params.get("version") or request.query_params.get("version")
            client_info = params.get("clientInfo", {})

            # Extraer info del cliente
            client_name = client_info.get("name") if client_info else None
            client_version = client_info.get("version") if client_info else None

            # Crear sesión con herramientas
            session_tools = await create_session_tools(version)
            active_sessions[session_id] = {
                "tools": session_tools,
                "version": version,
                "initialized": True,
                "client_info": client_info,
                "client_session_id": client_session_id  # Guardar el sessionId real del cliente (de clientState)
            }

            # Log con toda la información disponible
            session_log = f"[{session_id}"
            if client_session_id:
                session_log += f"|{client_session_id}"
            session_log += "]"

            # Construir mensaje de log
            log_msg = f"✅ {session_log} Sesión inicializada"
            log_details = []

            if version:
                log_details.append(f"versión: {version}")
            if client_name:
                log_details.append(f"cliente: {client_name}")
            if client_version:
                log_details.append(f"v{client_version}")

            if log_details:
                log_msg += f" ({', '.join(log_details)})"

            logger.info(log_msg)

            # Log detallado de clientInfo si existe
            if client_info:
                logger.debug(f"🔍 {session_log} clientInfo completo: {client_info}")

            # Capabilities: indicamos qué funcionalidades soporta este servidor MCP
            # - tools: {} = Tenemos herramientas (6 tools: search_code, get_code_context, etc.)
            # - logging: {} = Soportamos logging (generamos logs que el cliente puede consumir)
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
                        "tools": {},      # Soportamos tools (herramientas MCP)
                        "logging": {}     # Soportamos logging
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

        # === LOGGING/SETLEVEL ===
        elif method == "logging/setLevel":
            global current_log_level

            # Obtener el nivel solicitado del parámetro 'level'
            requested_level = params.get("level", "").upper()

            # Validar que el nivel sea válido
            if requested_level not in log_level_map:
                valid_levels = list(log_level_map.keys())
                logger.warning(f"⚠️ [{session_id}] Nivel de log inválido: {requested_level}")
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32602,
                        "message": f"Invalid log level: {requested_level}. Valid levels: {valid_levels}"
                    }
                }

            # Obtener el valor numérico del nivel
            new_level = log_level_map[requested_level]
            old_level = current_log_level

            # Actualizar el nivel de logging en todos los loggers relevantes
            # 1. Root logger (afecta a todos los loggers que no tienen nivel propio)
            logging.getLogger().setLevel(new_level)

            # 2. Loggers específicos de nuestros módulos
            for logger_name in [
                __name__,                    # mcp_server_http
                "src.mcp_server",            # mcp_server
                "src.mcp_tools",             # mcp_tools
                "src.services.mongodb_service",
                "src.services.graph_query_service",
                "uvicorn",                   # Servidor HTTP
                "uvicorn.access",
                "uvicorn.error",
            ]:
                logging.getLogger(logger_name).setLevel(new_level)

            # Actualizar variable global
            current_log_level = requested_level

            logger.info(f"📊 [{session_id}] Nivel de log cambiado: {old_level} → {requested_level}")

            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {}
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
        # El sessionId vendrá en clientState del body (estándar MCP)
        logger.info(f"📨 POST recibido en /sse (modo streamableHttp)")
        return await handle_messages(request)

    # GET: Establecer conexión SSE
    from sse_starlette.sse import EventSourceResponse
    import asyncio
    import uuid

    client_version = request.query_params.get("version")
    client_host = request.client.host

    # Generar session_id temporal para tracking interno
    # El cliente lo usará en /messages/?session_id=xxx
    # Durante initialize, guardaremos el clientState.sessionId real del cliente
    temp_session_id = str(uuid.uuid4())[:8]

    logger.info(f"📡 Nueva conexión SSE desde {client_host} [temp_session: {temp_session_id}] (versión: {client_version or 'default'})")

    async def event_generator():
        """
        Genera eventos SSE para mantener la conexión abierta.
        Envía heartbeats cada 30 segundos.
        """
        try:
            # Enviar evento endpoint con session_id temporal en la URL
            # El cliente usará este session_id en todos sus requests
            # Durante initialize, recibiremos el clientState.sessionId real
            yield {
                "event": "endpoint",
                "data": f"/messages/?session_id={temp_session_id}",
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
