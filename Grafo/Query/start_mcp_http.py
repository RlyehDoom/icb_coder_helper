#!/usr/bin/env python3
"""
Script para iniciar el servidor MCP sobre HTTP/SSE.

Este script inicia el servidor MCP que expone las funcionalidades del Query Service
vía HTTP usando Server-Sent Events (SSE), permitiendo múltiples clientes simultáneos.
"""
import sys
import os
import uvicorn
from pathlib import Path

# Agregar el directorio src al path
sys.path.insert(0, str(Path(__file__).parent))

if __name__ == "__main__":
    # Leer puerto de variable de entorno, default a 8082 (MCP Server)
    port = int(os.getenv("SERVER_PORT", "8082"))

    print("🌐 Iniciando Grafo MCP Server HTTP...")
    print(f"📡 Puerto: {port}")
    print(f"🔗 Endpoint SSE: http://0.0.0.0:{port}/sse")
    print(f"📋 Health: http://0.0.0.0:{port}/health")
    print()

    uvicorn.run(
        "src.mcp_server_http:fastapi_app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True
    )
