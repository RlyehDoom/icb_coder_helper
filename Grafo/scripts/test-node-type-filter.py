#!/usr/bin/env python3
"""
Script para demostrar el problema del filtro node_type.
"""
import requests
import json
import time

BASE_URL = "https://joseluisyr.com/api/grafo/mcp"
VERSION = "7.10.2"

def test_node_type_filtering():
    """Prueba búsquedas con diferentes node_type."""
    print("=" * 70)
    print("TEST: Efecto del filtro node_type en búsquedas")
    print("=" * 70)
    print()

    session_id = f"test-{int(time.time())}"

    # Initialize
    init_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1.0"}
        }
    }
    requests.post(
        f"{BASE_URL}/sse?version={VERSION}",
        params={"session_id": session_id},
        json=init_request,
        timeout=10
    )

    # Test 1: Buscar "ProcessUserPendingApproval" SIN filtro de tipo
    print("1. Buscar 'ProcessUserPendingApproval' SIN node_type")
    print("-" * 70)

    search_no_filter = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "search_code",
            "arguments": {
                "query": "ProcessUserPendingApproval",
                "limit": 10
            }
        }
    }

    response = requests.post(
        f"{BASE_URL}/sse?version={VERSION}",
        params={"session_id": session_id},
        json=search_no_filter,
        timeout=30
    )

    if response.status_code == 200:
        result = response.json()
        text = result.get("result", {}).get("content", [{}])[0].get("text", "")

        # Extraer número de resultados
        if "Resultados encontrados:" in text:
            import re
            match = re.search(r'Resultados encontrados:\*\* (\d+)', text)
            if match:
                count = match.group(1)
                print(f"Resultados: {count}")

                # Mostrar tipos de nodos encontrados
                types = re.findall(r'\*\*Tipo:\*\* `(\w+)`', text)
                print(f"Tipos encontrados: {set(types)}")
        else:
            print("No se encontraron resultados")

    print()

    # Test 2: Buscar "ProcessUserPendingApproval" CON node_type: "Class"
    print("2. Buscar 'ProcessUserPendingApproval' CON node_type: 'Class'")
    print("-" * 70)

    search_class_filter = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "search_code",
            "arguments": {
                "query": "ProcessUserPendingApproval",
                "node_type": "Class",
                "limit": 10
            }
        }
    }

    response = requests.post(
        f"{BASE_URL}/sse?version={VERSION}",
        params={"session_id": session_id},
        json=search_class_filter,
        timeout=30
    )

    if response.status_code == 200:
        result = response.json()
        text = result.get("result", {}).get("content", [{}])[0].get("text", "")

        if "No se encontraron resultados" in text:
            print("Resultados: 0 (FILTRADO - no hay clases con ese nombre)")
        elif "Resultados encontrados:" in text:
            import re
            match = re.search(r'Resultados encontrados:\*\* (\d+)', text)
            if match:
                print(f"Resultados: {match.group(1)}")

    print()

    # Test 3: Buscar "ProcessUserPendingApproval" CON node_type: "Method"
    print("3. Buscar 'ProcessUserPendingApproval' CON node_type: 'Method'")
    print("-" * 70)

    search_method_filter = {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {
            "name": "search_code",
            "arguments": {
                "query": "ProcessUserPendingApproval",
                "node_type": "Method",
                "limit": 10
            }
        }
    }

    response = requests.post(
        f"{BASE_URL}/sse?version={VERSION}",
        params={"session_id": session_id},
        json=search_method_filter,
        timeout=30
    )

    if response.status_code == 200:
        result = response.json()
        text = result.get("result", {}).get("content", [{}])[0].get("text", "")

        if "Resultados encontrados:" in text:
            import re
            match = re.search(r'Resultados encontrados:\*\* (\d+)', text)
            if match:
                count = match.group(1)
                print(f"Resultados: {count}")

                # Mostrar nombres de métodos
                names = re.findall(r'## \d+\. (.+)\n', text)
                print(f"Métodos encontrados:")
                for name in names[:5]:
                    print(f"  - {name}")

    print()

    # Test 4: Buscar "ApprovalScheme" (query ambiguo)
    print("4. Buscar 'ApprovalScheme' SIN node_type (query ambiguo)")
    print("-" * 70)

    search_ambiguous = {
        "jsonrpc": "2.0",
        "id": 5,
        "method": "tools/call",
        "params": {
            "name": "search_code",
            "arguments": {
                "query": "ApprovalScheme",
                "limit": 10
            }
        }
    }

    response = requests.post(
        f"{BASE_URL}/sse?version={VERSION}",
        params={"session_id": session_id},
        json=search_ambiguous,
        timeout=30
    )

    if response.status_code == 200:
        result = response.json()
        text = result.get("result", {}).get("content", [{}])[0].get("text", "")

        if "Resultados encontrados:" in text:
            import re
            match = re.search(r'Resultados encontrados:\*\* (\d+)', text)
            if match:
                count = match.group(1)
                print(f"Resultados totales: {count}")

                # Contar por tipo
                types = re.findall(r'\*\*Tipo:\*\* `(\w+)`', text)
                from collections import Counter
                type_counts = Counter(types)
                print(f"Desglose por tipo:")
                for node_type, count in type_counts.items():
                    print(f"  - {node_type}: {count}")

    print()
    print("=" * 70)
    print("CONCLUSIÓN:")
    print("=" * 70)
    print()
    print("Si buscas 'ProcessUserPendingApproval' con node_type: 'Class',")
    print("NO encontrarás nada porque es un MÉTODO, no una clase.")
    print()
    print("RECOMENDACIÓN:")
    print("- Para búsquedas generales: NO especificar node_type")
    print("- Para búsquedas específicas: Usar el node_type correcto")
    print("  (Class, Interface, Method, Property, Field, Enum, Struct)")
    print()


if __name__ == "__main__":
    test_node_type_filtering()
