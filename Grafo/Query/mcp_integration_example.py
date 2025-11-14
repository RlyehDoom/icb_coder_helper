"""
Ejemplo de integración del Query Service con el MCP.

Este archivo muestra cómo el MCP puede consumir el Query Service
para obtener contexto de código desde el grafo.

NOTA: Este es un archivo de ejemplo. La integración real debe
implementarse en el proyecto MCP.
"""

import requests
from typing import Optional, Dict, Any


class GraphQueryClient:
    """Cliente para el Query Service desde el MCP."""
    
    def __init__(self, base_url: str = "http://localhost:8081"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
    
    def health_check(self) -> Dict[str, Any]:
        """Verifica si el Query Service está disponible."""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def get_code_context(
        self,
        class_name: Optional[str] = None,
        method_name: Optional[str] = None,
        namespace: Optional[str] = None,
        project_name: Optional[str] = None,
        file_path: Optional[str] = None,
        include_related: bool = True,
        max_related: int = 10
    ) -> Dict[str, Any]:
        """
        Obtiene contexto de código desde el grafo.
        
        Args:
            class_name: Nombre de la clase a buscar
            method_name: Nombre del método (requiere class_name)
            namespace: Namespace para filtrar
            project_name: Nombre del proyecto para filtrar
            file_path: Ruta del archivo
            include_related: Incluir elementos relacionados
            max_related: Máximo número de elementos relacionados
        
        Returns:
            Dict con el contexto encontrado y sugerencias
        """
        payload = {
            "className": class_name,
            "methodName": method_name,
            "namespace": namespace,
            "projectName": project_name,
            "filePath": file_path,
            "includeRelated": include_related,
            "maxRelated": max_related
        }
        
        # Remover valores None
        payload = {k: v for k, v in payload.items() if v is not None}
        
        try:
            response = requests.post(
                f"{self.api_url}/context/code",
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {
                "found": False,
                "error": str(e)
            }
    
    def search_projects(self, query: Optional[str] = None, layer: Optional[str] = None, limit: int = 50):
        """Busca proyectos por nombre o capa."""
        payload = {
            "query": query,
            "layer": layer,
            "limit": limit
        }
        payload = {k: v for k, v in payload.items() if v is not None}
        
        try:
            response = requests.post(
                f"{self.api_url}/projects/search",
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return []
    
    def search_nodes(
        self,
        query: str,
        node_type: Optional[str] = None,
        project: Optional[str] = None,
        namespace: Optional[str] = None,
        limit: int = 50
    ):
        """Busca nodos en el grafo."""
        payload = {
            "query": query,
            "nodeType": node_type,
            "project": project,
            "namespace": namespace,
            "limit": limit
        }
        payload = {k: v for k, v in payload.items() if v is not None}
        
        try:
            response = requests.post(
                f"{self.api_url}/nodes/search",
                json=payload,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return []
    
    def get_statistics(self) -> Dict[str, Any]:
        """Obtiene estadísticas del grafo."""
        try:
            response = requests.get(
                f"{self.api_url}/context/statistics",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {}


# ============================================================================
# EJEMPLO DE USO EN EL MCP
# ============================================================================

def example_mcp_tool_get_code_context():
    """
    Ejemplo de cómo implementar una herramienta MCP que use el Query Service.
    
    Este código debería agregarse en el MCP, por ejemplo en:
    MCP/src/tools/graph_query_tool.py
    """
    
    # En el MCP, esto sería algo así:
    """
    from fastmcp import FastMCP
    from pydantic import Field
    
    mcp = FastMCP("ICGuru MCP")
    graph_client = GraphQueryClient()
    
    @mcp.tool()
    def get_code_context(
        class_name: str = Field(..., description="Nombre de la clase a buscar"),
        method_name: str = Field(None, description="Nombre del método (opcional)"),
        namespace: str = Field(None, description="Namespace para filtrar (opcional)"),
        project_name: str = Field(None, description="Nombre del proyecto (opcional)")
    ) -> str:
        '''
        Obtiene contexto de código desde el grafo para asistir en generación/modificación.
        
        Esta herramienta consulta el grafo de código para obtener información sobre:
        - Estructura de la clase/método
        - Elementos relacionados (dependencias, herencias, etc.)
        - Sugerencias basadas en el contexto
        
        Útil cuando el usuario pide:
        - Crear código similar a algo existente
        - Modificar código existente
        - Entender dependencias
        '''
        
        # Verificar disponibilidad del servicio
        health = graph_client.health_check()
        if health.get("status") != "healthy":
            return "⚠️ El servicio de grafo no está disponible. Continuando sin contexto del grafo."
        
        # Obtener contexto
        result = graph_client.get_code_context(
            class_name=class_name,
            method_name=method_name,
            namespace=namespace,
            project_name=project_name,
            include_related=True,
            max_related=10
        )
        
        if not result.get("found"):
            return f"❌ No se encontró '{class_name}' en el grafo de código."
        
        # Formatear respuesta para el LLM
        main = result["mainElement"]
        related = result.get("relatedElements", [])
        suggestions = result.get("suggestions", [])
        project_info = result.get("projectInfo")
        
        context = f"✅ Elemento encontrado en el grafo:\\n\\n"
        context += f"**{main['Name']}** ({main['Type']})\\n"
        context += f"- Proyecto: {project_info['ProjectName'] if project_info else 'N/A'}\\n"
        context += f"- Namespace: {main.get('Namespace', 'N/A')}\\n"
        context += f"- Accesibilidad: {main.get('Accessibility', 'N/A')}\\n"
        
        if main.get('Location'):
            loc = main['Location']
            context += f"- Ubicación: {loc.get('filePath', 'N/A')} (línea {loc.get('line', 'N/A')})\\n"
        
        if related:
            context += f"\\n**Elementos relacionados ({len(related)}):**\\n"
            for elem in related[:5]:  # Mostrar solo los primeros 5
                context += f"  - {elem['Name']} ({elem['Type']})\\n"
            
            if len(related) > 5:
                context += f"  ... y {len(related) - 5} más\\n"
        
        if suggestions:
            context += "\\n**💡 Sugerencias:**\\n"
            for suggestion in suggestions:
                context += f"  - {suggestion}\\n"
        
        return context
    
    
    @mcp.tool()
    def search_similar_code(
        query: str = Field(..., description="Término a buscar en el código"),
        node_type: str = Field(None, description="Tipo de nodo: Class, Method, Interface, etc."),
        limit: int = Field(default=10, description="Máximo de resultados")
    ) -> str:
        '''
        Busca código similar en el grafo.
        
        Útil cuando el usuario dice:
        - "Muéstrame servicios similares"
        - "¿Hay algo parecido a X?"
        - "Busca clases que hagan Y"
        '''
        
        health = graph_client.health_check()
        if health.get("status") != "healthy":
            return "⚠️ El servicio de grafo no está disponible."
        
        results = graph_client.search_nodes(
            query=query,
            node_type=node_type,
            limit=limit
        )
        
        if not results:
            return f"❌ No se encontraron resultados para '{query}'"
        
        response = f"✅ Encontrados {len(results)} elementos similares:\\n\\n"
        for item in results:
            response += f"**{item['Name']}** ({item['Type']})\\n"
            response += f"  - Proyecto: {item.get('Project', 'N/A')}\\n"
            response += f"  - Namespace: {item.get('Namespace', 'N/A')}\\n\\n"
        
        return response
    
    
    @mcp.tool()
    def get_graph_statistics() -> str:
        '''Obtiene estadísticas del grafo de código.'''
        
        health = graph_client.health_check()
        if health.get("status") != "healthy":
            return "⚠️ El servicio de grafo no está disponible."
        
        stats = graph_client.get_statistics()
        
        if not stats:
            return "❌ No se pudieron obtener estadísticas"
        
        response = "📊 **Estadísticas del Grafo de Código:**\\n\\n"
        response += f"- Total de proyectos: {stats.get('totalProjects', 0)}\\n"
        response += f"- Total de nodos: {stats.get('totalNodes', 0)}\\n"
        response += f"- Total de relaciones: {stats.get('totalEdges', 0)}\\n"
        response += f"- Promedio de nodos por proyecto: {stats.get('avgNodesPerProject', 0)}\\n"
        
        layers = stats.get('projectsByLayer', {})
        if layers:
            response += "\\n**Proyectos por capa:**\\n"
            for layer, count in sorted(layers.items(), key=lambda x: x[1], reverse=True):
                response += f"  - {layer}: {count} proyectos\\n"
        
        return response
    """
    pass


# ============================================================================
# PRUEBAS DE EJEMPLO
# ============================================================================

if __name__ == "__main__":
    print("🧪 Probando integración con Query Service...")
    
    client = GraphQueryClient()
    
    # 1. Health check
    print("\n1️⃣ Health Check:")
    health = client.health_check()
    print(f"   Status: {health.get('status')}")
    print(f"   MongoDB: {health.get('mongodb')}")
    
    # 2. Estadísticas
    print("\n2️⃣ Estadísticas del Grafo:")
    stats = client.get_statistics()
    print(f"   Total proyectos: {stats.get('totalProjects', 0)}")
    print(f"   Total nodos: {stats.get('totalNodes', 0)}")
    
    # 3. Búsqueda de proyectos
    print("\n3️⃣ Búsqueda de Proyectos (ejemplo):")
    projects = client.search_projects(query="Banking", limit=5)
    print(f"   Encontrados: {len(projects)} proyectos")
    for p in projects[:3]:
        print(f"   - {p.get('ProjectName')} ({p.get('Layer')})")
    
    # 4. Búsqueda de nodos
    print("\n4️⃣ Búsqueda de Nodos (ejemplo):")
    nodes = client.search_nodes(query="Service", node_type="Class", limit=5)
    print(f"   Encontrados: {len(nodes)} nodos")
    for n in nodes[:3]:
        print(f"   - {n.get('Name')} ({n.get('Type')})")
    
    # 5. Contexto de código (ejemplo más complejo)
    print("\n5️⃣ Contexto de Código (ejemplo):")
    # Este es un ejemplo - ajustar con nombres reales de tu código
    context = client.get_code_context(
        class_name="UserService",
        namespace="Banking.Core",
        include_related=True
    )
    
    if context.get("found"):
        print(f"   ✅ Encontrado: {context['mainElement']['Name']}")
        print(f"   Relacionados: {len(context.get('relatedElements', []))}")
        print(f"   Sugerencias: {len(context.get('suggestions', []))}")
    else:
        print(f"   ❌ No encontrado (esto es normal si no existe 'UserService' en tu código)")
    
    print("\n✅ Pruebas completadas!")

