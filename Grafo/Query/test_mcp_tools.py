"""Script temporal para verificar herramientas MCP."""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from src.mcp_tools import GraphMCPTools
from src.services.graph_service import GraphQueryService
from src.services.mongodb_service import get_mongodb_service

print('✓ GraphMCPTools cargado correctamente')

# Crear instancias (sin conectar a MongoDB)
mongo_service = get_mongodb_service()
graph_service = GraphQueryService(mongo_service)
tools_handler = GraphMCPTools(graph_service)

# Obtener herramientas
tool_list = tools_handler.get_tools()
print(f'\n✓ Herramientas MCP disponibles: {len(tool_list)}')

for tool in tool_list:
    print(f'  - {tool.name}')

print('\n✓ Todas las herramientas MCP se cargaron correctamente')
