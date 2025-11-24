"""
Script de prueba para verificar el versionado del MCP Server.
"""
import requests
import json

BASE_URL = "http://localhost:8083"

def test_version(version_str):
    """Prueba una versión específica."""
    print(f"\n{'='*70}")
    print(f"Testing version: {version_str or 'NO VERSION (default)'}")
    print(f"{'='*70}")

    # Construir URL con o sin versión
    if version_str:
        url = f"{BASE_URL}/sse?version={version_str}"
    else:
        url = f"{BASE_URL}/sse"

    print(f"URL: {url}")

    # Probar que el endpoint responde
    try:
        response = requests.get(url, timeout=5)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            print("[OK] Endpoint responde correctamente")
        else:
            print(f"[WARNING] Status inesperado: {response.status_code}")

    except Exception as e:
        print(f"[ERROR] {e}")

    return

def main():
    print("\n" + "="*70)
    print("PRUEBAS DE VERSIONADO - MCP SERVER")
    print("="*70)

    # Probar diferentes versiones
    versions_to_test = [
        "5.12.0",   # Debería usar v6
        "6.10.3",   # Debería usar v6
        "7.10.3",   # Debería usar v7
        "8.0.0",    # Debería usar v7
        None,       # Sin versión, debería usar v7 (default)
    ]

    for version in versions_to_test:
        test_version(version)

    print("\n" + "="*70)
    print("RESUMEN")
    print("="*70)
    print("Para probar que el versionado funciona correctamente:")
    print("1. Los endpoints responden (status 200)")
    print("2. Los logs del servidor mostrarán qué templates se cargan")
    print("3. Revisar logs: grafo mcp logs")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
