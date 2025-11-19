"""
Test para la tool get_tailored_guidance.

Este test verifica que la tool MCP get_tailored_guidance funciona correctamente
para todos los tipos de tareas soportadas.
"""

import asyncio
import sys
import io
from pathlib import Path

# Configurar encoding UTF-8 para Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Agregar el directorio padre al path
parent_dir = str(Path(__file__).parent.parent)
sys.path.insert(0, parent_dir)

# Import desde src como package
from src.mcp_tools import GraphMCPTools


async def test_tailored_guidance():
    """Test básico de la tool get_tailored_guidance."""

    print("🧪 Iniciando tests de get_tailored_guidance...\n")

    # Mock del servicio de grafo (no necesitamos MongoDB para este test)
    class MockGraphService:
        pass

    mock_service = MockGraphService()
    tools = GraphMCPTools(mock_service)

    # Test 1: Extend Business Component
    print("📝 Test 1: Extend Business Component")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "extend_business_component",
        "component_name": "Accounts",
        "layer": "BusinessComponents"
    })
    assert "# 🎯 Guía Tailored - ICBanking" in result
    assert "Accounts" in result
    assert "BusinessComponents" in result
    assert "Unity" in result
    print("✅ Test 1 passed\n")

    # Test 2: Configure Unity
    print("📝 Test 2: Configure Unity")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "configure_unity",
        "component_name": "Clients"
    })
    assert "Unity" in result
    assert "UnityConfiguration.config" in result
    assert "Clients" in result
    print("✅ Test 2 passed\n")

    # Test 3: Understand Architecture
    print("📝 Test 3: Understand Architecture")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "understand_architecture"
    })
    assert "Arquitectura" in result
    assert "Tailored" in result
    assert "capas" in result or "Capas" in result
    assert "BusinessComponents" in result
    assert "DataAccess" in result
    print("✅ Test 3 passed\n")

    # Test 4: Create Data Access
    print("📝 Test 4: Create Data Access")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "create_data_access",
        "component_name": "CustomOrders"
    })
    assert "Data Access" in result
    assert "CustomOrders" in result
    assert "Dapper" in result
    print("✅ Test 4 passed\n")

    # Test 5: Create Service Agent
    print("📝 Test 5: Create Service Agent")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "create_service_agent",
        "component_name": "ExternalPayment"
    })
    assert "Service Agent" in result
    assert "ExternalPayment" in result
    print("✅ Test 5 passed\n")

    # Test 6: Extend API
    print("📝 Test 6: Extend API")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "extend_api",
        "layer": "AppServerApi"
    })
    assert "API" in result
    assert "AppServer" in result
    assert "Startup" in result
    print("✅ Test 6 passed\n")

    # Test 7: Add Method Override
    print("📝 Test 7: Add Method Override")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "add_method_override",
        "component_name": "Accounts",
        "details": "Agregar validación personalizada"
    })
    assert "Override" in result or "override" in result
    assert "virtual" in result
    assert "base." in result
    print("✅ Test 7 passed\n")

    # Test 8: Create New Component
    print("📝 Test 8: Create New Component")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "create_new_component",
        "component_name": "CustomReports",
        "layer": "BusinessComponents"
    })
    assert "Componente Nuevo" in result
    assert "CustomReports" in result
    print("✅ Test 8 passed\n")

    # Test 9: Invalid Task Type
    print("📝 Test 9: Invalid Task Type")
    print("-" * 60)
    result = await tools._get_tailored_guidance({
        "task_type": "invalid_task"
    })
    assert "no reconocido" in result or "desconocido" in result
    print("✅ Test 9 passed\n")

    print("=" * 60)
    print("✅ TODOS LOS TESTS PASARON EXITOSAMENTE")
    print("=" * 60)
    print("\n🎉 La tool get_tailored_guidance está funcionando correctamente!")

    return True


async def test_tool_structure():
    """Test de la estructura de la tool."""

    print("\n🔍 Verificando estructura de la tool...")
    print("-" * 60)

    class MockGraphService:
        pass

    mock_service = MockGraphService()
    tools = GraphMCPTools(mock_service)

    # Verificar que la tool está en la lista
    all_tools = tools.get_tools()
    tool_names = [tool.name for tool in all_tools]

    assert "get_tailored_guidance" in tool_names, "La tool get_tailored_guidance no está registrada"
    print("✅ Tool registrada correctamente")

    # Verificar que tiene 8 tools en total
    assert len(all_tools) == 8, f"Se esperaban 8 tools, se encontraron {len(all_tools)}"
    print(f"✅ Total de tools: {len(all_tools)}")

    # Encontrar la tool específica
    tailored_tool = next((t for t in all_tools if t.name == "get_tailored_guidance"), None)
    assert tailored_tool is not None, "No se encontró la tool get_tailored_guidance"

    # Verificar schema
    schema = tailored_tool.inputSchema
    assert "properties" in schema
    assert "task_type" in schema["properties"]
    assert "required" in schema
    assert "task_type" in schema["required"]
    print("✅ Schema de parámetros correcto")

    # Verificar opciones de task_type
    task_type_enum = schema["properties"]["task_type"]["enum"]
    expected_tasks = [
        "extend_business_component",
        "create_data_access",
        "create_service_agent",
        "extend_api",
        "configure_unity",
        "understand_architecture",
        "add_method_override",
        "create_new_component"
    ]
    for task in expected_tasks:
        assert task in task_type_enum, f"Falta task_type: {task}"
    print(f"✅ Todos los task_type están definidos ({len(expected_tasks)} tipos)")

    print("\n✅ ESTRUCTURA DE LA TOOL VERIFICADA CORRECTAMENTE\n")

    return True


async def main():
    """Ejecutar todos los tests."""
    try:
        # Test de estructura
        await test_tool_structure()

        # Test de funcionalidad
        await test_tailored_guidance()

        print("\n" + "=" * 60)
        print("✅ TODOS LOS TESTS COMPLETADOS EXITOSAMENTE")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n❌ Test falló: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
