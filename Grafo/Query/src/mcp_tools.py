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
                    "Busca UN SOLO elemento en el grafo de código BASE de ICBanking (NO incluye Tailored). "
                    "El grafo contiene SOLO el código base de ICBanking: métodos, clases, interfaces, propiedades y sus conexiones. "
                    "IMPORTANTE: El grafo NO contiene clases Extended de Tailored. Solo busca clases base de ICBanking. "
                    "\n\n"
                    "⚠️ IMPORTANTE: Para 'extender el método X de la clase Y', NO uses esta tool primero. "
                    "Usa get_code_context con className='Y' y methodName='X' directamente. "
                    "\n\n"
                    "USA ESTA TOOL solo cuando:\n"
                    "- Buscas múltiples elementos que coincidan con un nombre (exploración)\n"
                    "- Quieres ver TODAS las clases/métodos con cierto nombre\n"
                    "- Necesitas explorar el grafo sin conocer el contexto exacto\n"
                    "\n"
                    "Esta herramienta busca por nombre en todos los tipos de elementos (métodos, clases, interfaces, propiedades, campos). "
                    "NO combines múltiples nombres en una sola búsqueda (ej: NO uses 'Communication ProcessMessage'). "
                    "Si necesitas un componente específico, usa get_code_context en su lugar. "
                    "Retorna información detallada de cada elemento encontrado incluyendo ubicación, tipo y atributos."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "UN SOLO término de búsqueda (nombre de método, clase, interfaz, etc.). "
                                "Para elementos relacionados (ej: 'método X de clase Y'), busca el método primero, "
                                "luego usa get_code_context para obtener detalles de la clase contenedora. "
                                "Ejemplos: 'ProcessUserPendingApproval', 'ApprovalScheme', 'GetCustomer'"
                            )
                        },
                        "node_type": {
                            "type": "string",
                            "description": (
                                "OPCIONAL: Filtrar por tipo específico de nodo. "
                                "SOLO usa este parámetro si necesitas filtrar resultados por tipo. "
                                "Si buscas cualquier elemento (método, clase, etc.), NO especifiques este parámetro. "
                                "Valores: Method (métodos/funciones), Class (clases), Interface, Property, Field, Enum, Struct"
                            ),
                            "enum": ["Method", "Class", "Interface", "Property", "Field", "Enum", "Struct"]
                        },
                        "project": {
                            "type": "string",
                            "description": "Filtrar por proyecto específico"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Número máximo de resultados (default: 20)",
                            "default": 20
                        }
                    },
                    "required": ["query"]
                }
            ),
            Tool(
                name="get_code_context",
                description=(
                    "✅ HERRAMIENTA PRINCIPAL para identificar componentes exactos antes de extender en Tailored. "
                    "Obtiene el contexto completo de un elemento del grafo de código BASE de ICBanking (NO incluye Tailored). "
                    "El grafo almacena SOLO el código base de ICBanking: herencias, implementaciones, "
                    "llamadas a métodos, usos de clases, y dependencias. "
                    "IMPORTANTE: El grafo NO contiene clases Extended de Tailored. Solo consulta clases base de ICBanking. "
                    "\n\n"
                    "🎯 FLUJO RECOMENDADO para 'Extender el método X de la clase Y':\n"
                    "1. USA ESTA TOOL con className='Y' y methodName='X'\n"
                    "2. La tool VALIDA que el método X pertenezca a la clase Y correcta\n"
                    "3. Si hay múltiples clases 'Y', la tool encuentra la correcta automáticamente\n"
                    "4. Retorna el método exacto + su contexto completo\n"
                    "5. Usa este contexto para ejecutar tailored_guidance\n"
                    "\n"
                    "Esta herramienta retorna: "
                    "(1) Información completa del elemento BASE identificado (método/clase validado) "
                    "(2) Todos los elementos relacionados BASE con sus conexiones en el grafo "
                    "(3) Relaciones de dependencia BASE - qué código base depende de este elemento "
                    "(4) Análisis de impacto BASE - el alcance de cambios en el código base. "
                    "\n"
                    "Usa esta herramienta ANTES de ejecutar tailored_guidance para garantizar que trabajas con el componente correcto."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "className": {
                            "type": "string",
                            "description": (
                                "Nombre de la clase BASE de ICBanking a consultar. "
                                "CRÍTICO: Si buscas 'extender método X de clase Y', especifica Y aquí. "
                                "La tool validará automáticamente que el método pertenezca a esta clase."
                            )
                        },
                        "methodName": {
                            "type": "string",
                            "description": (
                                "Nombre del método específico dentro de la clase. "
                                "RECOMENDADO: Siempre especifica este parámetro cuando busques 'método X de clase Y'. "
                                "La tool garantiza que retorna el método correcto dentro de la clase correcta."
                            )
                        },
                        "namespace": {
                            "type": "string",
                            "description": (
                                "Namespace completo (opcional). "
                                "Útil para desambiguar cuando hay múltiples clases con el mismo nombre."
                            )
                        },
                        "project": {
                            "type": "string",
                            "description": "Proyecto específico (opcional)"
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
                    "Lista todos los proyectos BASE de ICBanking indexados en el grafo (NO incluye Tailored). "
                    "El grafo contiene SOLO la estructura del código base de ICBanking. "
                    "IMPORTANTE: El grafo NO contiene proyectos de Tailored. Solo proyectos base de ICBanking. "
                    "Retorna información de cada proyecto BASE: nombre, namespace, cantidad de nodos (clases, métodos, etc.) "
                    "y cantidad de relaciones. Consulta el grafo para conocer qué proyectos base están disponibles."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Filtro opcional por nombre de proyecto"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Número máximo de proyectos (default: 50)",
                            "default": 50
                        }
                    }
                }
            ),
            Tool(
                name="get_project_structure",
                description=(
                    "Obtiene la estructura completa de un proyecto BASE de ICBanking del grafo (NO incluye Tailored). "
                    "El grafo contiene SOLO proyectos base de ICBanking organizados por tipo: "
                    "clases, interfaces, métodos, propiedades, enums, structs. "
                    "IMPORTANTE: El grafo NO contiene proyectos de Tailored. Solo proyectos base de ICBanking. "
                    "Retorna la arquitectura del proyecto BASE con todos sus componentes agrupados por tipo, "
                    "incluyendo namespaces y atributos. Usa para entender la estructura base antes de crear extensiones Tailored."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "project_id": {
                            "type": "string",
                            "description": "ID o nombre del proyecto"
                        },
                        "node_type": {
                            "type": "string",
                            "description": "Filtrar por tipo de nodo (opcional)"
                        }
                    },
                    "required": ["project_id"]
                }
            ),
            Tool(
                name="find_implementations",
                description=(
                    "Encuentra implementaciones y herencias en el grafo de código BASE de ICBanking (NO incluye Tailored). "
                    "El grafo contiene SOLO las relaciones base de ICBanking entre clases e interfaces. "
                    "IMPORTANTE: El grafo NO contiene clases Extended de Tailored. Solo jerarquías base de ICBanking. "
                    "Esta herramienta retorna todas las clases BASE que implementan una interfaz o heredan de una clase base, "
                    "mostrando la jerarquía BASE almacenada en el grafo. "
                    "Usa para analizar impacto en jerarquías BASE, entender polimorfismo base, "
                    "identificar clases base afectadas por cambios en interfaces o clases base de ICBanking."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "interface_or_class": {
                            "type": "string",
                            "description": "Nombre de la interfaz o clase base"
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace (opcional)"
                        }
                    },
                    "required": ["interface_or_class"]
                }
            ),
            Tool(
                name="analyze_impact",
                description=(
                    "Genera un reporte de ANÁLISIS DE IMPACTO consultando el grafo de código BASE de ICBanking (NO incluye Tailored). "
                    "El grafo contiene SOLO las conexiones y dependencias del código base de ICBanking. "
                    "IMPORTANTE: El grafo NO contiene código Tailored. Solo analiza impacto en código base ICBanking. "
                    "Esta herramienta analiza el grafo BASE para generar un reporte que incluye: "
                    "(1) Dependencias entrantes BASE - qué componentes base de ICBanking dependen del elemento "
                    "(2) Dependencias salientes BASE - qué otros componentes base usa el elemento "
                    "(3) Impacto en herencias BASE - implementaciones y clases derivadas BASE afectadas "
                    "(4) Proyectos BASE impactados - lista de proyectos base de ICBanking afectados "
                    "(5) Nivel de impacto BASE - evaluación HIGH/MEDIUM/LOW basada en conexiones base "
                    "(6) Recomendaciones - sugerencias para el código base. "
                    "Usa para analizar impacto de cambios en código BASE de ICBanking antes de crear extensiones Tailored."
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
                            "description": "Nombre del método (opcional, para análisis más específico)"
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace completo (opcional)"
                        },
                        "project": {
                            "type": "string",
                            "description": "Proyecto específico (opcional)"
                        }
                    },
                    "required": ["className"]
                }
            ),
            Tool(
                name="get_statistics",
                description=(
                    "Obtiene estadísticas generales del grafo de código BASE de ICBanking (NO incluye Tailored). "
                    "El grafo contiene métricas SOLO sobre proyectos base de ICBanking indexados. "
                    "IMPORTANTE: El grafo NO contiene proyectos Tailored. Solo estadísticas del código base ICBanking. "
                    "Retorna: número total de proyectos BASE, cantidad de nodos base (clases, métodos, etc.), "
                    "cantidad de relaciones/conexiones base, distribución por tipos de elementos base. "
                    "Consulta el grafo para obtener una visión general del código base indexado de ICBanking."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            ),
            Tool(
                name="get_tailored_guidance",
                description=(
                    "Obtiene guía especializada PASO POR PASO para trabajar en el proyecto Tailored de ICBanking. "
                    "IMPORTANTE: Esta herramienta funciona por PASOS para evitar sobrecargar la AI con demasiado texto. "
                    "\n\n"
                    "⚠️ FLUJO CRÍTICO - Antes de usar esta tool:\n"
                    "1. USA get_code_context PRIMERO para identificar el componente BASE exacto\n"
                    "2. Valida que tienes el componente correcto (ej: método X de clase Y)\n"
                    "3. LUEGO usa esta tool con los datos validados\n"
                    "4. Esta tool genera código basándose en el componente identificado\n"
                    "\n"
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

        # Validar: si el query tiene múltiples términos, usar solo el primero
        # Esto previene búsquedas como "Communication ProcessMessage"
        query_parts = original_query.strip().split()
        actual_query = query_parts[0] if query_parts else original_query

        # Nota si se modificó la query
        query_modified = len(query_parts) > 1

        request = SearchNodesRequest(
            query=actual_query,
            nodeType=args.get("node_type"),
            project=args.get("project"),
            namespace=args.get("namespace"),
            version=self.default_version,
            limit=args.get("limit", 20)
        )

        results = await self.graph_service.search_nodes(request)

        if not results:
            msg = f"# Búsqueda en Grafo de Código BASE de ICBanking\n\n"
            if query_modified:
                msg += f"⚠️ **Query modificada:** Recibí `{original_query}` pero busqué solo `{actual_query}`\n\n"
                msg += f"**Razón:** Esta herramienta busca UN SOLO elemento a la vez. Para buscar múltiples elementos (como clase + método), primero busca la clase, luego usa `get_code_context`.\n\n"
            msg += f"❌ No se encontraron resultados para: **{actual_query}**\n\n"
            msg += f"**Nota:** El grafo contiene SOLO el código base de ICBanking. "
            msg += f"Si buscas una clase Extended de Tailored, estas NO están en el grafo. "
            msg += f"Busca la clase base sin el sufijo 'Extended'."
            return msg

        # Formatear resultados en Markdown
        md = f"# Búsqueda en Grafo de Código BASE de ICBanking\n\n"

        # Advertencia si se modificó la query
        if query_modified:
            md += f"⚠️ **Query modificada:** Recibí `{original_query}` pero busqué solo `{actual_query}`\n\n"
            md += f"**Razón:** Esta herramienta busca UN SOLO elemento a la vez. Para buscar múltiples elementos:\n"
            md += f"1. Busca `{actual_query}` primero (esta búsqueda)\n"
            md += f"2. Luego usa `get_code_context` para ver sus métodos/relaciones\n\n"
            md += "---\n\n"

        md += f"**Búsqueda:** `{actual_query}`  \n"
        md += f"**Resultados encontrados:** {len(results)}\n\n"
        md += "---\n\n"

        for i, node in enumerate(results, 1):
            md += f"## {i}. {node.Name}\n\n"
            md += f"- **Tipo:** `{node.Type}`\n"
            md += f"- **Proyecto:** `{node.Project}`\n"
            md += f"- **Namespace:** `{node.Namespace}`\n"

            if node.Location and isinstance(node.Location, dict):
                relative_path = node.Location.get('RelativePath', node.Location.get('AbsolutePath', 'N/A'))
                if relative_path and relative_path != 'N/A':
                    md += f"- **Ubicación:** `{relative_path}`\n"

            if node.Attributes:
                md += f"- **Atributos:**\n"
                for key, value in node.Attributes.items():
                    md += f"  - {key}: `{value}`\n"

            md += "\n"

        return md

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

        # Elementos relacionados
        if result.relatedElements:
            md += f"## 🔗 Elementos Relacionados ({len(result.relatedElements)})\n\n"

            # Agrupar por tipo de relación usando edges
            dependencies = []
            usages = []
            inheritance = []

            for edge in result.edges:
                related = next((r for r in result.relatedElements if r.Id == edge.Target or r.Id == edge.Source), None)
                if not related:
                    continue

                rel_info = {
                    'name': related.Name,
                    'type': related.Type,
                    'namespace': related.Namespace,
                    'project': related.Project,
                    'relationship': edge.Relationship
                }

                if edge.Relationship in ['Inherits', 'Implements']:
                    inheritance.append(rel_info)
                elif edge.Relationship in ['Calls', 'Uses']:
                    if edge.Source == result.mainElement.Id:
                        usages.append(rel_info)
                    else:
                        dependencies.append(rel_info)

            if inheritance:
                md += f"### 🏗️ Herencia e Implementaciones ({len(inheritance)})\n\n"
                for rel in inheritance:
                    md += f"- **{rel['name']}** (`{rel['type']}`)\n"
                    md += f"  - Relación: {rel['relationship']}\n"
                    md += f"  - Proyecto: `{rel['project']}`\n"
                    md += f"  - Namespace: `{rel['namespace']}`\n\n"

            if dependencies:
                md += f"### ⬅️ Dependencias - Quién depende de este elemento ({len(dependencies)})\n\n"
                for rel in dependencies:
                    md += f"- **{rel['name']}** (`{rel['type']}`)\n"
                    md += f"  - Relación: {rel['relationship']}\n"
                    md += f"  - Proyecto: `{rel['project']}`\n"
                    md += f"  - Namespace: `{rel['namespace']}`\n\n"

            if usages:
                md += f"### ➡️ Usos - Qué usa este elemento ({len(usages)})\n\n"
                for rel in usages:
                    md += f"- **{rel['name']}** (`{rel['type']}`)\n"
                    md += f"  - Relación: {rel['relationship']}\n"
                    md += f"  - Proyecto: `{rel['project']}`\n"
                    md += f"  - Namespace: `{rel['namespace']}`\n\n"

        # Resumen de relaciones
        if result.edges:
            md += f"\n---\n\n"
            md += f"## 📊 Resumen de Conexiones\n\n"
            md += f"- Total de elementos relacionados: **{len(result.relatedElements)}**\n"
            md += f"- Total de relaciones en el grafo: **{len(result.edges)}**\n"

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
