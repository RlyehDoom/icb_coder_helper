#!/usr/bin/env python3
"""
Script para iniciar el servidor MCP sobre HTTP/SSE.

Este script inicia el servidor MCP que expone las funcionalidades del Query Service
vía HTTP usando Server-Sent Events (SSE), permitiendo múltiples clientes simultáneos.
"""
import sys
import uvicorn
from pathlib import Path

# Agregar el directorio src al path
sys.path.insert(0, str(Path(__file__).parent))

if __name__ == "__main__":
    print("🌐 Iniciando Grafo MCP Server HTTP...")
    print("📡 Puerto: 8082")
    print("🔗 Endpoint SSE: http://0.0.0.0:8082/sse")
    print("📋 Health: http://0.0.0.0:8082/health")
    print()

    uvicorn.run(
        "src.mcp_server_http:fastapi_app",
        host="0.0.0.0",
        port=8082,
        log_level="info",
        access_log=True
    )
