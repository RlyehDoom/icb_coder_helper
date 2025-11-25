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

from .services import GraphQueryService
from .models import (
    SearchNodesRequest,
    CodeContextRequest,
    SearchProjectsRequest
)
from .tailored_guidance import TailoredGuidanceService
from .config import GRAFO_DEFAULT_VERSION

logger = logging.getLogger(__name__)


class GraphMCPTools:
    """Herramientas MCP para consultar el grafo de código."""

    def __init__(self, graph_service: GraphQueryService, default_version: str = None):
        """
        Inicializa las herramientas MCP.

        Args:
            graph_service: Servicio de consultas del grafo
            default_version: Versión por defecto del grafo a consultar (e.g., "1.0.0")
        """
        self.graph_service = graph_service
        self.tailored_guidance = TailoredGuidanceService(graph_service)
        self.default_version = default_version or GRAFO_DEFAULT_VERSION

        if self.default_version:
            logger.info(f"🏷️  MCP Tools configurado con versión por defecto: {self.default_version}")

    def get_tools(self) -> List[Tool]:
        """Retorna la lista de herramientas MCP disponibles."""
        return [
            Tool(
                name="search_code",
                description=(
                    "🔍 PRIMERA HERRAMIENTA A USAR - Ubica componentes en el grafo de código BASE de ICBanking.\n\n"
                    "⚠️ REGLA OBLIGATORIA: Cuando trabajes en proyectos /ICBanking/* o /Tailored/*, "
                    "SIEMPRE debes usar este MCP para consultar el grafo de código.\n\n"
                    "USA ESTA TOOL PRIMERO para localizar el componente exacto que el usuario menciona. "
                    "Retorna información precisa (Namespace, Proyecto) que necesitas para llamar a get_code_context.\n\n"
                    "🎯 EJEMPLOS DE USO:\n"
                    "- 'método UpdateState de clase Geolocation' → query='UpdateState', node_type='Method', class_name='Geolocation'\n"
                    "- 'buscar clase Account en BusinessComponents' → query='Account', node_type='Class', namespace='BusinessComponents'\n"
                    "- 'interfaz IAccountService' → query='IAccountService', node_type='Interface'\n\n"
                    "IMPORTANTE: El grafo contiene SOLO código BASE de ICBanking, NO incluye clases Extended de Tailored."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Nombre EXACTO del elemento a buscar. Ejemplos: 'UpdateState', 'Geolocation', 'IAccountService'"
                        },
                        "node_type": {
                            "type": "string",
                            "description": "Tipo de elemento: Method (métodos), Class (clases), Interface (interfaces)",
                            "enum": ["Method", "Class", "Interface", "Property", "Field", "Enum", "Struct"]
                        },
                        "class_name": {
                            "type": "string",
                            "description": (
                                "Nombre de la CLASE que contiene el método. "
                                "SOLO usar cuando node_type='Method'. "
                                "Ejemplo: Si buscan 'método X de clase Y', usar class_name='Y'"
                            )
                        },
                        "namespace": {
                            "type": "string",
                            "description": (
                                "Filtrar por NAMESPACE (ruta de paquetes). "
                                "Usar para filtrar por capa o módulo. "
                                "Ejemplos: 'BusinessComponents', 'DataAccess', 'Infocorp.Banking.BusinessComponents'"
                            )
                        },
                        "project": {
                            "type": "string",
                            "description": "Nombre del proyecto específico si se conoce"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Máximo de resultados (default: 10)",
                            "default": 10
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
                            "description": "Nombre de la clase a analizar"
                        },
                        "methodName": {
                            "type": "string",
                            "description": "Método específico (opcional, para análisis más detallado)"
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace del resultado de search_code"
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
            else:
                return f"# Error en Herramienta MCP\n\n❌ **Herramienta desconocida:** `{tool_name}`"
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
            return f"# Error en Herramienta MCP\n\n❌ **Error ejecutando `{tool_name}`:**\n\n```\n{str(e)}\n```\n\n**Argumentos:**\n```json\n{json.dumps(arguments, indent=2)}\n```"

    async def _search_code(self, args: Dict[str, Any]) -> str:
        """Busca código en el grafo."""
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

        # Validar: si el query tiene múltiples términos, usar solo el primero
        # Esto previene búsquedas como "Communication ProcessMessage"
        query_parts = original_query.strip().split()
        actual_query = query_parts[0] if query_parts else original_query

        # Nota si se modificó la query
        query_modified = len(query_parts) > 1

        # Obtener filtros
        class_name_filter = args.get("class_name")
        namespace_filter = args.get("namespace")

        # Combinar class_name y namespace en un filtro de namespace compuesto
        # class_name: busca donde el namespace TERMINA con el nombre de clase
        # namespace: busca donde el namespace CONTIENE el valor
        combined_namespace_filter = None
        if class_name_filter and namespace_filter:
            # Ambos: namespace debe contener namespace_filter Y terminar en class_name
            combined_namespace_filter = f"{namespace_filter}.*{class_name_filter}"
        elif class_name_filter:
            # Solo class_name: namespace debe terminar en class_name
            combined_namespace_filter = class_name_filter
        elif namespace_filter:
            # Solo namespace: namespace debe contener el valor
            combined_namespace_filter = namespace_filter

        request = SearchNodesRequest(
            query=actual_query,
            nodeType=node_type,
            project=args.get("project"),
            namespace=combined_namespace_filter,
            version=self.default_version,
            limit=args.get("limit", 10)
        )

        results = await self.graph_service.search_nodes(request)

        # Construir string de filtros aplicados
        filters_applied = [f"Tipo: `{node_type}`"]
        if class_name_filter:
            filters_applied.append(f"Clase: `{class_name_filter}`")
        if namespace_filter:
            filters_applied.append(f"Namespace: `{namespace_filter}`")
        if args.get("project"):
            filters_applied.append(f"Proyecto: `{args.get('project')}`")
        filters_str = " | ".join(filters_applied)

        if not results:
            msg = f"# Búsqueda en Grafo de Código BASE de ICBanking\n\n"
            if query_modified:
                msg += f"⚠️ **Query modificada:** Recibí `{original_query}` pero busqué solo `{actual_query}`\n\n"
            msg += f"❌ No se encontraron resultados para: **{actual_query}**\n\n"
            msg += f"**Filtros aplicados:** {filters_str}\n\n"
            msg += f"**Nota:** El grafo contiene SOLO el código base de ICBanking. "
            msg += f"Si buscas una clase Extended de Tailored, estas NO están en el grafo."
            return msg

        # Consolidar resultados: agrupar clase + interfaz relacionadas
        consolidated = self._consolidate_search_results(results, node_type)

        # Detectar si los resultados son exactos o parciales
        exact_matches = []
        partial_matches = []
        for item in consolidated:
            node = item['primary']
            # Verificar si el nombre es exacto (case-insensitive)
            if node.Name.lower() == actual_query.lower():
                exact_matches.append(item)
            else:
                partial_matches.append(item)

        # Si hay matches exactos, mostrar solo esos
        if exact_matches:
            consolidated = exact_matches
            is_partial = False
        else:
            is_partial = True

        # Formatear resultados en Markdown
        md = f"# 🔍 Resultados de Búsqueda\n\n"

        if query_modified:
            md += f"⚠️ **Query modificada:** Recibí `{original_query}` pero busqué solo `{actual_query}`\n\n"
            md += "---\n\n"

        md += f"**Búsqueda:** `{actual_query}` | **Tipo:** `{node_type}`  \n"
        if class_name_filter:
            md += f"**Clase:** `{class_name_filter}`  \n"
        if namespace_filter:
            md += f"**Namespace:** `{namespace_filter}`  \n"

        if is_partial:
            md += f"⚠️ **Sin coincidencias exactas** - mostrando resultados parciales\n"

        md += f"**Resultados:** {len(consolidated)}\n\n"
        md += "---\n\n"

        for i, item in enumerate(consolidated, 1):
            node = item['primary']
            interface_info = item.get('interface')

            # Extraer className del namespace para métodos
            class_name = None
            if node.Type == "Method" and node.Namespace:
                parts = node.Namespace.rsplit('.', 1)
                if len(parts) > 1:
                    class_name = parts[-1]

            md += f"## {i}. {node.Name}\n\n"
            md += f"| Campo | Valor |\n"
            md += f"|-------|-------|\n"

            if node.Type == "Method" and class_name:
                # Para métodos, mostrar la clase contenedora
                is_interface = class_name.startswith('I') and len(class_name) > 1 and class_name[1].isupper()
                if is_interface:
                    md += f"| **Clase/Interfaz** | `{class_name}` (Interface) |\n"
                else:
                    md += f"| **Clase** | `{class_name}` |\n"
                    if interface_info:
                        iface_class = interface_info.Namespace.rsplit('.', 1)[-1] if interface_info.Namespace else 'I' + class_name
                        md += f"| **Implementa** | `{iface_class}` |\n"
            else:
                md += f"| **Tipo** | `{node.Type}` |\n"

            md += f"| **Proyecto** | `{node.Project}` |\n"
            md += f"| **Namespace** | `{node.Namespace}` |\n"

            if node.Location and isinstance(node.Location, dict):
                relative_path = node.Location.get('RelativePath', node.Location.get('AbsolutePath', ''))
                if relative_path:
                    md += f"| **Ubicación** | `{relative_path}` |\n"

            md += "\n"

            # Guía para siguiente paso
            md += f"**➡️ Siguiente paso - `get_code_context`:**\n"
            md += f"```json\n"
            md += f"{{\n"
            if node.Type == "Method" and class_name:
                # Para métodos, usar la clase (no interfaz) si está disponible
                target_class = class_name
                if class_name.startswith('I') and len(class_name) > 1 and class_name[1].isupper():
                    # Es interfaz, buscar si hay clase correspondiente
                    target_class = class_name[1:]  # Quitar la I
                md += f'  "className": "{target_class}",\n'
                md += f'  "methodName": "{node.Name}",\n'
            elif node.Type == "Class" or node.Type == "Interface":
                md += f'  "className": "{node.Name}",\n'
            else:
                md += f'  "className": "{node.Name}",\n'
            md += f'  "namespace": "{node.Namespace}",\n'
            md += f'  "project": "{node.Project}"\n'
            md += f"}}\n"
            md += f"```\n\n"

        return md

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
                # Para métodos, usar namespace + nombre del método como key
                parts = node.Namespace.rsplit('.', 1) if node.Namespace else ['', node.Name]
                containing_name = parts[-1] if len(parts) > 1 else ''

                # Normalizar: quitar I del inicio si es interfaz
                base_name = containing_name
                if containing_name.startswith('I') and len(containing_name) > 1 and containing_name[1].isupper():
                    base_name = containing_name[1:]

                # Key: namespace base + nombre método
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
            elif node.Type == "Method" and node.Namespace:
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
        """Obtiene contexto de código."""
        request = CodeContextRequest(
            className=args["className"],
            methodName=args.get("methodName"),
            namespace=args.get("namespace"),
            relativePath=args.get("relativePath"),
            absolutePath=args.get("absolutePath"),
            projectName=args.get("projectName"),
            version=self.default_version,
            includeRelated=args.get("includeRelated", True),
            maxDepth=args.get("maxDepth", 2)
        )

        result = await self.graph_service.get_code_context(request)

        if not result.found:
            md = f"# Contexto de Código BASE de ICBanking\n\n"
            md += f"❌ **No se encontró:** `{args['className']}`\n\n"
            md += (
                f"**Nota:** El grafo contiene SOLO el código base de ICBanking. "
                f"Si buscas una clase Extended de Tailored, estas NO están en el grafo. "
                f"Busca la clase base sin el sufijo 'Extended'.\n\n"
            )

            if result.suggestions:
                md += "## Sugerencias\n\n"
                for suggestion in result.suggestions:
                    md += f"- {suggestion}\n"

            return md

        # Formatear en Markdown
        md = f"# Contexto de Código BASE de ICBanking\n\n"

        # Elemento principal
        if result.mainElement:
            elem = result.mainElement
            md += f"## 📦 Elemento Principal: {elem.Name}\n\n"
            md += f"- **Tipo:** `{elem.Type}`\n"
            md += f"- **Namespace:** `{elem.Namespace}`\n"
            md += f"- **Proyecto:** `{elem.Project}`\n"

            if elem.Location and isinstance(elem.Location, dict):
                relative_path = elem.Location.get('RelativePath', elem.Location.get('AbsolutePath', 'N/A'))
                if relative_path and relative_path != 'N/A':
                    md += f"- **Ubicación:** `{relative_path}`\n"

            if elem.Attributes:
                md += f"- **Atributos:**\n"
                for key, value in elem.Attributes.items():
                    md += f"  - {key}: `{value}`\n"

            md += "\n---\n\n"

        # Información del proyecto
        if result.projectInfo:
            proj = result.projectInfo
            md += f"## 📂 Información del Proyecto\n\n"
            md += f"- **Nombre:** `{proj.ProjectName}`\n"
            if hasattr(proj, 'Layer') and proj.Layer:
                md += f"- **Layer:** `{proj.Layer}`\n"
            md += "\n"

        # Elementos relacionados - Agrupar por tipo de relación
        if result.edges and result.mainElement:
            md += f"## 🔗 Relaciones en el Grafo\n\n"

            # Agrupar edges por tipo de relación
            relations_by_type = {}
            main_id = result.mainElement.Id

            for edge in result.edges:
                rel_type = edge.Relationship

                # Determinar si es entrante o saliente
                if edge.Source == main_id:
                    # Saliente: este elemento -> otro
                    direction = "outgoing"
                    other_id = edge.Target
                else:
                    # Entrante: otro -> este elemento
                    direction = "incoming"
                    other_id = edge.Source

                # Buscar el elemento relacionado
                related = next((r for r in result.relatedElements if r.Id == other_id), None)
                if not related:
                    continue

                # Crear key única para agrupar
                key = f"{rel_type}_{direction}"
                if key not in relations_by_type:
                    relations_by_type[key] = {
                        'type': rel_type,
                        'direction': direction,
                        'elements': []
                    }

                relations_by_type[key]['elements'].append({
                    'name': related.Name,
                    'node_type': related.Type,
                    'namespace': related.Namespace,
                    'project': related.Project
                })

            # Ordenar por prioridad: herencia/implementación primero
            priority_order = ['Inherits', 'Implements', 'Contains', 'Calls', 'Uses', 'References']

            def sort_key(key):
                rel_type = key.split('_')[0]
                try:
                    return priority_order.index(rel_type)
                except ValueError:
                    return len(priority_order)

            # Formatear cada grupo ordenado
            for key in sorted(relations_by_type.keys(), key=sort_key):
                group = relations_by_type[key]
                rel_type = group['type']
                direction = group['direction']
                elements = group['elements']

                # Determinar emoji e título según tipo y dirección
                if rel_type == 'Inherits':
                    if direction == 'outgoing':
                        title = f"🔼 Hereda de ({len(elements)})"
                    else:
                        title = f"🔽 Clases que heredan de {result.mainElement.Name} ({len(elements)})"
                elif rel_type == 'Implements':
                    if direction == 'outgoing':
                        title = f"✅ Implementa ({len(elements)})"
                    else:
                        title = f"📋 Clases que implementan {result.mainElement.Name} ({len(elements)})"
                elif rel_type == 'Calls':
                    if direction == 'outgoing':
                        title = f"➡️ Llama a ({len(elements)})"
                    else:
                        title = f"⬅️ Es llamado por ({len(elements)})"
                elif rel_type == 'Uses':
                    if direction == 'outgoing':
                        title = f"📦 Usa ({len(elements)})"
                    else:
                        title = f"📥 Es usado por ({len(elements)})"
                elif rel_type == 'Contains':
                    if direction == 'outgoing':
                        title = f"📁 Contiene ({len(elements)})"
                    else:
                        title = f"📂 Contenido en ({len(elements)})"
                else:
                    title = f"🔗 {rel_type} {'→' if direction == 'outgoing' else '←'} ({len(elements)})"

                md += f"### {title}\n\n"
                md += f"| Nombre | Tipo | Namespace |\n"
                md += f"|--------|------|----------|\n"
                for elem in elements[:15]:  # Limitar a 15 para no saturar
                    md += f"| `{elem['name']}` | {elem['node_type']} | {elem['namespace'][:50]}{'...' if len(elem['namespace']) > 50 else ''} |\n"

                if len(elements) > 15:
                    md += f"\n_... y {len(elements) - 15} elementos más_\n"
                md += "\n"

            # Resumen
            md += f"---\n\n"
            md += f"**📊 Resumen:** {len(result.relatedElements)} elementos relacionados, {len(result.edges)} conexiones\n"

        elif result.relatedElements:
            # Hay elementos pero no edges (caso raro)
            md += f"## 🔗 Elementos Relacionados ({len(result.relatedElements)})\n\n"
            md += "_No se encontraron conexiones directas en el grafo._\n"

        return md

    async def _list_projects(self, args: Dict[str, Any]) -> str:
        """Lista proyectos disponibles."""
        request = SearchProjectsRequest(
            query=args.get("query"),
            version=self.default_version,
            limit=args.get("limit", 50)
        )

        results = await self.graph_service.search_projects(request)

        if not results:
            return "# Proyectos Código BASE de ICBanking en el Grafo\n\n❌ No se encontraron proyectos"

        # Formatear en Markdown
        md = "# Proyectos Código BASE de ICBanking en el Grafo\n\n"
        md += f"**Total de proyectos encontrados:** {len(results)}\n\n"
        md += "---\n\n"

        for i, project in enumerate(results, 1):
            if isinstance(project, dict):
                name = project.get("projectName", "N/A")
                namespace = project.get("namespace", "N/A")
                node_count = len(project.get("nodes", []))
                edge_count = len(project.get("edges", []))

                md += f"## {i}. {name}\n\n"
                md += f"- **Namespace:** `{namespace}`\n"
                md += f"- **Elementos:** {node_count} nodos\n"
                md += f"- **Conexiones:** {edge_count} relaciones\n"
            else:
                md += f"## {i}. {project.ProjectName}\n\n"
                if hasattr(project, 'Layer') and project.Layer:
                    md += f"- **Layer:** `{project.Layer}`\n"
                md += f"- **Elementos:** {project.NodeCount} nodos\n"
                md += f"- **Conexiones:** {project.EdgeCount} relaciones\n"

            md += "\n"

        return md

    async def _get_project_structure(self, args: Dict[str, Any]) -> str:
        """Obtiene estructura de un proyecto."""
        project_id = args["project_id"]
        node_type = args.get("node_type")

        nodes = await self.graph_service.get_nodes_by_project(project_id, node_type)

        if not nodes:
            return f"# Estructura de Proyecto - Grafo Código BASE de ICBanking\n\n❌ No se encontraron elementos en el proyecto: **`{project_id}`**"

        # Agrupar por tipo
        by_type = {}
        for node in nodes:
            node_type = node.Type
            if node_type not in by_type:
                by_type[node_type] = []
            by_type[node_type].append(node)

        # Formatear en Markdown
        md = f"# Estructura de Proyecto - Grafo Código BASE de ICBanking\n\n"
        md += f"**Proyecto:** `{project_id}`  \n"
        md += f"**Total de elementos:** {len(nodes)}\n\n"
        md += "---\n\n"

        for tipo, elementos in sorted(by_type.items()):
            md += f"## {tipo}s ({len(elementos)})\n\n"

            for elem in elementos[:20]:  # Limitar a 20 por tipo para no saturar
                md += f"### `{elem.Name}`\n\n"
                md += f"- **Namespace:** `{elem.Namespace}`\n"

                if elem.Attributes:
                    attrs = []
                    for key, value in elem.Attributes.items():
                        if value and str(value).lower() not in ['false', 'none', '']:
                            attrs.append(f"`{key}`")
                    if attrs:
                        md += f"- **Atributos:** {', '.join(attrs)}\n"

                md += "\n"

            if len(elementos) > 20:
                md += f"_... y {len(elementos) - 20} elementos más de tipo {tipo}_\n\n"

        return md

    async def _find_implementations(self, args: Dict[str, Any]) -> str:
        """Encuentra implementaciones de una interfaz o herencias."""
        interface_name = args["interface_or_class"]
        namespace = args.get("namespace")

        # Buscar la interfaz/clase - buscar más resultados para filtrar mejor
        search_request = SearchNodesRequest(
            query=interface_name,
            nodeType=None,
            namespace=namespace,
            version=self.default_version,
            limit=20  # Aumentar límite para tener más opciones
        )

        all_results = await self.graph_service.search_nodes(search_request)

        if not all_results:
            return f"# Implementaciones y Herencias - Grafo Código BASE de ICBanking\n\n❌ No se encontró: **`{interface_name}`**"

        # Filtrar y priorizar: preferir Interface/Class sobre File
        # Ordenar por prioridad: Interface > Class > otros tipos
        def priority(node):
            if node.Type == "Interface":
                return 0
            elif node.Type == "Class":
                return 1
            elif node.Type in ["Struct", "Enum"]:
                return 2
            else:  # File y otros
                return 3

        filtered_results = [n for n in all_results if n.Type != "File"]

        if not filtered_results:
            # Si solo hay archivos, usar el primero de all_results
            filtered_results = all_results

        # Ordenar por prioridad
        filtered_results.sort(key=priority)
        target = filtered_results[0]

        # Buscar implementaciones usando contexto
        context_request = CodeContextRequest(
            className=target.Name,
            namespace=target.Namespace,
            projectName=target.Project,
            version=self.default_version,
            includeRelated=True,
            maxDepth=2
        )

        context = await self.graph_service.get_code_context(context_request)

        # Filtrar solo implementaciones/herencias de los edges
        # IMPORTANTE: Si target es una Interface/Class base:
        # - Implementaciones: edge.Target == target.Id y edge.Relationship == "Implements"
        # - Herencias: edge.Target == target.Id y edge.Relationship == "Inherits"
        # El SOURCE es quien implementa/hereda
        implementations = []
        if context.edges and context.mainElement:
            target_id = context.mainElement.Id

            for edge in context.edges:
                # Solo procesar si la relación es Implements o Inherits
                if edge.Relationship not in ["Implements", "Inherits"]:
                    continue

                # Verificar si el target del edge es nuestro elemento
                # (significa que alguien implementa/hereda de nosotros)
                if edge.Target == target_id:
                    # El Source es quien implementa/hereda
                    implementer = next(
                        (node for node in context.relatedElements if node.Id == edge.Source),
                        None
                    )
                    if implementer and implementer.Type != "File":
                        implementations.append({
                            "name": implementer.Name,
                            "namespace": implementer.Namespace,
                            "type": implementer.Type,
                            "relationship": edge.Relationship,
                            "project": implementer.Project
                        })
                # También verificar el caso inverso (si nosotros heredamos/implementamos)
                elif edge.Source == target_id:
                    parent = next(
                        (node for node in context.relatedElements if node.Id == edge.Target),
                        None
                    )
                    if parent and parent.Type != "File":
                        # En este caso, el target hereda/implementa a parent
                        # Lo marcamos de forma diferente
                        implementations.append({
                            "name": parent.Name,
                            "namespace": parent.Namespace,
                            "type": parent.Type,
                            "relationship": f"{edge.Relationship} (heredado de)",
                            "project": parent.Project
                        })

        # Formatear en Markdown
        md = f"# Implementaciones y Herencias - Grafo Código BASE de ICBanking\n\n"
        md += f"## 🎯 Elemento Base\n\n"
        md += f"- **Nombre:** `{target.Name}`\n"
        md += f"- **Tipo:** `{target.Type}`\n"
        md += f"- **Namespace:** `{target.Namespace or '(global)'}`\n"
        md += f"- **Proyecto:** `{target.Project}`\n\n"

        # Info de debug
        if len(all_results) > 1:
            md += f"_ℹ️ Se encontraron {len(all_results)} coincidencias, seleccionando la de tipo {target.Type}_\n\n"

        md += "---\n\n"

        if not context.edges:
            md += f"⚠️ **No se encontraron relaciones** en el grafo para este elemento.\n\n"
            md += f"- Total de elementos relacionados: {len(context.relatedElements)}\n"
            md += f"- Total de relaciones (edges): 0\n\n"
            md += "_El elemento existe en el grafo pero no tiene relaciones de herencia o implementación registradas._"
            return md

        if not implementations:
            md += f"❌ **No se encontraron implementaciones o herencias** de este elemento.\n\n"
            md += f"**Información de debug:**\n"
            md += f"- Total de relaciones en contexto: {len(context.edges)}\n"
            md += f"- Elementos relacionados: {len(context.relatedElements)}\n"
            md += f"- Tipos de relaciones encontradas: {set(e.Relationship for e in context.edges)}\n\n"
            md += "_Tip: Verifica que el elemento sea una interfaz o clase base que otras clases implementen/hereden._"
            return md

        md += f"## 🏗️ Implementaciones y Herencias Encontradas ({len(implementations)})\n\n"

        # Agrupar por tipo de relación
        implements = [i for i in implementations if 'Implements' in i['relationship']]
        inherits = [i for i in implementations if 'Inherits' in i['relationship']]

        if implements:
            md += f"### ✅ Implementaciones ({len(implements)})\n\n"
            md += f"Clases que implementan `{target.Name}`:\n\n"
            for impl in implements:
                md += f"#### `{impl['name']}`\n\n"
                md += f"- **Tipo:** `{impl['type']}`\n"
                md += f"- **Namespace:** `{impl['namespace'] or '(global)'}`\n"
                md += f"- **Proyecto:** `{impl['project']}`\n"
                md += f"- **Relación:** {impl['relationship']}\n\n"

        if inherits:
            md += f"### 🔗 Herencias ({len(inherits)})\n\n"
            md += f"Clases que heredan de `{target.Name}`:\n\n"
            for inh in inherits:
                md += f"#### `{inh['name']}`\n\n"
                md += f"- **Tipo:** `{inh['type']}`\n"
                md += f"- **Namespace:** `{inh['namespace'] or '(global)'}`\n"
                md += f"- **Proyecto:** `{inh['project']}`\n"
                md += f"- **Relación:** {inh['relationship']}\n\n"

        md += "---\n\n"
        md += f"## 📊 Resumen\n\n"
        md += f"- **Total de implementaciones/herencias:** {len(implementations)}\n"
        md += f"- **Relaciones totales analizadas:** {len(context.edges)}\n"
        md += f"- **Elementos relacionados:** {len(context.relatedElements)}\n\n"
        md += f"**💡 Análisis de Impacto:** Modificar `{target.Name}` afectará a **{len(implementations)} elementos** en el grafo de Código BASE de ICBanking."

        return md

    async def _analyze_impact(self, args: Dict[str, Any]) -> str:
        """Genera un análisis de impacto detallado."""
        # Usar get_code_context internamente
        request = CodeContextRequest(
            className=args["className"],
            methodName=args.get("methodName"),
            namespace=args.get("namespace"),
            projectName=args.get("project"),
            version=self.default_version,
            includeRelated=True,
            maxDepth=3  # Mayor profundidad para análisis de impacto
        )

        context = await self.graph_service.get_code_context(request)

        if not context.found:
            md = f"# 📊 Análisis de Impacto - Grafo Código BASE de ICBanking\n\n"
            md += f"❌ **No se encontró el elemento:** `{args['className']}`\n\n"

            if context.suggestions:
                md += "## Sugerencias\n\n"
                for suggestion in context.suggestions:
                    md += f"- {suggestion}\n"

            return md

        # Analizar el impacto basándose en los edges
        impact_report = {
            "element": {
                "name": context.mainElement.Name,
                "type": context.mainElement.Type,
                "namespace": context.mainElement.Namespace,
                "project": context.mainElement.Project
            },
            "impactSummary": {
                "totalRelatedElements": len(context.relatedElements),
                "totalRelationships": len(context.edges)
            },
            "dependsOnThis": [],  # Elementos que dependen de este (llamadas entrantes)
            "thisUses": [],  # Elementos que este usa (llamadas salientes)
            "inheritanceImpact": [],  # Impacto en herencias/implementaciones
            "affectedProjects": set()
        }

        # Analizar cada edge para categorizar el impacto
        for edge in context.edges:
            relationship_type = edge.Relationship

            # Encontrar el nodo relacionado
            if edge.Source == context.mainElement.Id:
                # Este elemento es la fuente -> usa/llama a target
                target_node = next(
                    (node for node in context.relatedElements if node.Id == edge.Target),
                    None
                )
                if target_node:
                    impact_report["thisUses"].append({
                        "name": target_node.Name,
                        "type": target_node.Type,
                        "relationship": relationship_type,
                        "project": target_node.Project
                    })
                    impact_report["affectedProjects"].add(target_node.Project)
            else:
                # Este elemento es el target -> otros dependen de él
                source_node = next(
                    (node for node in context.relatedElements if node.Id == edge.Source),
                    None
                )
                if source_node:
                    if relationship_type in ["Inherits", "Implements"]:
                        impact_report["inheritanceImpact"].append({
                            "name": source_node.Name,
                            "type": source_node.Type,
                            "relationship": relationship_type,
                            "project": source_node.Project,
                            "impact": "HIGH - Changes to interface/base class will affect this implementation"
                        })
                    else:
                        impact_report["dependsOnThis"].append({
                            "name": source_node.Name,
                            "type": source_node.Type,
                            "relationship": relationship_type,
                            "project": source_node.Project
                        })
                    impact_report["affectedProjects"].add(source_node.Project)

        # Convertir set a lista
        affected_projects = sorted(list(impact_report["affectedProjects"]))

        # Generar resumen de impacto
        impact_level = "🟢 LOW"
        if len(impact_report["dependsOnThis"]) > 10 or len(impact_report["inheritanceImpact"]) > 0:
            impact_level = "🔴 HIGH"
        elif len(impact_report["dependsOnThis"]) > 5:
            impact_level = "🟡 MEDIUM"

        # Formatear en Markdown
        md = f"# 📊 Análisis de Impacto - Grafo Código BASE de ICBanking\n\n"

        # Elemento analizado
        md += f"## 🎯 Elemento Analizado\n\n"
        md += f"- **Nombre:** `{context.mainElement.Name}`\n"
        md += f"- **Tipo:** `{context.mainElement.Type}`\n"
        md += f"- **Namespace:** `{context.mainElement.Namespace}`\n"
        md += f"- **Proyecto:** `{context.mainElement.Project}`\n\n"

        # Nivel de impacto
        md += f"## ⚠️ Nivel de Impacto: {impact_level}\n\n"

        # Resumen ejecutivo
        md += f"### 📈 Resumen Ejecutivo\n\n"
        md += f"| Métrica | Cantidad |\n"
        md += f"|---------|----------|\n"
        md += f"| Dependencias entrantes | **{len(impact_report['dependsOnThis'])}** |\n"
        md += f"| Dependencias salientes | **{len(impact_report['thisUses'])}** |\n"
        md += f"| Herencias/Implementaciones | **{len(impact_report['inheritanceImpact'])}** |\n"
        md += f"| Proyectos afectados | **{len(affected_projects)}** |\n"
        md += f"| Total elementos relacionados | **{len(context.relatedElements)}** |\n"
        md += f"| Total conexiones en grafo | **{len(context.edges)}** |\n\n"

        md += "---\n\n"

        # Dependencias entrantes (quién depende de esto)
        if impact_report["dependsOnThis"]:
            md += f"## ⬅️ Dependencias Entrantes ({len(impact_report['dependsOnThis'])})\n\n"
            md += f"**Elementos que DEPENDEN de `{context.mainElement.Name}`** - Se romperán si cambias este código:\n\n"

            for dep in impact_report["dependsOnThis"]:
                md += f"### `{dep['name']}`\n\n"
                md += f"- **Tipo:** `{dep['type']}`\n"
                md += f"- **Relación:** {dep['relationship']}\n"
                md += f"- **Proyecto:** `{dep['project']}`\n\n"

            md += "---\n\n"

        # Herencias e implementaciones
        if impact_report["inheritanceImpact"]:
            md += f"## 🏗️ Impacto en Herencias e Implementaciones ({len(impact_report['inheritanceImpact'])})\n\n"
            md += f"**⚠️ IMPACTO ALTO** - Cambios en `{context.mainElement.Name}` afectarán estas implementaciones:\n\n"

            for inh in impact_report["inheritanceImpact"]:
                md += f"### `{inh['name']}`\n\n"
                md += f"- **Tipo:** `{inh['type']}`\n"
                md += f"- **Relación:** {inh['relationship']}\n"
                md += f"- **Proyecto:** `{inh['project']}`\n"
                md += f"- **⚠️ Impacto:** {inh['impact']}\n\n"

            md += "---\n\n"

        # Dependencias salientes (qué usa esto)
        if impact_report["thisUses"]:
            md += f"## ➡️ Dependencias Salientes ({len(impact_report['thisUses'])})\n\n"
            md += f"**Elementos que `{context.mainElement.Name}` USA:**\n\n"

            for use in impact_report["thisUses"]:
                md += f"- **{use['name']}** (`{use['type']}`) - {use['relationship']} - Proyecto: `{use['project']}`\n"

            md += "\n---\n\n"

        # Proyectos afectados
        if affected_projects:
            md += f"## 📦 Proyectos Código BASE de ICBanking Afectados ({len(affected_projects)})\n\n"

            for project in affected_projects:
                md += f"- `{project}`\n"

            md += "\n---\n\n"

        # Recomendaciones
        md += f"## 💡 Recomendaciones\n\n"

        if impact_level == "🔴 HIGH":
            md += f"⚠️ **ALTO IMPACTO** - Procede con precaución:\n\n"
            md += f"- ✅ Revisa **TODAS** las {len(impact_report['dependsOnThis'])} dependencias antes de hacer cambios\n"
            if impact_report["inheritanceImpact"]:
                md += f"- ✅ **{len(impact_report['inheritanceImpact'])}** implementaciones heredan de este elemento - cualquier cambio de firma será un breaking change\n"
            md += f"- ✅ Considera crear tests de regresión para los elementos dependientes\n"
            md += f"- ✅ Coordina cambios con los equipos responsables de los {len(affected_projects)} proyectos afectados\n"
            md += f"- ✅ Documenta todos los cambios en la interfaz/contrato\n"
        elif impact_level == "🟡 MEDIUM":
            md += f"⚡ **IMPACTO MEDIO** - Revisión recomendada:\n\n"
            md += f"- ✅ Revisa las {len(impact_report['dependsOnThis'])} dependencias principales\n"
            md += f"- ✅ Ejecuta tests de los proyectos afectados: {', '.join(affected_projects)}\n"
            md += f"- ✅ Considera el impacto en los equipos dependientes\n"
        else:
            md += f"✅ **BAJO IMPACTO** - Cambios manejables:\n\n"
            md += f"- El impacto parece limitado\n"
            md += f"- Ejecuta tests básicos en el proyecto actual\n"
            md += f"- Revisa las pocas dependencias identificadas\n"

        return md

    async def _get_statistics(self, args: Dict[str, Any]) -> str:
        """Obtiene estadísticas del grafo."""
        stats = await self.graph_service.get_statistics()

        # Formatear en Markdown
        md = "# 📊 Estadísticas del Grafo Código BASE de ICBanking\n\n"

        if isinstance(stats, dict):
            # Información general
            md += "## Resumen General\n\n"

            if "totalProjects" in stats:
                md += f"- **Total de Proyectos:** {stats['totalProjects']}\n"
            if "totalNodes" in stats:
                md += f"- **Total de Nodos (Elementos):** {stats['totalNodes']}\n"
            if "totalEdges" in stats:
                md += f"- **Total de Relaciones (Edges):** {stats['totalEdges']}\n"

            md += "\n"

            # Distribución por tipos
            if "nodesByType" in stats and stats["nodesByType"]:
                md += "## 📦 Distribución de Elementos por Tipo\n\n"
                md += "| Tipo | Cantidad |\n"
                md += "|------|----------|\n"

                for node_type, count in sorted(stats["nodesByType"].items(), key=lambda x: x[1], reverse=True):
                    md += f"| {node_type} | **{count}** |\n"

                md += "\n"

            # Otros stats que puedan existir
            for key, value in stats.items():
                if key not in ["totalProjects", "totalNodes", "totalEdges", "nodesByType"]:
                    if isinstance(value, (int, float, str)):
                        md += f"- **{key}:** {value}\n"

        else:
            md += f"```\n{stats}\n```\n"

        return md

    async def _get_tailored_guidance(self, args: Dict[str, Any]) -> str:
        """
        Genera guía especializada para trabajar en Tailored.

        Delega al servicio TailoredGuidanceService para toda la lógica.
        Pasa la versión del grafo al servicio para generar guías apropiadas.
        """
        # Agregar versión del grafo a los argumentos
        args_with_version = {**args, "version": self.default_version}
        return await self.tailored_guidance.get_tailored_guidance(args_with_version)
