/**
 * Cache Service for Grafo Extension
 * Uses VS Code globalState for persistent storage across sessions
 * and in-memory cache for fast access within a session.
 */
import * as vscode from 'vscode';
import { logger } from '../logger';

export interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    oldestEntry: number | null;
    newestEntry: number | null;
}

// Cache TTL configuration (in milliseconds)
export const CacheTTL = {
    // Long-lived data (rarely changes)
    VERSIONS: 24 * 60 * 60 * 1000,      // 24 hours
    STATS: 60 * 60 * 1000,               // 1 hour
    LAYERS: 60 * 60 * 1000,              // 1 hour

    // Medium-lived data
    NODE_BY_ID: 30 * 60 * 1000,          // 30 minutes
    SEARCH: 15 * 60 * 1000,              // 15 minutes
    NODES_BY_PROJECT: 30 * 60 * 1000,    // 30 minutes
    MEMBERS: 30 * 60 * 1000,             // 30 minutes (class members)

    // Short-lived data (may change more frequently)
    CALLERS: 10 * 60 * 1000,             // 10 minutes
    CALLEES: 10 * 60 * 1000,             // 10 minutes
    IMPLEMENTATIONS: 15 * 60 * 1000,     // 15 minutes
    INHERITANCE: 15 * 60 * 1000,         // 15 minutes
    IMPACT: 10 * 60 * 1000,              // 10 minutes

    // Default
    DEFAULT: 15 * 60 * 1000              // 15 minutes
};

export type CacheType = keyof typeof CacheTTL;

const CACHE_PREFIX = 'grafo.cache.';
const CACHE_STATS_KEY = 'grafo.cache.stats';
const CACHE_KEYS_KEY = 'grafo.cache.keys';
const CACHE_GENERATION_KEY = 'grafo.cache.generation';

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
    generation: number;  // Cache generation for invalidation
}

