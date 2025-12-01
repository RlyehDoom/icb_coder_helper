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

# Configuración de Redis Cache
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "") or None
ENABLE_CACHE = os.getenv("ENABLE_CACHE", "true").lower() == "true"
CACHE_TTL = int(os.getenv("CACHE_TTL", "86400"))  # 24 horas por defecto

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Configuración de versión de grafo (REQUERIDO para v2.1)
# Las colecciones tienen formato: nodes_{version} (ej: nodes_6_5_0)
# Ejemplo: GRAFO_DEFAULT_VERSION=6.5.0 → collection nodes_6_5_0
GRAFO_DEFAULT_VERSION = os.getenv("GRAFO_DEFAULT_VERSION", "6.5.0")


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


def get_redis_config() -> dict:
    """Retorna configuración de Redis como diccionario."""
    return {
        "host": REDIS_HOST,
        "port": REDIS_PORT,
        "db": REDIS_DB,
        "password": REDIS_PASSWORD,
        "enabled": ENABLE_CACHE,
        "ttl": CACHE_TTL
    }


def display_config():
    """Muestra la configuración actual (sin datos sensibles)."""
    print("🔧 Configuración del servicio Query:")
    print(f"   📊 MongoDB Database: {MONGODB_DATABASE}")
    print(f"   📦 Projects Collection: {MONGODB_PROJECTS_COLLECTION}")
    print(f"   🌐 Server: {SERVER_HOST}:{SERVER_PORT}")
    print(f"   🔐 Auth enabled: {ENABLE_AUTH}")
    print(f"   💾 Redis Cache: {REDIS_HOST}:{REDIS_PORT} (enabled: {ENABLE_CACHE}, TTL: {CACHE_TTL}s)")
    print(f"   📝 Log level: {LOG_LEVEL}")
    if GRAFO_DEFAULT_VERSION:
        print(f"   🏷️  Default Graph Version: {GRAFO_DEFAULT_VERSION}")

