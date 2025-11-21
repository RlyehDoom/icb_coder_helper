"""
Configuración del servicio Query.
"""
import os
from pathlib import Path
from typing import Optional

# Configuración de MongoDB (compatible con IndexerDb)
# Por defecto usa puerto 27019 sin autenticación (modo desarrollo)
MONGODB_CONNECTION_STRING = os.getenv(
    "MONGODB_CONNECTION_STRING",
    "mongodb://localhost:27019/"
)
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "GraphDB")
MONGODB_PROJECTS_COLLECTION = os.getenv("MONGODB_PROJECTS_COLLECTION", "projects")
MONGODB_STATES_COLLECTION = os.getenv("MONGODB_STATES_COLLECTION", "processing_states")

# Configuración de TLS (para conexiones con certificado)
MONGODB_TLS_CERTIFICATE_KEY_FILE = os.getenv("MONGODB_TLS_CERTIFICATE_KEY_FILE", "")

# Configuración del servidor
SERVER_HOST = os.getenv("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8081"))
SERVER_RELOAD = os.getenv("SERVER_RELOAD", "true").lower() == "true"

# Configuración de CORS (para permitir conexiones desde el MCP)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

# Configuración de autenticación (opcional)
API_KEY = os.getenv("QUERY_API_KEY", "")
ENABLE_AUTH = os.getenv("ENABLE_AUTH", "false").lower() == "true"

# Configuración de caché
ENABLE_CACHE = os.getenv("ENABLE_CACHE", "true").lower() == "true"
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))  # 5 minutos por defecto

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Configuración de versión de grafo (para MCP)
# Si se especifica, todas las consultas MCP filtrarán por esta versión
GRAFO_DEFAULT_VERSION = os.getenv("GRAFO_DEFAULT_VERSION", None)


def validate_config() -> bool:
    """Valida que la configuración esté completa."""
    if not MONGODB_CONNECTION_STRING:
        raise ValueError("MONGODB_CONNECTION_STRING es requerido")
    if not MONGODB_DATABASE:
        raise ValueError("MONGODB_DATABASE es requerido")
    return True


def get_mongodb_config() -> dict:
    """Retorna configuración de MongoDB como diccionario."""
    return {
        "connection_string": MONGODB_CONNECTION_STRING,
        "database": MONGODB_DATABASE,
        "projects_collection": MONGODB_PROJECTS_COLLECTION,
        "states_collection": MONGODB_STATES_COLLECTION,
        "tls_certificate_key_file": MONGODB_TLS_CERTIFICATE_KEY_FILE
    }


def display_config():
    """Muestra la configuración actual (sin datos sensibles)."""
    print("🔧 Configuración del servicio Query:")
    print(f"   📊 MongoDB Database: {MONGODB_DATABASE}")
    print(f"   📦 Projects Collection: {MONGODB_PROJECTS_COLLECTION}")
    print(f"   🌐 Server: {SERVER_HOST}:{SERVER_PORT}")
    print(f"   🔐 Auth enabled: {ENABLE_AUTH}")
    print(f"   💾 Cache enabled: {ENABLE_CACHE} (TTL: {CACHE_TTL}s)")
    print(f"   📝 Log level: {LOG_LEVEL}")
    if GRAFO_DEFAULT_VERSION:
        print(f"   🏷️  Default Graph Version: {GRAFO_DEFAULT_VERSION}")

