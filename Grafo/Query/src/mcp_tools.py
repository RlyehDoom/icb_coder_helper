"""
Herramientas MCP para consultar el grafo de código C#.

Este módulo expone las funcionalidades del Query Service como herramientas MCP
que pueden ser utilizadas por IDEs como Cursor o VSCode.
"""
import logging
from typing import Dict, Any, List
from mcp.server import Server
from mcp.types import Tool, TextContent
import json

from .services import GraphQueryService
from .models import (
    SearchNodesRequest,
    CodeContextRequest,
    SearchProjectsRequest
)

logger = logging.getLogger(__name__)


class GraphMCPTools:
    """Herramientas MCP para consultar el grafo de código."""

    def __init__(self, graph_service: GraphQueryService):
        """
        Inicializa las herramientas MCP.

        Args:
            graph_service: Servicio de consultas del grafo
        """
        self.graph_service = graph_service

    def get_tools(self) -> List[Tool]:
        """Retorna la lista de herramientas MCP disponibles."""
        return [
            Tool(
                name="search_code",
                description=(
                    "Busca elementos de código (clases, métodos, interfaces) en el grafo. "
                    "Útil para encontrar código existente antes de crear nuevo código. "
                    "Soporta búsqueda por nombre, tipo, proyecto y namespace."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Término de búsqueda (nombre de clase, método, etc.)"
                        },
                        "node_type": {
                            "type": "string",
                            "description": "Tipo de nodo: Class, Interface, Method, Property, etc.",
                            "enum": ["Class", "Interface", "Method", "Property", "Field", "Enum", "Struct"]
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
                    "Obtiene contexto detallado de un elemento de código incluyendo: "
                    "1) El nodo solicitado con toda su información "
                    "2) Nodos relacionados (herencias, implementaciones, llamadas) "
                    "3) Dependencias y usos. "
                    "Ideal para entender cómo usar una clase o método existente."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "className": {
                            "type": "string",
                            "description": "Nombre de la clase a consultar"
                        },
                        "methodName": {
                            "type": "string",
                            "description": "Nombre del método (opcional)"
                        },
                        "namespace": {
                            "type": "string",
                            "description": "Namespace completo (opcional)"
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
                    "Lista los proyectos disponibles en el grafo. "
                    "Útil para conocer qué proyectos están indexados y disponibles para consulta."
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
                    "Obtiene la estructura completa de un proyecto: "
                    "clases, interfaces, métodos principales. "
                    "Útil para entender la arquitectura de un proyecto."
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
                    "Encuentra todas las implementaciones de una interfaz o "
                    "clases que heredan de una clase base. "
                    "Útil para entender jerarquías y polimorfismo."
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
                name="get_statistics",
                description=(
                    "Obtiene estadísticas generales del grafo: "
                    "número de proyectos, nodos, tipos de elementos, etc."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {}
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
            elif tool_name == "list_projects":
                return await self._list_projects(arguments)
            elif tool_name == "get_project_structure":
                return await self._get_project_structure(arguments)
            elif tool_name == "find_implementations":
                return await self._find_implementations(arguments)
            elif tool_name == "get_statistics":
                return await self._get_statistics(arguments)
            else:
                return json.dumps({
                    "error": f"Unknown tool: {tool_name}"
                }, indent=2)
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
            return json.dumps({
                "error": str(e),
                "tool": tool_name,
                "arguments": arguments
            }, indent=2)

    async def _search_code(self, args: Dict[str, Any]) -> str:
        """Busca código en el grafo."""
        request = SearchNodesRequest(
            query=args["query"],
            nodeType=args.get("node_type"),
            project=args.get("project"),
            namespace=args.get("namespace"),
            limit=args.get("limit", 20)
        )

        results = await self.graph_service.search_nodes(request)

        if not results:
            return json.dumps({
                "message": f"No se encontraron resultados para: {args['query']}",
                "results": []
            }, indent=2)

        # Formatear resultados de manera legible
        formatted_results = []
        for node in results:
            formatted_results.append({
                "name": node.Name,
                "type": node.Type,
                "project": node.Project,
                "namespace": node.Namespace,
                "location": node.Location,
                "attributes": node.Attributes
            })

        return json.dumps({
            "message": f"Se encontraron {len(results)} resultados",
            "results": formatted_results
        }, indent=2)

    async def _get_code_context(self, args: Dict[str, Any]) -> str:
        """Obtiene contexto de código."""
        request = CodeContextRequest(
            className=args["className"],
            methodName=args.get("methodName"),
            namespace=args.get("namespace"),
            relativePath=args.get("relativePath"),
            absolutePath=args.get("absolutePath"),
            projectName=args.get("projectName"),
            includeRelated=args.get("includeRelated", True),
            maxDepth=args.get("maxDepth", 2)
        )

        result = await self.graph_service.get_code_context(request)

        if not result.found:
            suggestions_msg = "\n".join(result.suggestions) if result.suggestions else ""
            message = f"No se encontró: {args['className']}"
            if suggestions_msg:
                message += f"\n\nSugerencias:\n{suggestions_msg}"
            return json.dumps({
                "found": False,
                "message": message,
                "suggestions": result.suggestions
            }, indent=2)

        return json.dumps({
            "found": True,
            "mainElement": result.mainElement.model_dump() if result.mainElement else None,
            "relatedElements": [node.model_dump() for node in result.relatedElements],
            "edges": [edge.model_dump() for edge in result.edges],
            "projectInfo": result.projectInfo.model_dump() if result.projectInfo else None,
            "suggestions": result.suggestions
        }, indent=2, default=str)

    async def _list_projects(self, args: Dict[str, Any]) -> str:
        """Lista proyectos disponibles."""
        request = SearchProjectsRequest(
            query=args.get("query"),
            limit=args.get("limit", 50)
        )

        results = await self.graph_service.search_projects(request)

        if not results:
            return json.dumps({
                "message": "No se encontraron proyectos",
                "projects": []
            }, indent=2)

        formatted_projects = []
        for project in results:
            # results retorna diccionarios, no objetos ProjectSummary
            if isinstance(project, dict):
                formatted_projects.append({
                    "id": project.get("_id"),
                    "name": project.get("projectName"),
                    "namespace": project.get("namespace"),
                    "nodeCount": len(project.get("nodes", [])),
                    "edgeCount": len(project.get("edges", []))
                })
            else:
                # Si es un objeto Pydantic
                formatted_projects.append({
                    "id": project.MongoId,
                    "name": project.ProjectName,
                    "layer": project.Layer,
                    "nodeCount": project.NodeCount,
                    "edgeCount": project.EdgeCount
                })

        return json.dumps({
            "message": f"Se encontraron {len(results)} proyectos",
            "projects": formatted_projects
        }, indent=2, default=str)

    async def _get_project_structure(self, args: Dict[str, Any]) -> str:
        """Obtiene estructura de un proyecto."""
        project_id = args["project_id"]
        node_type = args.get("node_type")

        nodes = await self.graph_service.get_nodes_by_project(project_id, node_type)

        if not nodes:
            return json.dumps({
                "message": f"No se encontraron nodos en el proyecto: {project_id}",
                "nodes": []
            }, indent=2)

        # Agrupar por tipo
        by_type = {}
        for node in nodes:
            node_type = node.Type
            if node_type not in by_type:
                by_type[node_type] = []
            by_type[node_type].append({
                "name": node.Name,
                "namespace": node.Namespace,
                "attributes": node.Attributes
            })

        return json.dumps({
            "project": project_id,
            "totalNodes": len(nodes),
            "byType": by_type
        }, indent=2)

    async def _find_implementations(self, args: Dict[str, Any]) -> str:
        """Encuentra implementaciones de una interfaz o herencias."""
        interface_name = args["interface_or_class"]
        namespace = args.get("namespace")

        # Buscar la interfaz/clase
        search_request = SearchNodesRequest(
            query=interface_name,
            nodeType=None,  # Puede ser Interface o Class
            namespace=namespace,
            limit=5
        )

        interfaces = await self.graph_service.search_nodes(search_request)

        if not interfaces:
            return json.dumps({
                "message": f"No se encontró: {interface_name}",
                "implementations": []
            }, indent=2)

        # Por simplicidad, tomar el primero
        target = interfaces[0]

        # Buscar implementaciones usando contexto
        context_request = CodeContextRequest(
            className=target.Name,
            namespace=target.Namespace,
            projectName=target.Project,
            includeRelated=True
        )

        context = await self.graph_service.get_code_context(context_request)

        # Filtrar solo implementaciones/herencias de los edges
        implementations = []
        if context.edges:
            for edge in context.edges:
                if edge.Relationship in ["Implements", "Inherits"]:
                    # Encontrar el nodo relacionado
                    related_node = next(
                        (node for node in context.relatedElements
                         if node.Id == edge.Source or node.Id == edge.Target),
                        None
                    )
                    if related_node:
                        implementations.append({
                            "name": related_node.Name,
                            "namespace": related_node.Namespace,
                            "type": related_node.Type,
                            "relationship": edge.Relationship,
                            "project": related_node.Project
                        })

        return json.dumps({
            "interface": target.Name,
            "namespace": target.Namespace,
            "implementationCount": len(implementations),
            "implementations": implementations
        }, indent=2)

    async def _get_statistics(self, args: Dict[str, Any]) -> str:
        """Obtiene estadísticas del grafo."""
        stats = await self.graph_service.get_statistics()

        return json.dumps(stats, indent=2)
