#!/usr/bin/env python3
"""
Script de prueba para el servidor MCP.

Este script prueba las herramientas MCP de manera independiente
sin necesidad de Cursor/VSCode.
"""
import asyncio
import json
import sys
from pathlib import Path

# Agregar el directorio src al path
sys.path.insert(0, str(Path(__file__).parent))

from src.config import validate_config
from src.services import get_mongodb_service, GraphQueryService
from src.mcp_tools import GraphMCPTools


async def test_mcp_tools():
    """Prueba las herramientas MCP."""

    print("🧪 Iniciando pruebas del MCP Server...\n")

    # Inicializar servicios
    print("📦 Inicializando servicios...")
    try:
        validate_config()
        mongodb_service = get_mongodb_service()
        await mongodb_service.connect()
        print("✅ Conectado a MongoDB")

        graph_service = GraphQueryService(mongodb_service)
        print("✅ GraphQueryService inicializado")

        mcp_tools = GraphMCPTools(graph_service)
        print("✅ Herramientas MCP inicializadas\n")

    except Exception as e:
        print(f"❌ Error durante la inicialización: {e}")
        return

    # Listar herramientas
    print("=" * 60)
    print("📋 HERRAMIENTAS DISPONIBLES")
    print("=" * 60)
    tools = mcp_tools.get_tools()
    for i, tool in enumerate(tools, 1):
        print(f"\n{i}. {tool.name}")
        print(f"   {tool.description}")

    print("\n" + "=" * 60)
    print("🧪 EJECUTANDO PRUEBAS")
    print("=" * 60)

    # Test 1: get_statistics
    print("\n1️⃣  Test: get_statistics")
    print("-" * 60)
    try:
        result = await mcp_tools.execute_tool("get_statistics", {})
        data = json.loads(result)
        print(f"✅ Estadísticas obtenidas:")
        print(f"   - Proyectos: {data.get('totalProjects', 'N/A')}")
        print(f"   - Nodos: {data.get('totalNodes', 'N/A')}")
        print(f"   - Aristas: {data.get('totalEdges', 'N/A')}")
    except Exception as e:
        print(f"❌ Error: {e}")

    # Test 2: list_projects
    print("\n2️⃣  Test: list_projects")
    print("-" * 60)
    try:
        result = await mcp_tools.execute_tool("list_projects", {"limit": 5})
        data = json.loads(result)
        print(f"✅ {data.get('message', 'Proyectos encontrados')}")
        projects = data.get('projects', [])
        for proj in projects[:3]:
            print(f"   - {proj.get('name', 'N/A')} ({proj.get('nodeCount', 0)} nodos)")
    except Exception as e:
        print(f"❌ Error: {e}")

    # Test 3: search_code
    print("\n3️⃣  Test: search_code (buscar 'Service')")
    print("-" * 60)
    try:
        result = await mcp_tools.execute_tool("search_code", {
            "query": "Service",
            "node_type": "Class",
            "limit": 3
        })
        data = json.loads(result)
        print(f"✅ {data.get('message', 'Resultados encontrados')}")
        results = data.get('results', [])
        for res in results[:3]:
            print(f"   - {res.get('name', 'N/A')} ({res.get('type', 'N/A')})")
            print(f"     Proyecto: {res.get('project', 'N/A')}")
    except Exception as e:
        print(f"❌ Error: {e}")

    # Test 4: get_code_context (si encontramos algo en el test anterior)
    if results:
        print("\n4️⃣  Test: get_code_context")
        print("-" * 60)
        first_result = results[0]
        try:
            result = await mcp_tools.execute_tool("get_code_context", {
                "className": first_result['name'],
                "project": first_result.get('project'),
                "includeRelated": True,
                "maxDepth": 1
            })
            data = json.loads(result)
            if data.get('found'):
                print(f"✅ Contexto obtenido para: {first_result['name']}")
                related_count = len(data.get('related', []))
                print(f"   - Nodos relacionados: {related_count}")
                relationships = data.get('relationships', {})
                for rel_type, edges in relationships.items():
                    if edges:
                        print(f"   - {rel_type}: {len(edges)} relaciones")
            else:
                print(f"⚠️  No se encontró contexto")
        except Exception as e:
            print(f"❌ Error: {e}")

    # Test 5: get_project_structure (si hay proyectos)
    if projects:
        print("\n5️⃣  Test: get_project_structure")
        print("-" * 60)
        first_project = projects[0]
        try:
            result = await mcp_tools.execute_tool("get_project_structure", {
                "project_id": first_project['id']
            })
            data = json.loads(result)
            print(f"✅ Estructura del proyecto: {first_project['name']}")
            print(f"   - Total nodos: {data.get('totalNodes', 0)}")
            by_type = data.get('byType', {})
            for node_type, nodes in list(by_type.items())[:3]:
                print(f"   - {node_type}: {len(nodes)} elementos")
        except Exception as e:
            print(f"❌ Error: {e}")

    # Cleanup
    print("\n" + "=" * 60)
    print("🧹 Limpiando...")
    await mongodb_service.disconnect()
    print("✅ Pruebas completadas\n")


async def interactive_mode():
    """Modo interactivo para probar herramientas."""

    print("🎮 Modo Interactivo MCP\n")

    # Inicializar servicios
    print("Inicializando servicios...")
    try:
        validate_config()
        mongodb_service = get_mongodb_service()
        await mongodb_service.connect()
        graph_service = GraphQueryService(mongodb_service)
        mcp_tools = GraphMCPTools(graph_service)
        print("✅ Listo\n")
    except Exception as e:
        print(f"❌ Error: {e}")
        return

    # Listar herramientas
    tools = mcp_tools.get_tools()
    print("Herramientas disponibles:")
    for i, tool in enumerate(tools, 1):
        print(f"{i}. {tool.name}")

    print("\nComandos:")
    print("  - Número de herramienta para ejecutar")
    print("  - 'list' para listar herramientas")
    print("  - 'exit' para salir\n")

    while True:
        try:
            cmd = input(">>> ").strip()

            if cmd == "exit":
                break
            elif cmd == "list":
                for i, tool in enumerate(tools, 1):
                    print(f"{i}. {tool.name} - {tool.description}")
                continue

            try:
                tool_idx = int(cmd) - 1
                if tool_idx < 0 or tool_idx >= len(tools):
                    print("❌ Número de herramienta inválido")
                    continue

                tool = tools[tool_idx]
                print(f"\n🔧 Ejecutando: {tool.name}")

                # Pedir argumentos
                args = {}
                schema = tool.inputSchema
                if 'properties' in schema:
                    for prop, prop_schema in schema['properties'].items():
                        if prop in schema.get('required', []):
                            value = input(f"  {prop} (requerido): ").strip()
                            if value:
                                args[prop] = value
                        else:
                            value = input(f"  {prop} (opcional, Enter para omitir): ").strip()
                            if value:
                                args[prop] = value

                # Ejecutar
                result = await mcp_tools.execute_tool(tool.name, args)
                print("\n📄 Resultado:")
                print(result)
                print()

            except ValueError:
                print("❌ Comando inválido")

        except KeyboardInterrupt:
            print("\n")
            break
        except Exception as e:
            print(f"❌ Error: {e}")

    # Cleanup
    await mongodb_service.disconnect()
    print("👋 Adiós")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        asyncio.run(interactive_mode())
    else:
        asyncio.run(test_mcp_tools())
