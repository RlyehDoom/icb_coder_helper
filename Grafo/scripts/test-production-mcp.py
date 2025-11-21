#!/usr/bin/env python3
"""
Script para probar el MCP Server en producción.
Simula las llamadas que hace Cursor al servidor MCP.
"""
import requests
import json
import time

# URL del servidor de producción
BASE_URL = "https://joseluisyr.com/api/grafo/mcp"
VERSION = "7.10.2"

def test_mcp_server():
    """Prueba el MCP Server de producción."""
    print("=" * 70)
    print("TEST: MCP Server en Producción")
    print("=" * 70)
    print(f"URL: {BASE_URL}")
    print(f"Versión: {VERSION}")
    print()

    session_id = f"test-{int(time.time())}"

    # 1. Test: Initialize
    print("1. Test: Initialize")
    print("-" * 70)

    init_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        }
    }

    try:
        response = requests.post(
            f"{BASE_URL}/sse?version={VERSION}",
            params={"session_id": session_id},
            json=init_request,
            timeout=10
        )
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2)}")
            print("[OK] Initialize exitoso")
        else:
            print(f"[ERROR] Status code: {response.status_code}")
            print(f"Response: {response.text}")
            return
    except Exception as e:
        print(f"[ERROR] Exception: {e}")
        return

    print()

    # 2. Test: List Tools
    print("2. Test: List Tools")
    print("-" * 70)

    list_tools_request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    }

    try:
        response = requests.post(
            f"{BASE_URL}/sse?version={VERSION}",
            params={"session_id": session_id},
            json=list_tools_request,
            timeout=10
        )
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            tools = result.get("result", {}).get("tools", [])
            print(f"[OK] Herramientas encontradas: {len(tools)}")
            for tool in tools:
                print(f"  - {tool.get('name')}: {tool.get('description', '')[:60]}...")
        else:
            print(f"[ERROR] Status code: {response.status_code}")
            print(f"Response: {response.text}")
            return
    except Exception as e:
        print(f"[ERROR] Exception: {e}")
        return

    print()

    # 3. Test: Search Code (ApprovalScheme)
    print("3. Test: Search Code - 'ApprovalScheme'")
    print("-" * 70)

    search_request = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "search_code",
            "arguments": {
                "query": "ApprovalScheme",
                "node_type": "Class",
                "limit": 5
            }
        }
    }

    try:
        response = requests.post(
            f"{BASE_URL}/sse?version={VERSION}",
            params={"session_id": session_id},
            json=search_request,
            timeout=30
        )
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            content_list = result.get("result", {}).get("content", [])

            if content_list:
                text_content = content_list[0].get("text", "")
                print(f"Response length: {len(text_content)} chars")
                print()
                print("Response preview:")
                print("-" * 70)
                # Mostrar primeras 1000 caracteres
                print(text_content[:1000])

                if "No se encontraron resultados" in text_content:
                    print()
                    print("[ERROR] NO se encontraron resultados para 'ApprovalScheme'")
                    print("Esto indica que el filtro de versión NO está funcionando")
                elif "Resultados encontrados:" in text_content:
                    print()
                    print("[OK] Se encontraron resultados!")
                    print("El filtro de versión está funcionando correctamente")
                else:
                    print()
                    print("[WARN] Respuesta inesperada")
            else:
                print("[ERROR] No content in response")
        else:
            print(f"[ERROR] Status code: {response.status_code}")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"[ERROR] Exception: {e}")
        return

    print()

    # 4. Test: Search Code (ProcessUserPendingApproval)
    print("4. Test: Search Code - 'ProcessUserPendingApproval'")
    print("-" * 70)

    search_request2 = {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {
            "name": "search_code",
            "arguments": {
                "query": "ProcessUserPendingApproval",
                "limit": 5
            }
        }
    }

    try:
        response = requests.post(
            f"{BASE_URL}/sse?version={VERSION}",
            params={"session_id": session_id},
            json=search_request2,
            timeout=30
        )
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            content_list = result.get("result", {}).get("content", [])

            if content_list:
                text_content = content_list[0].get("text", "")
                print(f"Response length: {len(text_content)} chars")
                print()
                print("Response preview:")
                print("-" * 70)
                print(text_content[:800])

                if "No se encontraron resultados" in text_content:
                    print()
                    print("[WARN] NO se encontraron resultados")
                elif "Resultados encontrados:" in text_content:
                    print()
                    print("[OK] Se encontraron resultados!")
        else:
            print(f"[ERROR] Status code: {response.status_code}")
    except Exception as e:
        print(f"[ERROR] Exception: {e}")

    print()
    print("=" * 70)
    print("FIN DE PRUEBAS")
    print("=" * 70)


if __name__ == "__main__":
    test_mcp_server()
