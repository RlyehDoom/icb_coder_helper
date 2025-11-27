"""
Herramientas MCP para consultar el grafo de código C#.

Este módulo expone las funcionalidades del Query Service como herramientas MCP
que pueden ser utilizadas por IDEs como Cursor o VSCode.
"""
import logging
from typing import Dict, Any, List
from pathlib import Path
from mcp.server import Server
from mcp.types import Tool, TextContent
import json

from .services import GraphQueryService, get_mongodb_service
from .services.nodes_query_service import NodesQueryService
from .models import (
    SearchNodesRequest,
    CodeContextRequest,
    SearchProjectsRequest
)
from .tailored_guidance import TailoredGuidanceService
from .config import GRAFO_DEFAULT_VERSION

logger = logging.getLogger(__name__)


class GraphMCPTools:
    """Herramientas MCP para consultar el grafo de código (v2.1 - versioned collections)."""

    def __init__(self, graph_service: GraphQueryService, default_version: str = None):
        """
        Inicializa las herramientas MCP.

        Args:
            graph_service: Servicio legacy de consultas del grafo (compatibilidad)
            default_version: Versión por defecto del grafo a consultar (e.g., "6.5.0")
        """
        self.graph_service = graph_service
        self.default_version = default_version or GRAFO_DEFAULT_VERSION

        # Inicializar NodesQueryService para v2.1 (versioned collections)
        mongodb = get_mongodb_service()
        self.nodes_service = NodesQueryService(mongodb)

        self.tailored_guidance = TailoredGuidanceService(graph_service)

        if self.default_version:
            logger.info(f"🏷️  MCP Tools v2.1 configurado con versión: {self.default_version}")

    def get_tools(self) -> List[Tool]:
        """Retorna la lista de herramientas MCP disponibles."""
        return [
            Tool(
                name="search_code",
                description=(
                    "🔍 Busca componentes en el grafo de código BASE de ICBanking.\n\n"
                    "⛔ **REGLA CRÍTICA DE EJECUCIÓN:**\n"
                    "Esta herramienta puede retornar MÚLTIPLES resultados cuando el mismo componente existe en diferentes capas. "
                    "Cuando esto ocurra, STOP, mostrar tabla, preguntar al usuario cuál desea analizar.\n\n"
                    "🎯 **MAPEO DE PARÁMETROS según lo que dice el usuario:**\n"
                    "- 'método X de CLASE Y' → class_name='Y'\n"
                    "- 'método X de CAPA BusinessComponents' → layer='BusinessComponents'\n"
                    "- 'método X de CAPA DataAccess' → layer='DataAccess'\n"
                    "- 'método X del PROYECTO BackOffice.DataAccess' → project='BackOffice.DataAccess'\n\n"
                    "**EJEMPLOS COMPLETOS:**\n"
                    "- 'método InsertMessage de clase Communication' → query='InsertMessage', node_type='Method', class_name='Communication'\n"
                    "- 'método InsertMessage de capa BusinessComponents' → query='InsertMessage', node_type='Method', layer='BusinessComponents'\n"
                    "- 'método InsertMessage de DataAccess' → query='InsertMessage', node_type='Method', layer='DataAccess'\n"
                    "- 'clase Communication' → query='Communication', node_type='Class'\n\n"
                    "IMPORTANTE: El grafo contiene SOLO código BASE de ICBanking."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Nombre del elemento a buscar. Ejemplos: 'InsertBackOfficeMessage', 'Communication', 'IAccountService'"
                        },
                        "node_type": {
                            "type": "string",
                            "description": "Tipo de elemento a buscar",
                            "enum": ["Method", "Class", "Interface", "Property", "Field", "Enum", "Struct"]
                        },
                        "class_name": {
                            "type": "string",
                            "description": (
                                "Nombre de la CLASE contenedora. "
                                "USAR cuando el usuario dice 'de clase X' o 'de la clase X'. "
                                "Ejemplos: 'Communication', 'TransferBatch', 'Geolocation'. "
                                "NO usar para capas como BusinessComponents o DataAccess."
                            )
                        },
                        "layer": {
                            "type": "string",
                            "description": (
                                "Capa de arquitectura. "
                                "USAR cuando el usuario dice 'de capa X', 'de BusinessComponents', 'de DataAccess', etc. "
                                "Valores válidos: 'BusinessComponents', 'DataAccess', 'ServiceAgents', 'BusinessEntities', 'Interfaces', 'Cross-Cutting', 'Common'"
                            )
                        },
                        "project": {
                            "type": "string",
                            "description": (
                                "Nombre completo del proyecto. "
                                "USAR cuando el usuario dice 'del proyecto X'. "
                                "Ejemplos: 'BackOffice.BusinessComponents', 'BackOffice.DataAccess'"
                            )
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Máximo de resultados (default: 20)",
                            "default": 20
                        }
                    },
                    "required": ["query", "node_type"]
                }
            ),
            Tool(
                name="get_code_context",
                description=(
                    "📋 SEGUNDA HERRAMIENTA - Obtiene contexto completo DESPUÉS de ubicar el componente con search_code.\n\n"
                    "⚠️ REGLA OBLIGATORIA: Cuando trabajes en proyectos /ICBanking/* o /Tailored/*, "
                    "SIEMPRE debes usar este MCP para consultar el grafo de código.\n\n"
                    "USA ESTA TOOL DESPUÉS de search_code para obtener:\n"
                    "- Información completa del elemento (herencias, implementaciones)\n"
                    "- Elementos relacionados y sus conexiones\n"
                    "- Dependencias (qué depende de este elemento)\n"
                    "- Datos necesarios para tailored_guidance\n\n"
                    "🎯 USA LOS DATOS DE search_code:\n"
                    "- className: Usa el nombre de la clase del resultado de search_code\n"
                    "- methodName: Si buscaste un método, usa su nombre aquí\n"
                    "- namespace: Usa el Namespace exacto del resultado de search_code\n"
                    "- project: Usa el Proyecto del resultado de search_code"
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "className": {
                            "type": "string",
                            "description": (
                                "Nombre de la clase. "
                                "Usa el valor del campo 'Name' si buscaste una Class, "
                                "o extrae la clase del Namespace si buscaste un Method."
                            )
                        },
                        "methodName": {
                            "type": "string",
                            "description": (
                                "Nombre del método (si aplica). "
                                "Usa el valor del campo 'Name' del resultado de search_code si buscaste un Method."
                            )
                        },
                        "namespace": {
                            "type": "string",
                            "description": (
                                "Namespace completo del resultado de search_code. "
                                "IMPORTANTE: Usa el valor exacto para evitar ambigüedades."
                            )
                        },
                        "project": {
                            "type": "string",
                            "description": (
                                "Proyecto del resultado de search_code. "
                                "Usa el valor exacto del campo 'Proyecto' para precisión."
                            )
                        },
                        "includeRelated": {
                            "type": "boolean",
                            "description": "Incluir nodos relacionados (default: true)",
                            "default": True
                        },
                        "maxDepth": {
                            "type": "integer",
                            "description": "Profundidad máxima de relaciones (default: 2)",
                            "default": 2
                        }
                    },
                    "required": ["className"]
                }
            ),
            Tool(
                name="list_projects",
                description=(
                    "📂 Lista proyectos BASE de ICBanking disponibles en el grafo.\n\n"
                    "🎯 USAR CUANDO EL USUARIO PREGUNTE:\n"
                    "- '¿Qué proyectos hay?', '¿Qué proyectos existen?'\n"
                    "- 'Muéstrame los proyectos de BusinessComponents'\n"
                    "- 'Lista de proyectos disponibles'\n"
                    "- '¿Cuántos proyectos hay en el grafo?'\n\n"
                    "Retorna: nombre, namespace, cantidad de clases/métodos por proyecto."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Filtro por nombre. Ejemplos: 'Account', 'BusinessComponents', 'Geolocation'"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Máximo de resultados (default: 50)",
                            "default": 50
                        }
                    }
                }
            ),
            Tool(
                name="get_project_structure",
                description=(
                    "🏗️ Obtiene la estructura completa de un proyecto BASE (clases, interfaces, métodos).\n\n"
                    "🎯 USAR CUANDO EL USUARIO PREGUNTE:\n"
                    "- '¿Qué clases tiene el proyecto X?'\n"
                    "- 'Estructura del proyecto Geolocation'\n"
                    "- '¿Qué métodos hay en el proyecto Account?'\n"
                    "- 'Muéstrame las interfaces del proyecto Communication'\n\n"
                    "Retorna componentes agrupados por tipo (Class, Interface, Method, etc.).\n"
                    "Útil para explorar un proyecto antes de extenderlo en Tailored."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "project_id": {
                            "type": "string",
                            "description": "Nombre del proyecto. Ejemplos: 'BackOffice.BusinessComponents.Geolocation'"
                        },
                        "node_type": {
                            "type": "string",
                            "description": "Filtrar por tipo: Class, Interface, Method, Property",
                            "enum": ["Class", "Interface", "Method", "Property", "Field", "Enum"]
                        }
                    },
                    "required": ["project_id"]
                }
            ),
            Tool(
                name="find_implementations",
                description=(
                    "🔎 Encuentra TODAS las clases que implementan una interfaz o heredan de una clase.\n\n"
                    "🎯 USAR CUANDO EL USUARIO PREGUNTE:\n"
                    "- '¿Qué clases implementan IAccountService?'\n"
                    "- '¿Quién hereda de BaseAccount?'\n"
                    "- 'Implementaciones de la interfaz IGeolocation'\n"
                    "- '¿Qué clases extienden CommunicationBase?'\n"
                    "- 'Buscar todas las implementaciones de X'\n\n"
                    "⚠️ MUY ÚTIL para entender jerarquías antes de extender en Tailored.\n"
                    "Retorna lista de clases con su namespace y proyecto."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "interface_or_class": {
                            "type": "string",
                            "description": "Nombre de la interfaz (ej: 'IAccountService') o clase base (ej: 'BaseAccount')"
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace para filtrar (opcional)"
                        }
                    },
                    "required": ["interface_or_class"]
                }
            ),
            Tool(
                name="analyze_impact",
                description=(
                    "📊 Genera reporte de ANÁLISIS DE IMPACTO de cambios en el código BASE.\n\n"
                    "🎯 USAR CUANDO EL USUARIO PREGUNTE:\n"
                    "- '¿Qué impacto tiene modificar la clase X?'\n"
                    "- 'Análisis de dependencias de Account'\n"
                    "- '¿Qué se afecta si cambio este método?'\n"
                    "- '¿Quién usa esta clase?'\n"
                    "- 'Antes de modificar X, ¿qué debo considerar?'\n\n"
                    "⚠️ IMPORTANTE - PARÁMETRO className:\n"
                    "- Para MÉTODOS: usar el nombre de la CLASE que contiene el método (de 'ContainingType' o 'Clase' en search_code)\n"
                    "- Ejemplo: si search_code retorna Clase='TransferBatch' para el método ProcessTransferBatch, usar className='TransferBatch'\n"
                    "- NO usar partes del namespace como 'BusinessComponents' o 'DataAccess'\n\n"
                    "Retorna:\n"
                    "- Dependencias entrantes (quién usa este componente)\n"
                    "- Dependencias salientes (qué usa este componente)\n"
                    "- Clases derivadas afectadas\n"
                    "- Nivel de impacto: HIGH/MEDIUM/LOW\n"
                    "- Recomendaciones\n\n"
                    "⚠️ USAR ANTES de hacer cambios significativos en Tailored."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "className": {
                            "type": "string",
                            "description": "Nombre EXACTO de la CLASE (no namespace). Para métodos, usar el valor de 'Clase' o 'ContainingType' del resultado de search_code. Ej: 'TransferBatch', 'Geolocation', NO 'BusinessComponents'"
                        },
                        "methodName": {
                            "type": "string",
                            "description": "Método específico (opcional, para análisis más detallado)"
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace completo del resultado de search_code (ej: 'Infocorp.P2P.BusinessComponents.TransferBatch')"
                        },
                        "project": {
                            "type": "string",
                            "description": "Proyecto del resultado de search_code"
                        }
                    },
                    "required": ["className"]
                }
            ),
            Tool(
                name="get_statistics",
                description=(
                    "📈 Estadísticas generales del grafo de código BASE indexado.\n\n"
                    "🎯 USAR CUANDO EL USUARIO PREGUNTE:\n"
                    "- '¿Cuántas clases hay en total?'\n"
                    "- 'Estadísticas del grafo'\n"
                    "- '¿Cuántos proyectos están indexados?'\n"
                    "- 'Resumen general del código base'\n"
                    "- '¿Qué tan grande es el grafo?'\n\n"
                    "Retorna: total de proyectos, clases, métodos, interfaces, relaciones."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            ),
            Tool(
                name="get_tailored_guidance",
                description=(
                    "🎯 EXCLUSIVA PARA /Tailored/* - Guía para EXTENDER/CREAR/MODIFICAR código en el proyecto Tailored.\n\n"
                    "⚠️ CUÁNDO USAR ESTA TOOL:\n"
                    "- SOLO cuando el usuario pida extender, crear o modificar código en /Tailored/*\n"
                    "- NO usar para consultas de código BASE en /ICBanking/*\n"
                    "- NO usar solo para buscar o explorar código\n\n"
                    "⚠️ FLUJO OBLIGATORIO antes de usar esta tool:\n"
                    "1. USA search_code PRIMERO para ubicar el componente\n"
                    "2. USA get_code_context para obtener contexto completo del componente BASE\n"
                    "3. LUEGO usa esta tool con los datos validados para generar código Tailored\n\n"
                    "**Sistema de Pasos:**\n"
                    "- step='overview' o step=0 → Muestra plan general y lista de pasos\n"
                    "- step=1 → Ejecuta paso 1 de la tarea\n"
                    "- step=2 → Ejecuta paso 2 de la tarea\n"
                    "- etc.\n\n"
                    "**Flujo recomendado:**\n"
                    "1. Primero llama con step='overview' para ver el plan completo\n"
                    "2. Luego llama con step=1 para empezar\n"
                    "3. Completa cada paso antes de avanzar al siguiente\n"
                    "4. Cada paso te indicará cómo llamar al siguiente\n\n"
                    "**Contenido por tarea:**\n"
                    "- Patrones de extensibilidad para ICBanking\n"
                    "- Referencias necesarias por capa\n"
                    "- Convenciones de nombres y ubicaciones\n"
                    "- Configuración de Unity IoC\n"
                    "- Ejemplos de código reales\n\n"
                    "NO intentes hacer todo de una vez. Usa el sistema de pasos."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "task_type": {
                            "type": "string",
                            "description": "Tipo de tarea a realizar",
                            "enum": [
                                "extend_business_component",
                                "create_data_access",
                                "create_service_agent",
                                "extend_api",
                                "configure_unity",
                                "understand_architecture",
                                "add_method_override",
                                "create_new_component"
                            ]
                        },
                        "component_name": {
                            "type": "string",
                            "description": "Nombre del componente/clase de ICBanking a extender o crear (opcional)"
                        },
                        "layer": {
                            "type": "string",
                            "description": "Capa de arquitectura donde trabajar (opcional)",
                            "enum": [
                                "BusinessComponents",
                                "DataAccess",
                                "ServiceAgents",
                                "AppServerApi",
                                "WebServerApi",
                                "BusinessEntities",
                                "Common"
                            ]
                        },
                        "details": {
                            "type": "string",
                            "description": "Detalles adicionales sobre la tarea (opcional)"
                        },
                        "step": {
                            "description": "Paso a ejecutar: 'overview' para ver plan, 1 para paso 1, 2 para paso 2, etc. Default: 'overview'",
                            "oneOf": [
                                {"type": "string", "enum": ["overview"]},
                                {"type": "integer", "minimum": 0, "maximum": 10}
                            ]
                        }
                    },
                    "required": ["task_type"]
                }
            ),
            Tool(
                name="find_callers",
                description=(
                    "🔍 Encuentra TODOS los métodos que llaman a un método específico.\n\n"
                    "Usa $graphLookup para traversal eficiente del grafo de llamadas.\n\n"
                    "🎯 USAR CUANDO:\n"
                    "- '¿Quién llama a este método?'\n"
                    "- 'Análisis de impacto: qué código se afecta si cambio X'\n"
                    "- '¿De dónde se invoca ProcessMessage?'\n\n"
                    "Retorna cadena de callers con profundidad de llamada."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "target_id": {
                            "type": "string",
                            "description": "ID del método/nodo objetivo (ej: 'grafo:mtd/a1b2c3d4')"
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Profundidad máxima de búsqueda (default: 3)",
                            "default": 3
                        },
                        "include_indirect": {
                            "type": "boolean",
                            "description": "Incluir llamadas indirectas via interfaces (default: true)",
                            "default": True
                        }
                    },
                    "required": ["target_id"]
                }
            ),
            Tool(
                name="find_callees",
                description=(
                    "➡️ Encuentra TODOS los métodos llamados por un método específico.\n\n"
                    "Usa $graphLookup para traversal del grafo de dependencias.\n\n"
                    "🎯 USAR CUANDO:\n"
                    "- '¿Qué métodos llama este código?'\n"
                    "- 'Dependencias de ProcessMessage'\n"
                    "- '¿Qué necesita este método para funcionar?'\n\n"
                    "Retorna árbol de callees con profundidad."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source_id": {
                            "type": "string",
                            "description": "ID del método/nodo origen (ej: 'grafo:mtd/a1b2c3d4')"
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Profundidad máxima de búsqueda (default: 3)",
                            "default": 3
                        },
                        "include_via_interface": {
                            "type": "boolean",
                            "description": "Incluir llamadas via abstracción de interfaces (default: true)",
                            "default": True
                        }
                    },
                    "required": ["source_id"]
                }
            ),
            Tool(
                name="find_inheritance_chain",
                description=(
                    "🔗 Obtiene la cadena completa de herencia de una clase.\n\n"
                    "Encuentra ancestors (clases base) y descendants (clases derivadas).\n\n"
                    "🎯 USAR CUANDO:\n"
                    "- '¿De qué hereda esta clase?'\n"
                    "- '¿Qué clases heredan de BaseAccount?'\n"
                    "- 'Jerarquía completa de herencia'\n\n"
                    "Retorna árbol de herencia con profundidad."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "class_id": {
                            "type": "string",
                            "description": "ID de la clase (ej: 'grafo:cls/a1b2c3d4')"
                        },
                        "max_depth": {
                            "type": "integer",
                            "description": "Profundidad máxima de búsqueda (default: 10)",
                            "default": 10
                        }
                    },
                    "required": ["class_id"]
                }
            )
        ]

    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        """
        Ejecuta una herramienta MCP.

        Args:
            tool_name: Nombre de la herramienta
            arguments: Argumentos de la herramienta

        Returns:
            Resultado en formato JSON string
        """
        try:
            if tool_name == "search_code":
                return await self._search_code(arguments)
            elif tool_name == "get_code_context":
                return await self._get_code_context(arguments)
            elif tool_name == "analyze_impact":
                return await self._analyze_impact(arguments)
            elif tool_name == "list_projects":
                return await self._list_projects(arguments)
            elif tool_name == "get_project_structure":
                return await self._get_project_structure(arguments)
            elif tool_name == "find_implementations":
                return await self._find_implementations(arguments)
            elif tool_name == "get_statistics":
                return await self._get_statistics(arguments)
            elif tool_name == "get_tailored_guidance":
                return await self._get_tailored_guidance(arguments)
            elif tool_name == "find_callers":
                return await self._find_callers(arguments)
            elif tool_name == "find_callees":
                return await self._find_callees(arguments)
            elif tool_name == "find_inheritance_chain":
                return await self._find_inheritance_chain(arguments)
            else:
                return f"# Error en Herramienta MCP\n\n❌ **Herramienta desconocida:** `{tool_name}`"
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
            return f"# Error en Herramienta MCP\n\n❌ **Error ejecutando `{tool_name}`:**\n\n```\n{str(e)}\n```\n\n**Argumentos:**\n```json\n{json.dumps(arguments, indent=2)}\n```"

    async def _search_code(self, args: Dict[str, Any]) -> str:
        """Busca código en el grafo versionado."""
        original_query = args["query"]
        node_type = args.get("node_type")

        # Validar que node_type esté presente (es requerido)
        if not node_type:
            return (
                "# Error en Búsqueda\n\n"
                "❌ **Parámetro requerido faltante:** `node_type`\n\n"
                "Esta herramienta requiere especificar el tipo de elemento a buscar.\n\n"
                "**Tipos válidos:**\n"
                "- `Method` - Métodos/funciones\n"
                "- `Class` - Clases\n"
                "- `Interface` - Interfaces\n"
                "- `Property` - Propiedades\n"
                "- `Field` - Campos\n"
                "- `Enum` - Enumeraciones\n"
                "- `Struct` - Estructuras\n\n"
                "**Ejemplo de uso correcto:**\n"
                "```json\n"
                "{\n"
                '  "query": "ProcessMessage",\n'
                '  "node_type": "Method"\n'
                "}\n"
                "```"
            )

        # Verificar si existe la versión
        if not await self.nodes_service.check_version_exists(self.default_version):
            versions = await self.nodes_service.get_available_versions()
            return (
                "# 🔍 Búsqueda en Grafo\n\n"
                f"❌ **Versión {self.default_version} no disponible**\n\n"
                f"**Versiones disponibles:** {versions}\n"
            )

        # Validar: si el query tiene múltiples términos, usar solo el primero
        query_parts = original_query.strip().split()
        actual_query = query_parts[0] if query_parts else original_query
        query_modified = len(query_parts) > 1

        # Obtener filtros adicionales
        class_name_filter = args.get("class_name")  # Nombre de la clase contenedora
        layer_filter = args.get("layer")  # Capa: BusinessComponents, DataAccess, etc.
        project_filter = args.get("project")  # Proyecto completo

        # Usar NodesQueryService para búsqueda en colección versionada
        # exact_first=True: primero busca coincidencia exacta, si no hay, hace búsqueda like
        results = await self.nodes_service.search_nodes(
            version=self.default_version,
            query=actual_query,
            node_type=node_type,
            solution=None,
            project=project_filter,
            limit=args.get("limit", 30),
            exact_first=True
        )

        # Filtrar por class_name (nombre de la clase contenedora)
        # Extrae la clase del fullName: "Namespace.ClassName.MethodName" -> "ClassName"
        if class_name_filter and results:
            def matches_class(r):
                full_name = r.get("fullName", "") or ""
                # fullName format: Namespace.ClassName.MethodName
                parts = full_name.rsplit(".", 2)
                if len(parts) >= 2:
                    containing_class = parts[-2]
                    return class_name_filter.lower() == containing_class.lower()
                return False

            filtered = [r for r in results if matches_class(r)]
            if filtered:
                results = filtered
                logger.info(f"Filtered by class_name '{class_name_filter}': {len(results)} results")

        # Filtrar por layer (capa de arquitectura)
        if layer_filter and results:
            filtered = [r for r in results if
                layer_filter.lower() in (r.get("namespace", "") or "").lower() or
                layer_filter.lower() in (r.get("project", "") or "").lower()
            ]
            if filtered:
                results = filtered
                logger.info(f"Filtered by layer '{layer_filter}': {len(results)} results")

        # Construir string de filtros aplicados
        filters_applied = [f"Tipo: `{node_type}`"]
        if class_name_filter:
            filters_applied.append(f"Clase: `{class_name_filter}`")
        if layer_filter:
            filters_applied.append(f"Capa: `{layer_filter}`")
        if project_filter:
            filters_applied.append(f"Proyecto: `{project_filter}`")
        filters_str = " | ".join(filters_applied)

        if not results:
            msg = f"# Búsqueda en Grafo de Código BASE de ICBanking\n\n"
            msg += f"**Versión:** `{self.default_version}`\n\n"
            if query_modified:
                msg += f"⚠️ **Query modificada:** Recibí `{original_query}` pero busqué solo `{actual_query}`\n\n"
            msg += f"❌ No se encontraron resultados para: **{actual_query}**\n\n"
            msg += f"**Filtros aplicados:** {filters_str}\n\n"
            msg += f"**Nota:** El grafo contiene SOLO el código base de ICBanking."
            return msg

        # Detectar si los resultados son exactos o parciales (por el nombre)
        is_exact = all(r.get("name", "").lower() == actual_query.lower() for r in results)
        display_results = results

        # Log para debug
        logger.info(f"search_code: found={len(results)}, exact={is_exact}, query='{actual_query}'")
        for r in results[:10]:
            logger.info(f"  - {r.get('name')} | {r.get('project')} | {r.get('namespace')}")

        # Separar implementaciones de interfaces para mostrar más claramente
        # Priorizar clases concretas sobre interfaces
        implementations = []
        interfaces = []
        for r in display_results:
            # Detectar si es una interfaz por el proyecto o namespace
            project = r.get("project", "") or ""
            namespace = r.get("namespace", "") or ""
            is_interface = (
                "Interface" in project or
                ".Interfaces" in namespace or
                project.endswith(".Interfaces")
            )
            if is_interface:
                interfaces.append(r)
            else:
                implementations.append(r)

        # Mostrar primero implementaciones, luego interfaces
        display_results = implementations + interfaces

        # Formatear resultados en Markdown
        md = f"# 🔍 Resultados de Búsqueda\n\n"
        md += f"**Versión:** `{self.default_version}`\n\n"

        if query_modified:
            md += f"⚠️ **Query modificada:** Recibí `{original_query}` pero busqué solo `{actual_query}`\n\n"
            md += "---\n\n"

        md += f"**Búsqueda:** `{actual_query}` | **Tipo:** `{node_type}`  \n"

        if is_exact:
            md += f"✅ **Coincidencias exactas:** {len(display_results)}\n"
        else:
            md += f"⚠️ **Sin coincidencias exactas** - mostrando {len(display_results)} resultados parciales\n"

        md += f"**Desglose:** {len(implementations)} implementaciones, {len(interfaces)} interfaces\n\n"

        if len(display_results) > 1:
            # Mostrar tabla resumen para fácil selección
            md += "## Resumen de Resultados\n\n"
            md += "| # | Nombre | Clase | Capa | Tipo |\n"
            md += "|---|--------|-------|------|------|\n"

            for i, node in enumerate(display_results, 1):
                node_name = node.get("name", "N/A")
                node_fullname = node.get("fullName", node_name)
                node_project = node.get("project", "N/A")
                node_layer = node.get("layer", "")
                namespace = node.get("namespace", "") or ""

                # Extraer clase contenedora
                class_name = ""
                if node_fullname:
                    parts = node_fullname.rsplit(".", 2)
                    if len(parts) >= 2:
                        class_name = parts[-2]

                # Detectar la capa desde el proyecto o namespace
                layer_info = node_layer
                if not layer_info:
                    if "DataAccess" in node_project or "DataAccess" in namespace:
                        layer_info = "DataAccess"
                    elif "BusinessComponents" in node_project or "BusinessComponents" in namespace:
                        layer_info = "BusinessComponents"
                    elif "BusinessEntities" in node_project or "BusinessEntities" in namespace:
                        layer_info = "BusinessEntities"
                    elif "ServiceAgent" in node_project or "ServiceAgent" in namespace:
                        layer_info = "ServiceAgents"
                    elif "Interface" in node_project or ".Interfaces" in namespace:
                        layer_info = "Interfaces"
                    else:
                        layer_info = node_project.split(".")[-1] if node_project else "N/A"

                # Detectar si es interfaz
                is_iface = node in interfaces
                type_label = "📋 Interface" if is_iface else "🏗️ Impl"

                md += f"| **{i}** | `{node_name}` | `{class_name}` | `{layer_info}` | {type_label} |\n"

            md += "\n---\n\n"

        md += "## Detalles de cada resultado\n\n"

        for i, node in enumerate(display_results, 1):
            node_name = node.get("name", "N/A")
            node_type_val = node.get("type", node.get("kind", "N/A"))
            node_project = node.get("project", "N/A")
            node_namespace = node.get("namespace", "")
            node_fullname = node.get("fullName", node_name)
            node_source = node.get("source", {})
            node_id = node.get("id", "")
            node_layer = node.get("layer", "")

            # Extraer clase contenedora para métodos desde fullName
            class_name = None
            if node_fullname:
                # fullName tiene formato: Namespace.ClassName.MethodName
                parts = node_fullname.rsplit(".", 2)
                if len(parts) >= 2:
                    class_name = parts[-2]

            md += f"### {i}. {node_name}"
            if class_name:
                md += f" (en `{class_name}`)"
            md += "\n\n"

            md += f"| Campo | Valor |\n"
            md += f"|-------|-------|\n"
            md += f"| **ID** | `{node_id}` |\n"

            if class_name:
                is_interface = class_name.startswith('I') and len(class_name) > 1 and class_name[1].isupper()
                if is_interface:
                    md += f"| **Clase/Interfaz** | `{class_name}` (Interface) |\n"
                else:
                    md += f"| **Clase** | `{class_name}` |\n"

            md += f"| **Tipo** | `{node_type_val}` |\n"
            md += f"| **Proyecto** | `{node_project}` |\n"

            if node_layer:
                md += f"| **Layer** | `{node_layer}` |\n"

            if node_namespace:
                md += f"| **Namespace** | `{node_namespace}` |\n"
            if node_fullname and node_fullname != node_name:
                md += f"| **FullName** | `{node_fullname}` |\n"

            if node_source and isinstance(node_source, dict):
                file_path = node_source.get('file', '')
                if file_path:
                    md += f"| **Ubicación** | `{file_path}` |\n"

            md += "\n"

        # Instrucciones finales
        md += "---\n\n"
        if len(display_results) > 1:
            md += "**¿Cuál deseas analizar?** Indica el número (1, 2, 3...) o la capa (DataAccess, BusinessComponents).\n"
        else:
            md += f"**➡️ Siguiente paso - usa este ID para `find_callers`, `find_callees`, o `find_inheritance_chain`:**\n"
            md += f"```json\n"
            md += f"{{\n"
            md += f'  "target_id": "{display_results[0].get("id", "")}"\n'
            md += f"}}\n"
            md += f"```\n"

        return md

    async def _get_source_info_batch(self, node_ids: list) -> dict:
        """
        Fetch source info (file, line) for multiple node IDs in batch.
        Returns dict: {node_id: {'file': path, 'line': number}}
        """
        if not node_ids:
            return {}

        try:
            collection = self.nodes_service._get_collection(self.default_version)
            result = {}

            # Query all nodes in one go
            cursor = collection.find(
                {"_id": {"$in": node_ids}},
                {"_id": 1, "source": 1}
            )

            async for doc in cursor:
                node_id = doc.get("_id", "")
                source = doc.get("source", {})
                if source:
                    result[node_id] = {
                        'file': source.get('file', ''),
                        'line': source.get('range', {}).get('start', 0)
                    }

            return result
        except Exception as e:
            logger.warning(f"Error fetching source info batch: {e}")
            return {}

    def _format_file_link(self, file_path: str, line: int = None) -> str:
        """
        Format a file path as a clickable link with line number.
        Returns: [filename](path/to/file.cs:line) or empty string if no path.
        """
        if not file_path:
            return ""

        # Extract just the filename for display
        import os
        filename = os.path.basename(file_path)

        # Format with line number if available
        if line and line > 0:
            return f"[{filename}:{line}]({file_path}:{line})"
        else:
            return f"[{filename}]({file_path})"

    def _format_name_as_link(self, name: str, file_path: str = None, line: int = None) -> str:
        """
        Format a name as a clickable link to the file:line.
        If no file info, returns the name as-is.
        Returns: [Name](path/to/file.cs:line) or Name
        """
        if not file_path:
            return name

        # Format with line number if available
        if line and line > 0:
            return f"[{name}]({file_path}:{line})"
        else:
            return f"[{name}]({file_path})"

    def _parse_grafo_id(self, grafo_id: str) -> tuple:
        """
        Parse a grafo ID to extract project and class/name.

        Format: grafo:{kind}/{project}/{fullName}
        Example: grafo:class/BackOffice.BusinessEntities/Infocorp.BackOffice.BusinessEntities.Communication.BOMessage

        Returns: (project, fullName)
        """
        if not grafo_id or not grafo_id.startswith('grafo:'):
            return ("", grafo_id)

        # Remove 'grafo:' prefix
        rest = grafo_id[6:]  # After 'grafo:'

        # Split by '/' - format is {kind}/{project}/{fullName}
        parts = rest.split('/', 2)  # Max 3 parts

        if len(parts) >= 3:
            # Has project: kind/project/fullName
            return (parts[1], parts[2])
        elif len(parts) == 2:
            # No project (structural nodes): kind/name
            return ("", parts[1])
        else:
            return ("", rest)

    def _consolidate_search_results(self, results, node_type: str) -> list:
        """
        Consolida resultados de búsqueda agrupando clase + interfaz relacionadas.

        Para métodos: agrupa UpdateState de Clase X con UpdateState de IClase X
        Para clases: agrupa Clase X con IClase X
        """
        if not results:
            return []

        # Agrupar por "identidad lógica"
        groups = {}

        for node in results:
            # Extraer el nombre base (sin I para interfaces)
            if node.Type == "Method":
                # Para métodos, usar ContainingType si está disponible, sino fallback a Namespace
                containing_name = ''
                if hasattr(node, 'ContainingType') and node.ContainingType:
                    # ContainingType tiene el nombre completo: "Namespace.ClassName"
                    parts = node.ContainingType.rsplit('.', 1)
                    containing_name = parts[-1] if parts else node.ContainingType
                elif node.Namespace:
                    # Fallback: último segmento del namespace
                    parts = node.Namespace.rsplit('.', 1)
                    containing_name = parts[-1] if len(parts) > 1 else ''

                # Normalizar: quitar I del inicio si es interfaz
                base_name = containing_name
                if containing_name.startswith('I') and len(containing_name) > 1 and containing_name[1].isupper():
                    base_name = containing_name[1:]

                # Key: namespace base + nombre método
                ns_base = ''
                if hasattr(node, 'ContainingType') and node.ContainingType:
                    parts = node.ContainingType.rsplit('.', 1)
                    ns_base = parts[0] if len(parts) > 1 else ''
                elif node.Namespace:
                    parts = node.Namespace.rsplit('.', 1)
                    ns_base = parts[0] if len(parts) > 1 else ''
                key = f"{ns_base}.{base_name}.{node.Name}"
            else:
                # Para clases/interfaces
                base_name = node.Name
                if node.Name.startswith('I') and len(node.Name) > 1 and node.Name[1].isupper():
                    base_name = node.Name[1:]
                key = f"{node.Namespace}.{base_name}" if node.Namespace else base_name

            if key not in groups:
                groups[key] = {'primary': None, 'interface': None, 'all': []}

            groups[key]['all'].append(node)

            # Determinar si es clase o interfaz
            is_interface = False
            if node.Type == "Interface":
                is_interface = True
            elif node.Type == "Method":
                # Usar ContainingType para determinar si es método de interfaz
                containing = ''
                if hasattr(node, 'ContainingType') and node.ContainingType:
                    parts = node.ContainingType.rsplit('.', 1)
                    containing = parts[-1] if parts else node.ContainingType
                elif node.Namespace:
                    containing = node.Namespace.rsplit('.', 1)[-1]
                is_interface = containing.startswith('I') and len(containing) > 1 and containing[1].isupper()

            if is_interface:
                if groups[key]['interface'] is None:
                    groups[key]['interface'] = node
            else:
                if groups[key]['primary'] is None:
                    groups[key]['primary'] = node

        # Construir lista consolidada
        consolidated = []
        for key, group in groups.items():
            # Preferir clase sobre interfaz como primario
            primary = group['primary'] or group['interface'] or group['all'][0]
            consolidated.append({
                'primary': primary,
                'interface': group['interface'] if group['primary'] else None
            })

        return consolidated

    async def _get_code_context(self, args: Dict[str, Any]) -> str:
        """Obtiene contexto de código desde la colección versionada."""
        class_name = args["className"]
        method_name = args.get("methodName")
        namespace = args.get("namespace")
        project = args.get("project")

        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# Contexto de Código\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    f"**Versiones disponibles:** {versions}\n"
                )

            # Buscar el elemento principal usando todos los filtros disponibles
            search_query = method_name if method_name else class_name
            results = await self.nodes_service.search_nodes(
                version=self.default_version,
                query=search_query,
                node_type="Method" if method_name else "Class",
                project=project,
                limit=50
            )

            # Filtrar por namespace si se proporcionó
            if namespace and results:
                filtered = [r for r in results if namespace.lower() in (r.get("namespace", "") or "").lower()]
                if filtered:
                    results = filtered

            # Filtrar por proyecto si se proporcionó
            if project and results:
                filtered = [r for r in results if project.lower() in (r.get("project", "") or "").lower()]
                if filtered:
                    results = filtered

            # PRIORIZAR MATCH EXACTO: filtrar por nombre exacto primero
            if results:
                exact_matches = [r for r in results if r.get("name", "").lower() == search_query.lower()]
                if exact_matches:
                    results = exact_matches

            if not results:
                md = f"# Contexto de Código BASE de ICBanking\n\n"
                md += f"❌ **No se encontró:** `{class_name}`\n\n"
                md += (
                    f"**Nota:** El grafo contiene SOLO el código base de ICBanking. "
                    f"Si buscas una clase Extended de Tailored, estas NO están en el grafo.\n"
                )
                return md

            # Tomar el mejor resultado
            target = results[0]
            target_id = target.get("id", "")

            # Obtener nodo completo con todas las relaciones
            node = await self.nodes_service.get_node_by_id(self.default_version, target_id)
            if not node:
                node = target

            # Formatear en Markdown
            md = f"# Contexto de Código BASE de ICBanking\n\n"
            md += f"**Versión:** `{self.default_version}`\n\n"

            # Elemento principal
            md += f"## 📦 Elemento Principal: {node.get('name', 'N/A')}\n\n"
            md += f"- **ID:** `{target_id}`\n"
            md += f"- **Tipo:** `{node.get('kind', 'N/A')}`\n"
            if node.get('namespace'):
                md += f"- **Namespace:** `{node.get('namespace')}`\n"
            md += f"- **Proyecto:** `{node.get('project', 'N/A')}`\n"

            if node.get('source'):
                source = node['source']
                if source.get('file'):
                    md += f"- **Ubicación:** `{source.get('file')}`\n"

            # Atributos
            attrs = []
            if node.get('accessibility'):
                attrs.append(node['accessibility'])
            if node.get('isAbstract'):
                attrs.append('abstract')
            if node.get('isStatic'):
                attrs.append('static')
            if node.get('isSealed'):
                attrs.append('sealed')
            if attrs:
                md += f"- **Atributos:** {', '.join(attrs)}\n"

            md += "\n---\n\n"

            # Relaciones embebidas en el nodo
            md += f"## 🔗 Relaciones en el Grafo\n\n"

            has_relations = False

            # Hereda de (outgoing inherits)
            if node.get('inherits'):
                has_relations = True
                md += f"### 🔼 Hereda de ({len(node['inherits'])})\n\n"
                for ref_id in node['inherits'][:10]:
                    md += f"- `{ref_id}`\n"
                if len(node['inherits']) > 10:
                    md += f"_... y {len(node['inherits']) - 10} más_\n"
                md += "\n"

            # Implementa (outgoing implements)
            if node.get('implements'):
                has_relations = True
                md += f"### ✅ Implementa ({len(node['implements'])})\n\n"
                for ref_id in node['implements'][:10]:
                    md += f"- `{ref_id}`\n"
                if len(node['implements']) > 10:
                    md += f"_... y {len(node['implements']) - 10} más_\n"
                md += "\n"

            # Buscar CALLERS (quién llama a este método) - consulta inversa
            collection = self.nodes_service._get_collection(self.default_version)
            callers = []
            async for doc in collection.find({"calls": target_id}).limit(20):
                callers.append(self.nodes_service._normalize_node(doc))

            # Obtener source info para callers
            caller_ids = [c.get('id') for c in callers]
            source_info = await self._get_source_info_batch(caller_ids)

            # Llamado por (incoming calls) - quién invoca este método
            if callers:
                has_relations = True
                # Separar clases de interfaces
                caller_classes = []
                caller_interfaces = []
                for caller in callers:
                    proj = caller.get('project', '') or ''
                    ns = caller.get('namespace', '') or ''
                    if 'Interface' in proj or '.Interfaces' in ns:
                        caller_interfaces.append(caller)
                    else:
                        caller_classes.append(caller)

                md += f"### ⬅️ Llamado por ({len(callers)})\n\n"

                if caller_classes:
                    md += "**Clases:**\n\n"
                    md += "| Clase/Método | Línea |\n"
                    md += "|-------------|-------|\n"
                    for caller in caller_classes[:10]:
                        caller_id = caller.get('id', '')
                        name = caller.get('fullName') or caller.get('name', 'N/A')
                        src = source_info.get(caller_id, {})
                        name_display = self._format_name_as_link(name, src.get('file'))
                        line_display = src.get('line', '') if src.get('line') else ''
                        md += f"| {name_display} | {line_display} |\n"
                    if len(caller_classes) > 10:
                        md += f"\n_... y {len(caller_classes) - 10} clases más_\n"
                    md += "\n"

                if caller_interfaces:
                    md += "**Interfaces:**\n\n"
                    md += "| Interface/Método | Línea |\n"
                    md += "|-----------------|-------|\n"
                    for caller in caller_interfaces[:5]:
                        caller_id = caller.get('id', '')
                        name = caller.get('fullName') or caller.get('name', 'N/A')
                        src = source_info.get(caller_id, {})
                        name_display = self._format_name_as_link(name, src.get('file'))
                        line_display = src.get('line', '') if src.get('line') else ''
                        md += f"| {name_display} | {line_display} |\n"
                    if len(caller_interfaces) > 5:
                        md += f"\n_... y {len(caller_interfaces) - 5} interfaces más_\n"
                    md += "\n"

            # Llama a (outgoing calls) - a quién llama este método
            if node.get('calls'):
                has_relations = True
                outgoing_ids = node['calls'][:20]
                outgoing_source_info = await self._get_source_info_batch(outgoing_ids)

                # Separar clases de interfaces
                call_classes = []
                call_interfaces = []
                for ref_id in outgoing_ids:
                    if 'Interface' in ref_id or '/I' in ref_id.split('/')[-1][:2]:
                        call_interfaces.append(ref_id)
                    else:
                        call_classes.append(ref_id)

                md += f"### ➡️ Llama a ({len(node['calls'])})\n\n"

                if call_classes:
                    md += "**Clases:**\n\n"
                    md += "| Clase/Método | Línea |\n"
                    md += "|-------------|-------|\n"
                    for ref_id in call_classes[:10]:
                        proj, name = self._parse_grafo_id(ref_id)
                        src = outgoing_source_info.get(ref_id, {})
                        name_display = self._format_name_as_link(name, src.get('file'))
                        line_display = src.get('line', '') if src.get('line') else ''
                        md += f"| {name_display} | {line_display} |\n"
                    if len(call_classes) > 10:
                        md += f"\n_... y {len(call_classes) - 10} clases más_\n"
                    md += "\n"

                if call_interfaces:
                    md += "**Interfaces:**\n\n"
                    md += "| Interface/Método | Línea |\n"
                    md += "|-----------------|-------|\n"
                    for ref_id in call_interfaces[:5]:
                        proj, name = self._parse_grafo_id(ref_id)
                        src = outgoing_source_info.get(ref_id, {})
                        name_display = self._format_name_as_link(name, src.get('file'))
                        line_display = src.get('line', '') if src.get('line') else ''
                        md += f"| {name_display} | {line_display} |\n"
                    if len(call_interfaces) > 5:
                        md += f"\n_... y {len(call_interfaces) - 5} interfaces más_\n"
                    md += "\n"

                if len(node['calls']) > 20:
                    md += f"_... y {len(node['calls']) - 20} más en total_\n\n"

            # Usa (outgoing uses) - tipos/clases que usa
            if node.get('uses'):
                has_relations = True
                uses_ids = node['uses'][:10]
                uses_source_info = await self._get_source_info_batch(uses_ids)

                md += f"### 📦 Usa ({len(node['uses'])})\n\n"
                md += "| Clase | Línea |\n"
                md += "|-------|-------|\n"
                for ref_id in uses_ids:
                    proj, name = self._parse_grafo_id(ref_id)
                    src = uses_source_info.get(ref_id, {})
                    name_display = self._format_name_as_link(name, src.get('file'))
                    line_display = src.get('line', '') if src.get('line') else ''
                    md += f"| {name_display} | {line_display} |\n"
                md += "\n"
                if len(node['uses']) > 10:
                    md += f"_... y {len(node['uses']) - 10} más_\n\n"

            # Contiene (outgoing contains)
            if node.get('contains'):
                has_relations = True
                md += f"### 📁 Contiene ({len(node['contains'])})\n\n"
                for ref_id in node['contains'][:20]:
                    _, name = self._parse_grafo_id(ref_id)
                    md += f"- `{name}`\n"
                if len(node['contains']) > 20:
                    md += f"_... y {len(node['contains']) - 20} más_\n"
                md += "\n"

            # Contenido en - mostrar ruta del archivo si es un file
            if node.get('containedIn'):
                has_relations = True
                contained_in = node['containedIn']
                md += f"### 📂 Contenido en\n\n"
                # Si es un archivo, mostrar la ubicación del source
                if contained_in.startswith('grafo:file/'):
                    # Usar la ubicación del source del nodo actual
                    if node.get('source') and node['source'].get('file'):
                        md += f"- `{node['source']['file']}`\n\n"
                    else:
                        # Extraer nombre del archivo del ID
                        file_name = contained_in.replace('grafo:file/', '')
                        md += f"- `{file_name}`\n\n"
                else:
                    _, name = self._parse_grafo_id(contained_in)
                    md += f"- `{name}`\n\n"

            if not has_relations:
                md += "_No se encontraron relaciones directas para este elemento._\n\n"

            # Resumen
            total_incoming = len(callers)
            total_outgoing = (
                len(node.get('calls', [])) +
                len(node.get('uses', []))
            )
            md += f"---\n\n"
            md += f"**📊 Resumen:** {total_incoming} llamadas entrantes, {total_outgoing} dependencias salientes\n"

            return md

        except Exception as e:
            logger.error(f"Error getting code context: {e}", exc_info=True)
            return f"# Contexto de Código\n\n❌ Error: {str(e)}"

    async def _list_projects(self, args: Dict[str, Any]) -> str:
        """Lista proyectos disponibles en la colección versionada."""
        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# Proyectos en el Grafo\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    f"**Versiones disponibles:** {versions}\n"
                )

            # Agregar proyectos desde la colección de nodos
            collection = self.nodes_service._get_collection(self.default_version)
            query_filter = args.get("query")

            pipeline = [
                {"$group": {
                    "_id": "$project",
                    "count": {"$sum": 1},
                    "solutions": {"$addToSet": "$solution"}
                }},
                {"$sort": {"_id": 1}},
                {"$limit": args.get("limit", 50)}
            ]

            if query_filter:
                pipeline.insert(0, {"$match": {"project": {"$regex": query_filter, "$options": "i"}}})

            projects = []
            async for doc in collection.aggregate(pipeline):
                if doc["_id"]:  # Skip None projects
                    projects.append({
                        "name": doc["_id"],
                        "nodeCount": doc["count"],
                        "solutions": doc["solutions"]
                    })

            if not projects:
                return "# Proyectos Código BASE de ICBanking en el Grafo\n\n❌ No se encontraron proyectos"

            # Formatear en Markdown
            md = "# Proyectos Código BASE de ICBanking en el Grafo\n\n"
            md += f"**Versión:** `{self.default_version}`\n"
            md += f"**Total de proyectos encontrados:** {len(projects)}\n\n"
            md += "---\n\n"

            for i, project in enumerate(projects, 1):
                md += f"## {i}. {project['name']}\n\n"
                md += f"- **Elementos:** {project['nodeCount']} nodos\n"
                if project['solutions']:
                    md += f"- **Soluciones:** {', '.join(filter(None, project['solutions']))}\n"
                md += "\n"

            return md

        except Exception as e:
            logger.error(f"Error listing projects: {e}", exc_info=True)
            return f"# Proyectos en el Grafo\n\n❌ Error: {str(e)}"

    async def _get_project_structure(self, args: Dict[str, Any]) -> str:
        """Obtiene estructura de un proyecto desde la colección versionada."""
        project_id = args["project_id"]
        filter_type = args.get("node_type")

        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# Estructura de Proyecto\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    f"**Versiones disponibles:** {versions}\n"
                )

            # Usar NodesQueryService para obtener nodos del proyecto
            nodes = await self.nodes_service.get_nodes_by_project(
                version=self.default_version,
                project=project_id,
                node_type=filter_type,
                limit=1000
            )

            if not nodes:
                return f"# Estructura de Proyecto - Grafo Código BASE de ICBanking\n\n❌ No se encontraron elementos en el proyecto: **`{project_id}`**"

            # Agrupar por tipo (kind)
            by_type = {}
            for node in nodes:
                node_kind = node.get("kind", node.get("type", "unknown"))
                if node_kind not in by_type:
                    by_type[node_kind] = []
                by_type[node_kind].append(node)

            # Formatear en Markdown
            md = f"# Estructura de Proyecto - Grafo Código BASE de ICBanking\n\n"
            md += f"**Versión:** `{self.default_version}`\n"
            md += f"**Proyecto:** `{project_id}`  \n"
            md += f"**Total de elementos:** {len(nodes)}\n\n"
            md += "---\n\n"

            for tipo, elementos in sorted(by_type.items()):
                md += f"## {tipo}s ({len(elementos)})\n\n"

                for elem in elementos[:20]:  # Limitar a 20 por tipo
                    elem_name = elem.get("name", "N/A")
                    elem_namespace = elem.get("namespace", "")
                    elem_id = elem.get("id", "")

                    md += f"### `{elem_name}`\n\n"
                    md += f"- **ID:** `{elem_id}`\n"
                    if elem_namespace:
                        md += f"- **Namespace:** `{elem_namespace}`\n"

                    # Mostrar atributos relevantes
                    attrs = []
                    if elem.get("isAbstract"):
                        attrs.append("`abstract`")
                    if elem.get("isStatic"):
                        attrs.append("`static`")
                    if elem.get("isSealed"):
                        attrs.append("`sealed`")
                    if elem.get("accessibility"):
                        attrs.append(f"`{elem.get('accessibility')}`")
                    if attrs:
                        md += f"- **Atributos:** {', '.join(attrs)}\n"

                    md += "\n"

                if len(elementos) > 20:
                    md += f"_... y {len(elementos) - 20} elementos más de tipo {tipo}_\n\n"

            return md

        except Exception as e:
            logger.error(f"Error getting project structure: {e}", exc_info=True)
            return f"# Estructura de Proyecto\n\n❌ Error: {str(e)}"

    async def _find_implementations(self, args: Dict[str, Any]) -> str:
        """Encuentra implementaciones de una interfaz o herencias usando colección versionada."""
        interface_name = args["interface_or_class"]

        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# Implementaciones y Herencias\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    f"**Versiones disponibles:** {versions}\n"
                )

            # Buscar la interfaz/clase primero
            all_results = await self.nodes_service.search_nodes(
                version=self.default_version,
                query=interface_name,
                node_type=None,
                limit=20
            )

            if not all_results:
                return f"# Implementaciones y Herencias - Grafo Código BASE de ICBanking\n\n❌ No se encontró: **`{interface_name}`**"

            # Priorizar: Interface > Class > otros
            def priority(node):
                kind = node.get("kind", "").lower()
                if kind == "interface":
                    return 0
                elif kind == "class":
                    return 1
                elif kind in ["struct", "enum"]:
                    return 2
                else:
                    return 3

            filtered_results = [n for n in all_results if n.get("kind", "").lower() not in ["file", "project"]]
            if not filtered_results:
                filtered_results = all_results

            filtered_results.sort(key=priority)
            target = filtered_results[0]
            target_id = target.get("id", "")
            target_kind = target.get("kind", "")

            # Usar NodesQueryService para encontrar implementaciones
            if target_kind.lower() == "interface":
                result = await self.nodes_service.find_implementations(
                    version=self.default_version,
                    interface_id=target_id
                )
                implementations_list = result.get("implementations", [])
            else:
                # Para clases, buscar en la cadena de herencia
                result = await self.nodes_service.find_inheritance_chain(
                    version=self.default_version,
                    class_id=target_id,
                    max_depth=10
                )
                implementations_list = [d.get("node", {}) for d in result.get("descendants", [])]

            # Formatear en Markdown
            md = f"# Implementaciones y Herencias - Grafo Código BASE de ICBanking\n\n"
            md += f"**Versión:** `{self.default_version}`\n\n"
            md += f"## 🎯 Elemento Base\n\n"
            md += f"- **ID:** `{target_id}`\n"
            md += f"- **Nombre:** `{target.get('name', 'N/A')}`\n"
            md += f"- **Tipo:** `{target_kind}`\n"
            md += f"- **Namespace:** `{target.get('namespace') or '(global)'}`\n"
            md += f"- **Proyecto:** `{target.get('project', 'N/A')}`\n\n"

            if len(all_results) > 1:
                md += f"_Se encontraron {len(all_results)} coincidencias, seleccionando el de tipo {target_kind}_\n\n"

            md += "---\n\n"

            if not implementations_list:
                md += f"❌ **No se encontraron implementaciones o herencias** de este elemento.\n\n"
                if target_kind.lower() == "interface":
                    md += "_Tip: Verifica que existan clases que implementen esta interfaz._"
                else:
                    md += "_Tip: Verifica que existan clases que hereden de esta clase base._"
                return md

            relationship_type = "Implementaciones" if target_kind.lower() == "interface" else "Herencias"
            md += f"## 🏗️ {relationship_type} Encontradas ({len(implementations_list)})\n\n"

            for impl in implementations_list[:30]:  # Limitar a 30
                impl_name = impl.get("name", "N/A")
                impl_id = impl.get("id", "")
                impl_namespace = impl.get("namespace", "")
                impl_project = impl.get("project", "N/A")
                impl_kind = impl.get("kind", "class")

                md += f"### `{impl_name}`\n\n"
                md += f"- **ID:** `{impl_id}`\n"
                md += f"- **Tipo:** `{impl_kind}`\n"
                if impl_namespace:
                    md += f"- **Namespace:** `{impl_namespace}`\n"
                md += f"- **Proyecto:** `{impl_project}`\n\n"

            if len(implementations_list) > 30:
                md += f"_... y {len(implementations_list) - 30} más_\n\n"

            md += "---\n\n"
            md += f"## 📊 Resumen\n\n"
            md += f"- **Total de {relationship_type.lower()}:** {len(implementations_list)}\n\n"
            md += f"**💡 Análisis de Impacto:** Modificar `{target.get('name')}` afectará a **{len(implementations_list)} elementos**."

            return md

        except Exception as e:
            logger.error(f"Error finding implementations: {e}", exc_info=True)
            return f"# Implementaciones y Herencias\n\n❌ Error: {str(e)}"

    async def _analyze_impact(self, args: Dict[str, Any]) -> str:
        """Genera un análisis de impacto detallado usando la colección versionada."""
        class_name = args["className"]

        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# 📊 Análisis de Impacto\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    f"**Versiones disponibles:** {versions}\n"
                )

            # Buscar el elemento
            results = await self.nodes_service.search_nodes(
                version=self.default_version,
                query=class_name,
                node_type=None,
                limit=10
            )

            if not results:
                return f"# 📊 Análisis de Impacto\n\n❌ **No se encontró:** `{class_name}`"

            # Tomar el primer resultado
            target = results[0]
            target_id = target.get("id", "")
            target_name = target.get("name", "N/A")
            target_kind = target.get("kind", "")

            # Obtener datos completos del nodo
            target_full = await self.nodes_service.get_node_by_id(self.default_version, target_id)
            if not target_full:
                target_full = target

            collection = self.nodes_service._get_collection(self.default_version)

            # Dependencias salientes (lo que este nodo usa/llama)
            outgoing_calls = target_full.get("calls", [])
            outgoing_via = target_full.get("callsVia", [])
            outgoing_implements = target_full.get("implements", [])
            outgoing_inherits = target_full.get("inherits", [])
            outgoing_uses = target_full.get("uses", [])

            # Dependencias entrantes (quien depende de este nodo)
            incoming_callers = []
            incoming_implementers = []
            incoming_inheritors = []

            # Buscar nodos que llaman a este
            async for doc in collection.find({"calls": target_id}):
                incoming_callers.append(self.nodes_service._normalize_node(doc))

            # Buscar nodos que implementan esta interfaz
            async for doc in collection.find({"implements": target_id}):
                incoming_implementers.append(self.nodes_service._normalize_node(doc))

            # Buscar nodos que heredan de esta clase
            async for doc in collection.find({"inherits": target_id}):
                incoming_inheritors.append(self.nodes_service._normalize_node(doc))

            # Calcular proyectos afectados
            affected_projects = set()
            for node in incoming_callers + incoming_implementers + incoming_inheritors:
                if node.get("project"):
                    affected_projects.add(node["project"])

            # Determinar nivel de impacto
            total_incoming = len(incoming_callers) + len(incoming_implementers) + len(incoming_inheritors)
            impact_level = "🟢 LOW"
            if total_incoming > 10 or len(incoming_implementers) > 0 or len(incoming_inheritors) > 0:
                impact_level = "🔴 HIGH"
            elif total_incoming > 5:
                impact_level = "🟡 MEDIUM"

            # Formatear en Markdown
            md = f"# 📊 Análisis de Impacto - Grafo Código BASE de ICBanking\n\n"
            md += f"**Versión:** `{self.default_version}`\n\n"

            # Elemento analizado
            md += f"## 🎯 Elemento Analizado\n\n"
            md += f"- **ID:** `{target_id}`\n"
            md += f"- **Nombre:** `{target_name}`\n"
            md += f"- **Tipo:** `{target_kind}`\n"
            md += f"- **Namespace:** `{target_full.get('namespace', '')}`\n"
            md += f"- **Proyecto:** `{target_full.get('project', 'N/A')}`\n\n"

            # Nivel de impacto
            md += f"## ⚠️ Nivel de Impacto: {impact_level}\n\n"

            # Resumen ejecutivo
            md += f"### 📈 Resumen Ejecutivo\n\n"
            md += f"| Métrica | Cantidad |\n"
            md += f"|---------|----------|\n"
            md += f"| Callers (quien llama) | **{len(incoming_callers)}** |\n"
            md += f"| Implementadores | **{len(incoming_implementers)}** |\n"
            md += f"| Herederos | **{len(incoming_inheritors)}** |\n"
            md += f"| Llamadas salientes | **{len(outgoing_calls)}** |\n"
            md += f"| Proyectos afectados | **{len(affected_projects)}** |\n\n"

            md += "---\n\n"

            # Dependencias entrantes
            if incoming_callers:
                md += f"## ⬅️ Callers ({len(incoming_callers)})\n\n"
                md += f"**Métodos que llaman a `{target_name}`:**\n\n"
                for caller in incoming_callers[:15]:
                    md += f"- `{caller.get('name')}` ({caller.get('kind')}) - `{caller.get('project', 'N/A')}`\n"
                if len(incoming_callers) > 15:
                    md += f"\n_... y {len(incoming_callers) - 15} más_\n"
                md += "\n---\n\n"

            if incoming_implementers:
                md += f"## 🏗️ Implementadores ({len(incoming_implementers)})\n\n"
                md += f"**⚠️ IMPACTO ALTO** - Clases que implementan `{target_name}`:\n\n"
                for impl in incoming_implementers[:15]:
                    md += f"- `{impl.get('name')}` - `{impl.get('project', 'N/A')}`\n"
                md += "\n---\n\n"

            if incoming_inheritors:
                md += f"## 🔗 Herederos ({len(incoming_inheritors)})\n\n"
                md += f"**⚠️ IMPACTO ALTO** - Clases que heredan de `{target_name}`:\n\n"
                for inh in incoming_inheritors[:15]:
                    md += f"- `{inh.get('name')}` - `{inh.get('project', 'N/A')}`\n"
                md += "\n---\n\n"

            # Dependencias salientes
            if outgoing_calls:
                md += f"## ➡️ Llamadas Salientes ({len(outgoing_calls)})\n\n"
                for call_id in outgoing_calls[:10]:
                    md += f"- `{call_id}`\n"
                if len(outgoing_calls) > 10:
                    md += f"\n_... y {len(outgoing_calls) - 10} más_\n"
                md += "\n---\n\n"

            # Proyectos afectados
            if affected_projects:
                md += f"## 📦 Proyectos Afectados ({len(affected_projects)})\n\n"
                for project in sorted(affected_projects):
                    md += f"- `{project}`\n"
                md += "\n---\n\n"

            # Recomendaciones
            md += f"## 💡 Recomendaciones\n\n"
            if impact_level == "🔴 HIGH":
                md += f"⚠️ **ALTO IMPACTO** - Procede con precaución:\n\n"
                md += f"- ✅ Revisa **TODAS** las {total_incoming} dependencias antes de hacer cambios\n"
                if incoming_implementers or incoming_inheritors:
                    md += f"- ✅ Cambios de firma serán breaking changes\n"
                md += f"- ✅ Coordina con los {len(affected_projects)} proyectos afectados\n"
            elif impact_level == "🟡 MEDIUM":
                md += f"⚡ **IMPACTO MEDIO** - Revisión recomendada:\n\n"
                md += f"- ✅ Revisa las {total_incoming} dependencias\n"
            else:
                md += f"✅ **BAJO IMPACTO** - Cambios manejables\n"

            return md

        except Exception as e:
            logger.error(f"Error analyzing impact: {e}", exc_info=True)
            return f"# 📊 Análisis de Impacto\n\n❌ Error: {str(e)}"

    async def _get_statistics(self, args: Dict[str, Any]) -> str:
        """Obtiene estadísticas del grafo versionado."""
        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# 📊 Estadísticas del Grafo\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    f"**Versiones disponibles:** {versions}\n"
                )

            stats = await self.nodes_service.get_statistics(self.default_version)

            # Formatear en Markdown
            md = "# 📊 Estadísticas del Grafo Código BASE de ICBanking\n\n"
            md += f"**Versión:** `{self.default_version}`  \n"
            md += f"**Colección:** `nodes_{self.default_version.replace('.', '_')}`\n\n"

            if isinstance(stats, dict):
                # Información general
                md += "## Resumen General\n\n"

                if "totalProjects" in stats:
                    md += f"- **Total de Proyectos:** {stats['totalProjects']}\n"
                if "totalSolutions" in stats:
                    md += f"- **Total de Soluciones:** {stats['totalSolutions']}\n"
                if "totalNodes" in stats:
                    md += f"- **Total de Nodos (Elementos):** {stats['totalNodes']}\n"

                md += "\n"

                # Distribución por tipos
                if "nodesByType" in stats and stats["nodesByType"]:
                    md += "## 📦 Distribución de Elementos por Tipo\n\n"
                    md += "| Tipo | Cantidad |\n"
                    md += "|------|----------|\n"

                    for node_type, count in sorted(stats["nodesByType"].items(), key=lambda x: x[1], reverse=True):
                        md += f"| {node_type} | **{count}** |\n"

                    md += "\n"

            else:
                md += f"```\n{stats}\n```\n"

            return md

        except Exception as e:
            logger.error(f"Error getting statistics: {e}", exc_info=True)
            return f"# 📊 Estadísticas del Grafo\n\n❌ Error: {str(e)}"

    async def _get_tailored_guidance(self, args: Dict[str, Any]) -> str:
        """
        Genera guía especializada para trabajar en Tailored.

        Delega al servicio TailoredGuidanceService para toda la lógica.
        Pasa la versión del grafo al servicio para generar guías apropiadas.
        """
        # Agregar versión del grafo a los argumentos
        args_with_version = {**args, "version": self.default_version}
        return await self.tailored_guidance.get_tailored_guidance(args_with_version)

    async def _find_callers(self, args: Dict[str, Any]) -> str:
        """
        Encuentra todos los métodos que llaman a un método específico.
        Usa colecciones versionadas (nodes_{version}).
        """
        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# 🔍 Find Callers\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    "No se encontró la colección de nodos para esta versión.\n\n"
                    "**Versiones disponibles:**\n"
                    f"```\n{versions}\n```\n\n"
                    "**Para indexar:**\n"
                    "```bash\n"
                    "cd Grafo/IndexerDb\n"
                    f"dotnet run --all --version {self.default_version}\n"
                    "```"
                )

            result = await self.nodes_service.find_callers(
                version=self.default_version,
                target_id=args["target_id"],
                max_depth=args.get("max_depth", 3),
                include_indirect=args.get("include_indirect", True)
            )

            if not result.get("found"):
                return f"# 🔍 Find Callers\n\n❌ {result.get('message', 'Nodo no encontrado')}"

            # Formatear resultado
            md = "# 🔍 Find Callers - Análisis de Impacto\n\n"
            md += f"## 🎯 Método Objetivo\n\n"

            target = result.get("target", {})
            md += f"- **ID:** `{target.get('id', 'N/A')}`\n"
            md += f"- **Nombre:** `{target.get('name', 'N/A')}`\n"
            md += f"- **Tipo:** `{target.get('type', 'N/A')}`\n"
            md += f"- **Proyecto:** `{target.get('project', 'N/A')}`\n\n"

            callers = result.get("callers", [])
            indirect = result.get("indirectCallers", [])
            total = result.get("totalCallers", 0)

            md += f"## 📊 Resumen\n\n"
            md += f"- **Callers directos:** {len(callers)}\n"
            md += f"- **Callers indirectos:** {len(indirect)}\n"
            md += f"- **Total:** {total}\n\n"

            if callers:
                md += "## ⬅️ Callers Directos\n\n"
                md += "| Nombre | Tipo | Profundidad | Proyecto |\n"
                md += "|--------|------|-------------|----------|\n"
                for c in callers[:20]:
                    node = c.get("node", {})
                    md += f"| `{node.get('name', 'N/A')}` | {node.get('type', 'N/A')} | {c.get('depth', 0)} | {node.get('project', 'N/A')} |\n"
                if len(callers) > 20:
                    md += f"\n_... y {len(callers) - 20} más_\n"

            if indirect:
                md += "\n## 🔗 Callers Indirectos (via interfaces)\n\n"
                md += "| Nombre | Tipo | Profundidad | Proyecto |\n"
                md += "|--------|------|-------------|----------|\n"
                for c in indirect[:20]:
                    node = c.get("node", {})
                    md += f"| `{node.get('name', 'N/A')}` | {node.get('type', 'N/A')} | {c.get('depth', 0)} | {node.get('project', 'N/A')} |\n"

            return md

        except Exception as e:
            logger.error(f"Error in find_callers: {e}", exc_info=True)
            return f"# 🔍 Find Callers\n\n❌ Error: {str(e)}"

    async def _find_callees(self, args: Dict[str, Any]) -> str:
        """
        Encuentra todos los métodos llamados por un método específico.
        Usa colecciones versionadas (nodes_{version}).
        """
        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# ➡️ Find Callees\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    "No se encontró la colección de nodos para esta versión.\n\n"
                    "**Versiones disponibles:**\n"
                    f"```\n{versions}\n```\n\n"
                    "**Para indexar:**\n"
                    "```bash\n"
                    "cd Grafo/IndexerDb\n"
                    f"dotnet run --all --version {self.default_version}\n"
                    "```"
                )

            result = await self.nodes_service.find_callees(
                version=self.default_version,
                source_id=args["source_id"],
                max_depth=args.get("max_depth", 3),
                include_via_interface=args.get("include_via_interface", True)
            )

            if not result.get("found"):
                return f"# ➡️ Find Callees\n\n❌ {result.get('message', 'Nodo no encontrado')}"

            # Formatear resultado
            md = "# ➡️ Find Callees - Análisis de Dependencias\n\n"
            md += f"## 🎯 Método Origen\n\n"

            source = result.get("source", {})
            md += f"- **ID:** `{source.get('id', 'N/A')}`\n"
            md += f"- **Nombre:** `{source.get('name', 'N/A')}`\n"
            md += f"- **Tipo:** `{source.get('type', 'N/A')}`\n"
            md += f"- **Proyecto:** `{source.get('project', 'N/A')}`\n\n"

            callees = result.get("callees", [])
            via_interface = result.get("viaInterface", [])
            total = result.get("totalCallees", 0)

            md += f"## 📊 Resumen\n\n"
            md += f"- **Callees directos:** {len(callees)}\n"
            md += f"- **Callees via interface:** {len(via_interface)}\n"
            md += f"- **Total:** {total}\n\n"

            if callees:
                md += "## ➡️ Métodos Llamados\n\n"
                md += "| Nombre | Tipo | Profundidad | Proyecto |\n"
                md += "|--------|------|-------------|----------|\n"
                for c in callees[:20]:
                    node = c.get("node", {})
                    md += f"| `{node.get('name', 'N/A')}` | {node.get('type', 'N/A')} | {c.get('depth', 0)} | {node.get('project', 'N/A')} |\n"
                if len(callees) > 20:
                    md += f"\n_... y {len(callees) - 20} más_\n"

            if via_interface:
                md += "\n## 🔗 Llamadas via Interface\n\n"
                md += "| Nombre | Tipo | Profundidad | Proyecto |\n"
                md += "|--------|------|-------------|----------|\n"
                for c in via_interface[:20]:
                    node = c.get("node", {})
                    md += f"| `{node.get('name', 'N/A')}` | {node.get('type', 'N/A')} | {c.get('depth', 0)} | {node.get('project', 'N/A')} |\n"

            return md

        except Exception as e:
            logger.error(f"Error in find_callees: {e}", exc_info=True)
            return f"# ➡️ Find Callees\n\n❌ Error: {str(e)}"

    async def _find_inheritance_chain(self, args: Dict[str, Any]) -> str:
        """
        Encuentra la cadena completa de herencia de una clase.
        Usa colecciones versionadas (nodes_{version}).
        """
        try:
            # Verificar si existe la versión
            if not await self.nodes_service.check_version_exists(self.default_version):
                versions = await self.nodes_service.get_available_versions()
                return (
                    "# 🔗 Inheritance Chain\n\n"
                    f"❌ **Versión {self.default_version} no disponible**\n\n"
                    "No se encontró la colección de nodos para esta versión.\n\n"
                    "**Versiones disponibles:**\n"
                    f"```\n{versions}\n```\n\n"
                    "**Para indexar:**\n"
                    "```bash\n"
                    "cd Grafo/IndexerDb\n"
                    f"dotnet run --all --version {self.default_version}\n"
                    "```"
                )

            result = await self.nodes_service.find_inheritance_chain(
                version=self.default_version,
                class_id=args["class_id"],
                max_depth=args.get("max_depth", 10)
            )

            if not result.get("found"):
                return f"# 🔗 Inheritance Chain\n\n❌ {result.get('message', 'Clase no encontrada')}"

            # Formatear resultado
            md = "# 🔗 Inheritance Chain - Jerarquía de Herencia\n\n"
            md += f"## 🎯 Clase Analizada\n\n"

            class_node = result.get("class", {})
            md += f"- **ID:** `{class_node.get('id', 'N/A')}`\n"
            md += f"- **Nombre:** `{class_node.get('name', 'N/A')}`\n"
            md += f"- **Tipo:** `{class_node.get('type', 'N/A')}`\n"
            md += f"- **Proyecto:** `{class_node.get('project', 'N/A')}`\n\n"

            ancestors = result.get("ancestors", [])
            descendants = result.get("descendants", [])

            md += f"## 📊 Resumen\n\n"
            md += f"- **Ancestors (clases base):** {len(ancestors)}\n"
            md += f"- **Descendants (clases derivadas):** {len(descendants)}\n"
            md += f"- **Profundidad en jerarquía:** {result.get('hierarchyDepth', 0)}\n\n"

            if ancestors:
                md += "## 🔼 Ancestors (Hereda de)\n\n"
                md += "| Nombre | Tipo | Profundidad | Proyecto |\n"
                md += "|--------|------|-------------|----------|\n"
                for a in ancestors:
                    node = a.get("node", {})
                    md += f"| `{node.get('name', 'N/A')}` | {node.get('type', 'N/A')} | {a.get('depth', 0)} | {node.get('project', 'N/A')} |\n"

            if descendants:
                md += "\n## 🔽 Descendants (Heredan de esta)\n\n"
                md += "| Nombre | Tipo | Profundidad | Proyecto |\n"
                md += "|--------|------|-------------|----------|\n"
                for d in descendants[:30]:
                    node = d.get("node", {})
                    md += f"| `{node.get('name', 'N/A')}` | {node.get('type', 'N/A')} | {d.get('depth', 0)} | {node.get('project', 'N/A')} |\n"
                if len(descendants) > 30:
                    md += f"\n_... y {len(descendants) - 30} más_\n"

            md += "\n---\n\n"
            md += f"**💡 Impacto:** Modificar `{class_node.get('name', 'N/A')}` afectará a **{len(descendants)} clases derivadas**."

            return md

        except Exception as e:
            logger.error(f"Error in find_inheritance_chain: {e}", exc_info=True)
            return f"# 🔗 Inheritance Chain\n\n❌ Error: {str(e)}"
