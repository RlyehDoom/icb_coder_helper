"""
Servicio de conexión y operaciones básicas con MongoDB.
"""
import logging
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from ..config import get_mongodb_config

logger = logging.getLogger(__name__)


class MongoDBService:
    """Servicio para operaciones con MongoDB."""
    
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
        self.config = get_mongodb_config()
        self._connected = False
    
    async def connect(self):
        """Establece conexión con MongoDB."""
        try:
            logger.info(f"🔗 Conectando a MongoDB: {self.config['database']}")
            self.client = AsyncIOMotorClient(
                self.config['connection_string'],
                serverSelectionTimeoutMS=5000
            )
            
            # Verificar conexión
            await self.client.admin.command('ping')
            self.db = self.client[self.config['database']]
            self._connected = True
            
            # Mostrar estadísticas de conexión
            project_count = await self.db[self.config['projects_collection']].count_documents({})
            logger.info(f"✅ Conectado a MongoDB: {project_count} proyectos disponibles")
            
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"❌ Error conectando a MongoDB: {e}")
            self._connected = False
            raise
        except Exception as e:
            logger.error(f"❌ Error inesperado al conectar: {e}")
            self._connected = False
            raise
    
    async def disconnect(self):
        """Cierra la conexión con MongoDB."""
        if self.client is not None:
            self.client.close()
            logger.info("🔌 Desconectado de MongoDB")
            self._connected = False
    
    async def is_healthy(self) -> bool:
        """Verifica si la conexión está activa."""
        if not self._connected or self.client is None:
            return False
        try:
            await self.client.admin.command('ping')
            return True
        except Exception:
            self._connected = False
            return False
    
    def get_collection(self, collection_name: str):
        """Obtiene una colección de MongoDB."""
        if self.db is None:
            raise RuntimeError("Database not connected")
        return self.db[collection_name]
    
    @property
    def projects_collection(self):
        """Acceso rápido a la colección de proyectos."""
        return self.get_collection(self.config['projects_collection'])
    
    @property
    def states_collection(self):
        """Acceso rápido a la colección de estados."""
        return self.get_collection(self.config['states_collection'])


# Singleton global para reutilización
_mongodb_instance: Optional[MongoDBService] = None


def get_mongodb_service() -> MongoDBService:
    """Obtiene la instancia singleton del servicio MongoDB."""
    global _mongodb_instance
    if _mongodb_instance is None:
        _mongodb_instance = MongoDBService()
    return _mongodb_instance

