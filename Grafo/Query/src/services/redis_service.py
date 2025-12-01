"""
Redis Cache Service for Grafo Query API.
Provides persistent caching for API responses with configurable TTL.
"""
import json
import hashlib
import logging
from typing import Optional, Any, Callable
from functools import wraps

import redis.asyncio as redis
from redis.asyncio.connection import ConnectionPool

from ..config import get_redis_config

logger = logging.getLogger(__name__)


class RedisService:
    """
    Async Redis service for caching API responses.
    Uses redis-py async client for non-blocking operations.
    """

    def __init__(self):
        self.config = get_redis_config()
        self.pool: Optional[ConnectionPool] = None
        self.client: Optional[redis.Redis] = None
        self._connected = False
        self._enabled = self.config.get('enabled', True)
        self._default_ttl = self.config.get('ttl', 86400)  # 24 hours default

    @property
    def is_connected(self) -> bool:
        return self._connected and self._enabled

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    @property
    def default_ttl(self) -> int:
        return self._default_ttl

    async def connect(self) -> bool:
        """
        Connect to Redis server.
        Returns True if connected successfully, False otherwise.
        """
        if not self._enabled:
            logger.info("Redis cache is disabled")
            return False

        try:
            self.pool = ConnectionPool(
                host=self.config['host'],
                port=self.config['port'],
                db=self.config['db'],
                password=self.config['password'],
                decode_responses=True,
                max_connections=10
            )

            self.client = redis.Redis(connection_pool=self.pool)

            # Test connection
            await self.client.ping()

            self._connected = True
            logger.info(f"Connected to Redis at {self.config['host']}:{self.config['port']}")
            return True

        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}. Cache will be disabled.")
            self._connected = False
            return False

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.client:
            await self.client.close()
        if self.pool:
            await self.pool.disconnect()
        self._connected = False
        logger.info("Disconnected from Redis")

    def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
        """
        Generate a unique cache key based on function arguments.
        Uses MD5 hash to create a consistent key from parameters.

        IMPORTANT: Version parameter is critical for cache isolation.
        Different versions must generate different cache keys.
        """
        # Create a string representation of all arguments
        key_parts = [prefix]

        # Add positional arguments
        for arg in args:
            if arg is not None:
                key_parts.append(str(arg))

        # Add keyword arguments (sorted for consistency)
        # Version is always included even if it's in args
        for key in sorted(kwargs.keys()):
            value = kwargs[key]
            if value is not None:
                key_parts.append(f"{key}:{value}")

        # Create hash of the key parts
        key_string = "|".join(key_parts)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()

        # Include version in key name for easier debugging
        version = kwargs.get('version') or (args[0] if args else None)
        if version and isinstance(version, str) and '.' in version:
            return f"grafo:{prefix}:v{version}:{key_hash[:12]}"

        return f"grafo:{prefix}:{key_hash}"

    async def get(self, key: str) -> Optional[Any]:
        """
        Get a value from cache.
        Returns None if key doesn't exist or cache is disabled.
        """
        if not self.is_connected:
            return None

        try:
            value = await self.client.get(key)
            if value:
                logger.debug(f"Cache HIT: {key}")
                return json.loads(value)
            logger.debug(f"Cache MISS: {key}")
            return None
        except Exception as e:
            logger.warning(f"Redis get error: {e}")
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set a value in cache with optional TTL.
        Uses default TTL if not specified.
        """
        if not self.is_connected:
            return False

        try:
            ttl = ttl or self._default_ttl
            serialized = json.dumps(value, default=str)
            await self.client.setex(key, ttl, serialized)
            logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.warning(f"Redis set error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        if not self.is_connected:
            return False

        try:
            await self.client.delete(key)
            logger.debug(f"Cache DELETE: {key}")
            return True
        except Exception as e:
            logger.warning(f"Redis delete error: {e}")
            return False

    async def clear_prefix(self, prefix: str) -> int:
        """
        Clear all keys matching a prefix pattern.
        Supports glob patterns like "*:v7.10.2:*" for version-specific clearing.
        Returns the number of keys deleted.
        """
        if not self.is_connected:
            return 0

        try:
            # If pattern already contains wildcards, use it directly
            if '*' in prefix:
                pattern = f"grafo:{prefix}"
            else:
                pattern = f"grafo:{prefix}:*"

            keys = []
            async for key in self.client.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                deleted = await self.client.delete(*keys)
                logger.info(f"Cleared {deleted} keys matching '{pattern}'")
                return deleted
            return 0
        except Exception as e:
            logger.warning(f"Redis clear_prefix error: {e}")
            return 0

    async def clear_all(self) -> bool:
        """Clear all Grafo cache keys."""
        if not self.is_connected:
            return False

        try:
            await self.clear_prefix("*")
            logger.info("Cleared all Grafo cache keys")
            return True
        except Exception as e:
            logger.warning(f"Redis clear_all error: {e}")
            return False

    async def get_stats(self) -> dict:
        """Get cache statistics."""
        if not self.is_connected:
            return {"enabled": False, "connected": False}

        try:
            info = await self.client.info("stats")
            memory = await self.client.info("memory")

            # Count Grafo keys
            grafo_keys = 0
            async for _ in self.client.scan_iter(match="grafo:*"):
                grafo_keys += 1

            return {
                "enabled": True,
                "connected": True,
                "host": f"{self.config['host']}:{self.config['port']}",
                "ttl_seconds": self._default_ttl,
                "ttl_hours": round(self._default_ttl / 3600, 1),
                "grafo_keys": grafo_keys,
                "total_keys": await self.client.dbsize(),
                "used_memory": memory.get("used_memory_human", "unknown"),
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0)
            }
        except Exception as e:
            logger.warning(f"Redis get_stats error: {e}")
            return {"enabled": True, "connected": True, "error": str(e)}


# Singleton instance
_redis_instance: Optional[RedisService] = None


def get_redis_service() -> RedisService:
    """Get or create singleton Redis service instance."""
    global _redis_instance
    if _redis_instance is None:
        _redis_instance = RedisService()
    return _redis_instance


def cached(prefix: str, ttl: Optional[int] = None, skip_self: bool = True):
    """
    Decorator to cache async function results.

    Usage:
        @cached("search_nodes")
        async def search_nodes(query: str, limit: int = 10):
            ...

        # For class methods
        @cached("search_nodes", skip_self=True)
        async def search_nodes(self, query: str, limit: int = 10):
            ...

    Args:
        prefix: Cache key prefix (e.g., "search_nodes", "get_project")
        ttl: Optional TTL override in seconds
        skip_self: If True, skip first argument (self) for class methods
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            redis_service = get_redis_service()

            # Skip cache if not connected
            if not redis_service.is_connected:
                return await func(*args, **kwargs)

            # Generate cache key (skip self if it's a method)
            cache_args = args[1:] if skip_self and args else args
            cache_key = redis_service._generate_cache_key(prefix, *cache_args, **kwargs)

            # Try to get from cache
            cached_result = await redis_service.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function and cache result
            result = await func(*args, **kwargs)

            # Cache the result (convert Pydantic models to dict if needed)
            if result is not None:
                cache_value = result
                if hasattr(result, 'model_dump'):
                    cache_value = result.model_dump()
                elif hasattr(result, 'dict'):
                    cache_value = result.dict()
                elif isinstance(result, list):
                    cache_value = [
                        item.model_dump() if hasattr(item, 'model_dump')
                        else item.dict() if hasattr(item, 'dict')
                        else item
                        for item in result
                    ]

                await redis_service.set(cache_key, cache_value, ttl)

            return result

        return wrapper
    return decorator
