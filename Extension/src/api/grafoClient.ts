/**
 * Grafo API Client v2.1
 * Endpoints: /api/v1/nodes/{version}/... and /api/v1/graph/{version}/...
 */
import axios, { AxiosInstance } from 'axios';
import { logger } from '../logger';
import {
    GraphNode,
    SearchResponse,
    CallersResponse,
    CalleesResponse,
    ImplementationsResponse,
    InheritanceResponse,
    VersionsResponse,
    HealthResponse,
    StatsResponse,
    SemanticStatsResponse
} from '../types';

export class GrafoClient {
    private client: AxiosInstance;
    private version: string;
    private baseUrl: string;

    constructor(baseUrl: string, version: string) {
        this.version = version;
        this.baseUrl = baseUrl;

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
        if (data.versions) return `${data.versions.length} versions`;
        if (data.status) return data.status;
        if (data.name) return data.name;
        return '';
    }

    setVersion(version: string): void {
        this.version = version;
        logger.info(`Version changed to: ${version}`);
    }

    getVersion(): string {
        return this.version;
    }

    // Health & Versions
    async checkHealth(): Promise<HealthResponse> {
        logger.separator('Health Check');
        const { data } = await this.client.get<HealthResponse>('/health');
        logger.info(`MongoDB: ${data.mongodb}, Status: ${data.status}`);
        return data;
    }

    async getVersions(): Promise<VersionsResponse> {
        const { data } = await this.client.get<VersionsResponse>('/api/v1/versions');
        return data;
    }

    async getStats(): Promise<StatsResponse> {
        const { data } = await this.client.get<StatsResponse>(`/api/v1/stats/${this.version}`);
        return data;
    }

    async getSemanticStats(): Promise<SemanticStatsResponse> {
        const { data } = await this.client.get<SemanticStatsResponse>(`/api/semantic/stats?version=${this.version}`);
        return data;
    }

    // Node Search
    async searchNodes(query: string, type?: string, project?: string, limit = 20): Promise<GraphNode[]> {
        const params = new URLSearchParams({ q: query, limit: String(limit) });
        if (type) params.append('type', type);
        if (project) params.append('project', project);

        const { data } = await this.client.get<SearchResponse>(
            `/api/v1/nodes/${this.version}/search?${params}`
        );
        return data.results;
    }

    async getNodeById(nodeId: string): Promise<GraphNode | null> {
        try {
            const { data } = await this.client.get<GraphNode>(
                `/api/v1/nodes/${this.version}/id/${encodeURIComponent(nodeId)}`
            );
            return data;
        } catch (e: any) {
            if (e.response?.status === 404) return null;
            throw e;
        }
    }

    // Graph Traversal
    async findCallers(nodeId: string, maxDepth = 2): Promise<CallersResponse> {
        logger.debug(`Finding callers for: ${nodeId}`);
        const { data } = await this.client.get<CallersResponse>(
            `/api/v1/graph/${this.version}/callers/${encodeURIComponent(nodeId)}?max_depth=${maxDepth}&include_indirect=true`
        );
        return data;
    }

    async findCallees(nodeId: string, maxDepth = 2): Promise<CalleesResponse> {
        logger.debug(`Finding callees for: ${nodeId}`);
        const { data } = await this.client.get<CalleesResponse>(
            `/api/v1/graph/${this.version}/callees/${encodeURIComponent(nodeId)}?max_depth=${maxDepth}&include_via_interface=true`
        );
        return data;
    }

    async findImplementations(interfaceId: string): Promise<ImplementationsResponse> {
        logger.debug(`Finding implementations for: ${interfaceId}`);
        const { data } = await this.client.get<ImplementationsResponse>(
            `/api/v1/graph/${this.version}/implementations/${encodeURIComponent(interfaceId)}`
        );
        return data;
    }

    async findInheritance(classId: string, maxDepth = 5): Promise<InheritanceResponse> {
        logger.debug(`Finding inheritance for: ${classId}`);
        const { data } = await this.client.get<InheritanceResponse>(
            `/api/v1/graph/${this.version}/inheritance/${encodeURIComponent(classId)}?max_depth=${maxDepth}`
        );
        return data;
    }

    // Utility: Find class/method by name
    async findByName(name: string, type: 'class' | 'method' | 'interface', className?: string): Promise<GraphNode | null> {
        logger.debug(`Finding ${type}: "${name}"${className ? ` in class ${className}` : ''}`);

        // Check if it's a fully qualified name (contains dots)
        const isFullyQualified = name.includes('.');
        const simpleName = isFullyQualified ? name.split('.').pop() || name : name;

        const results = await this.searchNodes(simpleName, type, undefined, 20);

        // Find exact match
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
                    if (type === 'method' && className) {
                        if (node.containedIn?.includes(className) || node.namespace?.includes(className)) {
                            logger.debug(`Found exact match: ${node.id}`);
                            return node;
                        }
                    } else {
                        logger.debug(`Found exact match: ${node.id}`);
                        return node;
                    }
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

export function initClient(baseUrl: string, version: string): GrafoClient {
    logger.separator('Grafo Client Init');
    client = new GrafoClient(baseUrl, version);
    return client;
}

export function getClient(): GrafoClient | null {
    return client;
}