export class CacheService {
    private memoryCache: Map<string, CacheEntry<any>> = new Map();
    private globalState: vscode.Memento;
    private cachedKeys: Set<string> = new Set();
    private cacheGeneration: number = 0;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        size: 0,
        oldestEntry: null,
        newestEntry: null
    };
    private version: string = '';
    private _enabled: boolean = true;

    constructor(globalState: vscode.Memento) {
        this.globalState = globalState;
        this.loadStats();
        this.loadCachedKeys();
        this.loadCacheGeneration();
        // Load enabled state from config
        const config = vscode.workspace.getConfiguration('grafo');
        this._enabled = config.get<boolean>('cacheEnabled', true);
        logger.info(`CacheService initialized (generation: ${this.cacheGeneration}, enabled: ${this._enabled})`);
    }

    /**
     * Check if cache is enabled
     */
    get isEnabled(): boolean {
        return this._enabled;
    }

    /**
     * Enable or disable cache
     */
    async setEnabled(enabled: boolean): Promise<void> {
        this._enabled = enabled;
        const config = vscode.workspace.getConfiguration('grafo');
        await config.update('cacheEnabled', enabled, vscode.ConfigurationTarget.Global);
        if (!enabled) {
            // Clear memory cache when disabling
            this.memoryCache.clear();
        }
        logger.info(`Cache ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Toggle cache enabled state
     */
    async toggle(): Promise<boolean> {
        await this.setEnabled(!this._enabled);
        return this._enabled;
    }

    /**
     * Load tracked cache keys from persistent storage
     */
    private loadCachedKeys(): void {
        const keys = this.globalState.get<string[]>(CACHE_KEYS_KEY, []);
        this.cachedKeys = new Set(keys);
    }

    /**
     * Save tracked cache keys to persistent storage
     */
    private async saveCachedKeys(): Promise<void> {
        await this.globalState.update(CACHE_KEYS_KEY, Array.from(this.cachedKeys));
    }

    /**
     * Load cache generation from persistent storage
     */
    private loadCacheGeneration(): void {
        this.cacheGeneration = this.globalState.get<number>(CACHE_GENERATION_KEY, 0);
    }

    /**
     * Increment and save cache generation (invalidates all old entries)
     */
    private async incrementGeneration(): Promise<void> {
        this.cacheGeneration++;
        await this.globalState.update(CACHE_GENERATION_KEY, this.cacheGeneration);
    }

    /**
     * Set the current graph version (affects cache keys)
     */
    setVersion(version: string): void {
        if (this.version !== version) {
            this.version = version;
            // Clear memory cache when version changes
            this.memoryCache.clear();
            logger.info(`Cache version set to: ${version}`);
        }
    }

    /**
     * Generate a unique cache key
     */
    private generateKey(type: CacheType, params: Record<string, any>): string {
        const sortedParams = Object.keys(params)
            .sort()
            .map(k => `${k}=${params[k]}`)
            .join('&');
        return `${CACHE_PREFIX}${this.version}:${type}:${sortedParams}`;
    }

    /**
     * Get data from cache
     */
    async get<T>(type: CacheType, params: Record<string, any>): Promise<T | null> {
        // Skip cache if disabled
        if (!this._enabled) {
            logger.debug(`Cache SKIP (disabled): ${type}`);
            return null;
        }

        const key = this.generateKey(type, params);
        const now = Date.now();

        // Check memory cache first
        const memEntry = this.memoryCache.get(key);
        if (memEntry && memEntry.expiresAt > now && memEntry.generation === this.cacheGeneration) {
            this.stats.hits++;
            logger.debug(`Cache HIT (memory): ${type}`);
            return memEntry.data as T;
        }

        // Check persistent cache
        const stored = this.globalState.get<CacheEntry<T>>(key);
        if (stored && stored.expiresAt > now && stored.generation === this.cacheGeneration) {
            // Restore to memory cache
            this.memoryCache.set(key, stored);
            this.stats.hits++;
            logger.debug(`Cache HIT (storage): ${type}`);
            return stored.data;
        }

        // Cache miss - remove expired/invalid entry if exists
        if (stored) {
            await this.globalState.update(key, undefined);
        }
        if (memEntry) {
            this.memoryCache.delete(key);
        }

        this.stats.misses++;
        logger.debug(`Cache MISS: ${type}`);
        return null;
    }

    /**
     * Set data in cache
     */
    async set<T>(type: CacheType, params: Record<string, any>, data: T, customTtl?: number): Promise<void> {
        // Skip cache if disabled
        if (!this._enabled) {
            return;
        }

        const key = this.generateKey(type, params);
        const ttl = customTtl || CacheTTL[type] || CacheTTL.DEFAULT;
        const now = Date.now();

        const entry: CacheEntry<T> = {
            data,
            timestamp: now,
            expiresAt: now + ttl,
            generation: this.cacheGeneration
        };

        // Store in memory
        this.memoryCache.set(key, entry);

        // Store in persistent storage
        await this.globalState.update(key, entry);

        // Track the key for later cleanup
        this.cachedKeys.add(key);
        await this.saveCachedKeys();

        // Update stats
        this.stats.size++;
        if (!this.stats.oldestEntry || now < this.stats.oldestEntry) {
            this.stats.oldestEntry = now;
        }
        this.stats.newestEntry = now;

        logger.debug(`Cache SET: ${type} (TTL: ${Math.round(ttl / 1000)}s)`);
    }

    /**
     * Invalidate specific cache entry
     */
    async invalidate(type: CacheType, params: Record<string, any>): Promise<void> {
        const key = this.generateKey(type, params);
        this.memoryCache.delete(key);
        await this.globalState.update(key, undefined);
        this.cachedKeys.delete(key);
        await this.saveCachedKeys();
        logger.debug(`Cache INVALIDATE: ${type}`);
    }

    /**
     * Invalidate all cache entries for a specific type
     */
    async invalidateType(type: CacheType): Promise<void> {
        const prefix = `${CACHE_PREFIX}${this.version}:${type}:`;

        // Clear from memory
        for (const key of this.memoryCache.keys()) {
            if (key.startsWith(prefix)) {
                this.memoryCache.delete(key);
            }
        }

        // Note: globalState doesn't support iteration, so we can only
        // clear specific keys we know about. For full cleanup, use clearAll.
        logger.info(`Cache type invalidated: ${type}`);
    }

    /**
     * Clear all cache entries
     */
    async clearAll(): Promise<void> {
        // Clear memory cache
        this.memoryCache.clear();

        // Increment generation - this invalidates ALL old cache entries
        // without needing to iterate over them
        await this.incrementGeneration();

        // Clear tracked keys (optional cleanup)
        this.cachedKeys.clear();
        await this.saveCachedKeys();

        // Reset stats
        this.stats = {
            hits: 0,
            misses: 0,
            size: 0,
            oldestEntry: null,
            newestEntry: null
        };

        await this.saveStats();
        logger.info(`Cache cleared (generation: ${this.cacheGeneration})`);
    }

    /**
     * Clear all cache entries for current version
     */
    async clearVersion(): Promise<void> {
        const prefix = `${CACHE_PREFIX}${this.version}:`;

        // Clear from memory
        for (const key of this.memoryCache.keys()) {
            if (key.startsWith(prefix)) {
                this.memoryCache.delete(key);
            }
        }

        logger.info(`Cache cleared for version: ${this.version}`);
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats & { hitRate: string } {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%';
        return {
            ...this.stats,
            size: this.memoryCache.size,
            hitRate
        };
    }

    /**
     * Log cache statistics
     */
    logStats(): void {
        const stats = this.getStats();
        logger.info(`Cache Stats: ${stats.hits} hits, ${stats.misses} misses (${stats.hitRate}), ${stats.size} entries`);
    }

    /**
     * Load stats from persistent storage
     */
    private loadStats(): void {
        const stored = this.globalState.get<CacheStats>(CACHE_STATS_KEY);
        if (stored) {
            this.stats = stored;
        }
    }

    /**
     * Save stats to persistent storage
     */
    private async saveStats(): Promise<void> {
        await this.globalState.update(CACHE_STATS_KEY, this.stats);
    }

    /**
     * Cleanup expired entries from memory cache
     */
    cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.expiresAt < now) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`Cache cleanup: ${cleaned} expired entries removed`);
        }
    }
}

// Singleton instance
let cacheService: CacheService | null = null;

export function initCacheService(globalState: vscode.Memento): CacheService {
    cacheService = new CacheService(globalState);
    return cacheService;
}

export function getCacheService(): CacheService | null {
    return cacheService;
}
