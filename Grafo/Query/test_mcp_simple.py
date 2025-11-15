"""Test simple del MCP Server y sus herramientas."""
import sys
import asyncio
sys.stdout.reconfigure(encoding='utf-8')

from src.mcp_tools import GraphMCPTools
from src.services.graph_service import GraphQueryService
from src.services.mongodb_service import get_mongodb_service

async def test_mcp_tools():
    """Prueba las herramientas MCP con datos reales."""
    print("Iniciando pruebas del MCP Server...\n")

    # Conectar a MongoDB
    mongo_service = get_mongodb_service()
    await mongo_service.connect()
    print("OK - Conectado a MongoDB\n")

    # Crear servicio de grafo
    graph_service = GraphQueryService(mongo_service)
    print("OK - GraphQueryService creado\n")

    # Crear manejador de herramientas MCP
    mcp_tools = GraphMCPTools(graph_service)
    tools = mcp_tools.get_tools()
    print(f"OK - {len(tools)} herramientas MCP disponibles\n")

    # Test 1: list_projects
    print("=== Test 1: list_projects ===")
    result = await mcp_tools.execute_tool("list_projects", {"limit": 5})
    print("Resultado:", result[:200] + "...\n")

    # Test 2: search_code
    print("=== Test 2: search_code ===")
    result = await mcp_tools.execute_tool("search_code", {
        "query": "Transfer",
        "node_type": "Class",
        "limit": 3
    })
    print("Resultado:", result[:200] + "...\n")

    # Test 3: get_code_context
    print("=== Test 3: get_code_context ===")
    result = await mcp_tools.execute_tool("get_code_context", {
        "className": "ScheduledTransferOperations",
        "includeRelated": True
    })
    print("Resultado:", result[:300] + "...\n")

    # Test 4: get_statistics
    print("=== Test 4: get_statistics ===")
    result = await mcp_tools.execute_tool("get_statistics", {})
    print("Resultado:", result[:400] + "...\n")

    await mongo_service.disconnect()
    print("\n=== TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE ===")

if __name__ == "__main__":
    asyncio.run(test_mcp_tools())
