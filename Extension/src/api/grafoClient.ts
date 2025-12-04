/**
 * Grafo API Client v2.1
 * Endpoints: /api/v1/nodes/{version}/... and /api/v1/graph/{version}/...
 * Includes caching support for improved performance
 */
import axios, { AxiosInstance } from 'axios';
import { logger } from '../logger';
import { CacheService, CacheType } from '../services/cacheService';
import {
    GraphNode,
    SearchResponse,
    CallersResponse,
    CalleesResponse,
    ImplementationsResponse,
    InheritanceResponse,
    ClassMembersResponse,
    ImpactAnalysisResponse,
    VersionsResponse,
    HealthResponse,
    StatsResponse,
    SemanticStatsResponse
} from '../types';

export class GrafoClient {
    private client: AxiosInstance;
    private version: string;
    private baseUrl: string;
    private cache: CacheService | null = null;

    constructor(baseUrl: string, version: string, cache?: CacheService) {
        this.version = version;
        this.baseUrl = baseUrl;
        this.cache = cache || null;

        if (this.cache) {
            this.cache.setVersion(version);
        }

        logger.info(`Initializing API client: ${baseUrl}`);
        logger.info(`Graph version: ${version}`);

        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });

        // Request interceptor
        this.client.interceptors.request.use((config) => {
            const url = config.url || '';
            logger.apiRequest(config.method?.toUpperCase() || 'GET', url);
            (config as any).startTime = Date.now();
            return config;
        });

        // Response interceptor
        this.client.interceptors.response.use(
            (response) => {
                const duration = Date.now() - ((response.config as any).startTime || Date.now());
                const info = this.extractResultInfo(response.data);
                logger.apiResponse(response.status, duration, info);
                return response;
            },
            (error) => {
                const duration = Date.now() - ((error.config as any)?.startTime || Date.now());
                if (error.response) {
                    logger.apiResponse(error.response.status, duration, error.message);
                } else {
                    logger.apiError(error);
                }
                throw error;
            }
        );
    }

    private extractResultInfo(data: any): string {
        if (!data) return '';
        if (data.results) return `${data.results.length} results`;
        if (data.callers) return `${data.callers.length} callers`;
        if (data.callees) return `${data.callees.length} callees`;
        if (data.implementations) return `${data.implementations.length} implementations`;
        if (data.members) return `${data.members.length} members`;
        if (data.impact) return `impact: ${data.impact.level}`;
        if (data.versions) return `${data.versions.length} versions`;
        if (data.status) return data.status;
        if (data.name) return data.name;
        return '';
    }

    setVersion(version: string): void {
        this.version = version;
        if (this.cache) {
            this.cache.setVersion(version);
        }
        logger.info(`Version changed to: ${version}`);
    }

    setCache(cache: CacheService): void {
        this.cache = cache;
        this.cache.setVersion(this.version);
    }

    /**
     * Helper to get cached data or fetch from API
     */
    private async withCache<T>(
        type: CacheType,
        params: Record<string, any>,
        fetcher: () => Promise<T>
    ): Promise<T> {
        // Check cache first
        if (this.cache) {
            const cached = await this.cache.get<T>(type, params);
            if (cached !== null) {
                return cached;
            }
        }

        // Fetch from API
        const result = await fetcher();

        // Store in cache
        if (this.cache) {
            await this.cache.set(type, params, result);
        }

        return result;
    }

    getVersion(): string {
        return this.version;
    }

    // Health & Versions
    async checkHealth(): Promise<HealthResponse> {
        logger.separator('Health Check');
        const { data } = await this.client.get<HealthResponse>('/health');
        const redisInfo = data.redis ? `, Redis: ${data.redis}` : '';
        logger.info(`MongoDB: ${data.mongodb}${redisInfo}, Status: ${data.status}`);
        return data;
    }

    async getVersions(): Promise<VersionsResponse> {
        return this.withCache('VERSIONS', {}, async () => {
            const { data } = await this.client.get<VersionsResponse>('/api/v1/versions');
            return data;
        });
    }

    async getStats(): Promise<StatsResponse> {
        return this.withCache('STATS', { version: this.version }, async () => {
            const { data } = await this.client.get<StatsResponse>(`/api/v1/stats/${this.version}`);
            return data;
        });
    }

    async getSemanticStats(): Promise<SemanticStatsResponse> {
        return this.withCache('STATS', { version: this.version, type: 'semantic' }, async () => {
            const { data } = await this.client.get<SemanticStatsResponse>(`/api/semantic/stats?version=${this.version}`);
            return data;
        });
    }

    // Node Search
    async searchNodes(query: string, type?: string, project?: string, limit = 20, exactFirst = true): Promise<GraphNode[]> {
        return this.withCache('SEARCH', { query, type: type || '', project: project || '', limit, exactFirst }, async () => {
            const params = new URLSearchParams({ q: query, limit: String(limit) });
            if (type) params.append('type', type);
            if (project) params.append('project', project);
            if (!exactFirst) params.append('exact_first', 'false');

            const { data } = await this.client.get<SearchResponse>(
                `/api/v1/nodes/${this.version}/search?${params}`
            );
            return data.results;
        });
    }

    async getNodeById(nodeId: string): Promise<GraphNode | null> {
        return this.withCache('NODE_BY_ID', { nodeId }, async () => {
            try {
                const { data } = await this.client.get<GraphNode>(
                    `/api/v1/nodes/${this.version}/id/${encodeURIComponent(nodeId)}`
                );
                return data;
            } catch (e: any) {
                if (e.response?.status === 404) return null;
                throw e;
            }
        });
    }

    // Graph Traversal
    async findCallers(nodeId: string, maxDepth = 2): Promise<CallersResponse> {
        logger.debug(`Finding callers for: ${nodeId}`);
        return this.withCache('CALLERS', { nodeId, maxDepth }, async () => {
            const { data } = await this.client.get<CallersResponse>(
                `/api/v1/graph/${this.version}/callers/${encodeURIComponent(nodeId)}?max_depth=${maxDepth}&include_indirect=true`
            );
            return data;
        });
    }

    async findCallees(nodeId: string, maxDepth = 2): Promise<CalleesResponse> {
        logger.debug(`Finding callees for: ${nodeId}`);
        return this.withCache('CALLEES', { nodeId, maxDepth }, async () => {
            const { data } = await this.client.get<CalleesResponse>(
                `/api/v1/graph/${this.version}/callees/${encodeURIComponent(nodeId)}?max_depth=${maxDepth}&include_via_interface=true`
            );
            return data;
        });
    }

    async findImplementations(interfaceId: string): Promise<ImplementationsResponse> {
        logger.debug(`Finding implementations for: ${interfaceId}`);
        return this.withCache('IMPLEMENTATIONS', { interfaceId }, async () => {
            const { data } = await this.client.get<ImplementationsResponse>(
                `/api/v1/graph/${this.version}/implementations/${encodeURIComponent(interfaceId)}`
            );
            return data;
        });
    }

    async findInheritance(classId: string, maxDepth = 5): Promise<InheritanceResponse> {
        logger.debug(`Finding inheritance for: ${classId}`);
        return this.withCache('INHERITANCE', { classId, maxDepth }, async () => {
            const { data } = await this.client.get<InheritanceResponse>(
                `/api/v1/graph/${this.version}/inheritance/${encodeURIComponent(classId)}?max_depth=${maxDepth}`
            );
            return data;
        });
    }

    async getClassMembers(classId: string, memberTypes?: string[]): Promise<ClassMembersResponse> {
        logger.debug(`Getting members for class: ${classId}`);
        const typesParam = memberTypes ? memberTypes.join(',') : '';
        return this.withCache('MEMBERS', { classId, types: typesParam }, async () => {
            const params = memberTypes ? `?types=${encodeURIComponent(typesParam)}` : '';
            const { data } = await this.client.get<ClassMembersResponse>(
                `/api/v1/graph/${this.version}/members/${encodeURIComponent(classId)}${params}`
            );
            return data;
        });
    }

    async analyzeImpact(nodeId: string): Promise<ImpactAnalysisResponse> {
        logger.debug(`Analyzing impact for: ${nodeId}`);
        return this.withCache('IMPACT', { nodeId }, async () => {
            const { data } = await this.client.post<ImpactAnalysisResponse>(
                `/api/graph/impact`,
                { nodeId, version: this.version }
            );
            return data;
        });
    }

    // Get nodes by project
    async getNodesByProject(project: string, type?: string, limit = 100): Promise<GraphNode[]> {
        logger.debug(`Getting nodes for project: ${project}`);
        return this.withCache('NODES_BY_PROJECT', { project, type: type || '', limit }, async () => {
            const params = new URLSearchParams({ limit: String(limit) });
            if (type) params.append('type', type);

            const { data } = await this.client.get<{ nodes: GraphNode[] }>(
                `/api/v1/nodes/${this.version}/project/${encodeURIComponent(project)}?${params}`
            );
            return data.nodes;
        });
    }

    // Get statistics (includes projects list)
    async getVersionStats(): Promise<{ totalNodes: number; totalProjects: number; projects: string[]; nodesByType: Record<string, number>; nodesByLayer: Record<string, number> }> {
        logger.debug('Getting version statistics');
        return this.withCache('STATS', { version: this.version, type: 'version' }, async () => {
            const { data } = await this.client.get(
                `/api/v1/stats/${this.version}`
            );
            return data;
        });
    }

    // Get projects grouped by layer
    async getProjectsByLayer(): Promise<{ version: string; layers: Record<string, { projects: Array<{ name: string; nodeCount: number }>; totalNodes: number }> }> {
        logger.debug('Getting projects by layer');
        return this.withCache('LAYERS', { version: this.version }, async () => {
            const { data } = await this.client.get(
                `/api/v1/layers/${this.version}`
            );
            return data;
        });
    }

    // Get solutions (nodes with kind: 'solution' and layer: 'root')
    async getSolutions(): Promise<GraphNode[]> {
        logger.debug('Getting solutions');
        return this.withCache('LAYERS', { version: this.version, type: 'solutions' }, async () => {
            // Try searching for all solutions using partial search (exact_first=false)
            try {
                const { data } = await this.client.get<SearchResponse>(
                    `/api/v1/nodes/${this.version}/search?q=.&limit=50&type=solution&exact_first=false`
                );
                if (data.results && data.results.length > 0) {
                    return data.results.filter(n => (n.layer as string) === 'root' || !n.layer);
                }
            } catch (e) {
                logger.debug('Solution search failed, trying layers endpoint');
            }

            // Fallback: Get solutions from the 'root' layer in the layers endpoint
            const layersData = await this.getProjectsByLayer();
            if (layersData.layers['root'] && layersData.layers['root'].projects) {
                // These are the solutions - fetch full node data for each
                const solutions: GraphNode[] = [];
                for (const proj of layersData.layers['root'].projects) {
                    if (proj.name) {
                        // Search for the solution node by name (use partial search)
                        const results = await this.searchNodes(proj.name, 'solution', undefined, 1, false);
                        if (results.length > 0) {
                            solutions.push(results[0]);
                        }
                    }
                }
                return solutions;
            }

            return [];
        });
    }

    // Get cross-solution dependencies
    async getSolutionDependencies(): Promise<{ from: string; to: string; relationshipCount: number }[]> {
        logger.debug('Getting solution dependencies');
        return this.withCache('LAYERS', { version: this.version, type: 'solution-deps' }, async () => {
            try {
                const { data } = await this.client.get<{
                    version: string;
                    dependencies: Array<{ from: string; to: string; relationshipCount: number; relationships: any[] }>;
                }>(`/api/v1/graph/${this.version}/solution-dependencies`);
                return data.dependencies.map(d => ({
                    from: d.from,
                    to: d.to,
                    relationshipCount: d.relationshipCount
                }));
            } catch (e) {
                logger.debug('Solution dependencies not available');
                return [];
            }
        });
    }

    // Utility: Find class/method by name
    // Options: className (for methods), namespace (for filtering by namespace)
    async findByName(name: string, type: 'class' | 'method' | 'interface', options?: { className?: string; namespace?: string }): Promise<GraphNode | null> {
        const className = options?.className;
        const namespace = options?.namespace;
        logger.info(`[findByName] Looking for ${type}: "${name}"${className ? ` in class "${className}"` : ''}${namespace ? ` in namespace "${namespace}"` : ''}`);

        // Check if it's a fully qualified name (contains dots)
        const isFullyQualified = name.includes('.');
        const simpleName = isFullyQualified ? name.split('.').pop() || name : name;

        const results = await this.searchNodes(simpleName, type, undefined, 30);
        logger.info(`[findByName] Got ${results.length} results`);

        // For methods with className, do a two-pass search:
        // Pass 1: Exact match on className (e.g., GeolocationExtended.UpdatePointOfInterest)
        // Pass 2: Match on base class (e.g., Geolocation.UpdatePointOfInterest)
        if (type === 'method' && className) {
            const exactPattern = `.${className}.${name}`;
            const baseClassName = className.replace(/Extended$/, '');
            const basePattern = `.${baseClassName}.${name}`;

            // Pass 1: Find exact match in current class (with namespace if provided)
            for (const node of results) {
                if (node.name === name) {
                    const fullName = node.fullName || '';
                    if (fullName.endsWith(exactPattern)) {
                        // If namespace is provided, verify it matches
                        if (namespace && node.namespace && node.namespace !== namespace) {
                            continue;
                        }
                        logger.info(`[findByName] ✓ Found in current class: ${node.id} (${fullName})`);
                        return node;
                    }
                }
            }

            // Pass 2: If className ends with Extended and no exact match, try base class
            if (className.endsWith('Extended')) {
                for (const node of results) {
                    if (node.name === name) {
                        const fullName = node.fullName || '';
                        if (fullName.endsWith(basePattern)) {
                            logger.info(`[findByName] ✓ Found in base class: ${node.id} (${fullName})`);
                            return node;
                        }
                    }
                }
            }

            // Pass 3: Any non-interface method with this name
            const nonInterfaceMethod = results.find(r => {
                const fn = r.fullName || '';
                return r.name === name && !fn.match(/\.I[A-Z][a-zA-Z]+\.[^.]+$/);
            });
            if (nonInterfaceMethod) {
                logger.debug(`Using non-interface method: ${nonInterfaceMethod.id}`);
                return nonInterfaceMethod;
            }

            return results.find(r => r.name === name) || null;
        }

        // Find exact match for non-method types (class, interface)
        // Pass 1: If namespace provided, find exact namespace match first
        if (namespace) {
            for (const node of results) {
                if (node.name === name && node.namespace === namespace) {
                    logger.info(`[findByName] ✓ Found exact match with namespace: ${node.id} (${node.namespace}.${node.name})`);
                    return node;
                }
            }
        }

        // Pass 2: Match by fully qualified name or simple name
        for (const node of results) {
            if (isFullyQualified) {
                // Match against fullName or namespace + name
                const nodeFullName = node.fullName || `${node.namespace}.${node.name}`;
                if (nodeFullName === name || nodeFullName.endsWith(name)) {
                    logger.debug(`Found exact match (full name): ${node.id}`);
                    return node;
                }
            } else {
                if (node.name === name) {
                    logger.info(`[findByName] ✓ Found exact match: ${node.id}`);
                    return node;
                }
            }
        }

        if (results[0]) {
            logger.debug(`Using first result: ${results[0].id}`);
        } else {
            logger.debug(`No results found for ${type}: "${name}"`);
        }

        return results[0] || null;
    }
}

// Singleton
let client: GrafoClient | null = null;

export function initClient(baseUrl: string, version: string, cache?: CacheService): GrafoClient {
    logger.separator('Grafo Client Init');
    client = new GrafoClient(baseUrl, version, cache);
    return client;
}

export function getClient(): GrafoClient | null {
    return client;
}

export function setClientCache(cache: CacheService): void {
    if (client) {
        client.setCache(cache);
    }
}
