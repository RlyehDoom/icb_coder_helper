import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '../logger';
import {
    GraphNode,
    CodeContextRequest,
    CodeContextResponse,
    SearchNodesRequest,
    RelatedNodesResponse,
    ClassHierarchyResponse,
    InterfaceImplementationsResponse,
    HealthCheckResponse,
    GraphStatisticsResponse,
    ProjectSummary,
    SemanticStatsResponse,
    RelationshipsResponse,
    RelationshipType,
} from '../types';

export interface GrafoClientConfig {
    baseUrl: string;
    version?: string;
    timeout?: number;
}

interface RequestMetadata {
    startTime: number;
}

export class GrafoClient {
    private client: AxiosInstance;
    private version: string;
    private baseUrl: string;

    constructor(config: GrafoClientConfig) {
        this.version = config.version || '';
        this.baseUrl = config.baseUrl;

        logger.info(`Initializing Grafo API client: ${config.baseUrl}`);
        if (this.version) {
            logger.info(`Graph version: ${this.version}`);
        }

        this.client = axios.create({
            baseURL: config.baseUrl,
            timeout: config.timeout || 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Request interceptor for logging
        this.client.interceptors.request.use(
            (config: InternalAxiosRequestConfig) => {
                const method = config.method?.toUpperCase() || 'GET';
                const url = config.url || '';
                logger.debug(`→ ${method} ${url}`);
                if (config.data) {
                    logger.debug(`  Request body: ${JSON.stringify(config.data)}`);
                }
                // Store start time for duration calculation
                (config as InternalAxiosRequestConfig & { metadata: RequestMetadata }).metadata = { startTime: Date.now() };
                return config;
            },
            (error) => {
                logger.error('Request setup error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor for logging
        this.client.interceptors.response.use(
            (response: AxiosResponse) => {
                const config = response.config as InternalAxiosRequestConfig & { metadata?: RequestMetadata };
                const duration = config.metadata ? Date.now() - config.metadata.startTime : 0;
                const method = config.method?.toUpperCase() || 'GET';
                const url = config.url || '';

                logger.api(method, url, response.status, duration);

                if (response.data) {
                    const dataStr = JSON.stringify(response.data);
                    const truncated = dataStr.length > 500 ? dataStr.substring(0, 500) + '...' : dataStr;
                    logger.debug(`  Response: ${truncated}`);
                }

                return response;
            },
            (error: AxiosError) => {
                const config = error.config as InternalAxiosRequestConfig & { metadata?: RequestMetadata } | undefined;
                const duration = config?.metadata ? Date.now() - config.metadata.startTime : 0;
                const method = config?.method?.toUpperCase() || 'GET';
                const url = config?.url || '';
                const status = error.response?.status || 0;

                logger.api(method, url, status, duration);
                logger.error(`API Error: ${error.message}`, error.response?.data);

                return Promise.reject(error);
            }
        );
    }

    /**
     * Update the graph version for queries
     */
    setVersion(version: string): void {
        this.version = version;
        logger.info(`Graph version updated: ${version || '(all versions)'}`);
    }

    /**
     * Get current version
     */
    getVersion(): string {
        return this.version;
    }

    /**
     * Get base URL
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }

    /**
     * Check API health status
     */
    async checkHealth(): Promise<HealthCheckResponse> {
        logger.info('Checking API health...');
        const response = await this.client.get<HealthCheckResponse>('/health');
        logger.info(`Health check result: ${response.data.status} (MongoDB: ${response.data.mongodb})`);
        return response.data;
    }

    /**
     * Get code context for a specific element
     * This is the main API for getting detailed information about methods, classes, etc.
     */
    async getCodeContext(request: CodeContextRequest): Promise<CodeContextResponse> {
        logger.info(`Getting code context for: ${request.methodName || request.className || 'unknown'}`);
        const payload = {
            ...request,
            version: request.version || this.version,
        };
        const response = await this.client.post<CodeContextResponse>('/api/context/code', payload);

        if (response.data.found) {
            logger.info(`Found element: ${response.data.mainElement?.Name} (${response.data.mainElement?.Type})`);
            logger.info(`Related elements: ${response.data.relatedElements?.length || 0}, Edges: ${response.data.edges?.length || 0}`);
        } else {
            logger.warn(`Element not found: ${request.methodName || request.className}`);
        }

        return response.data;
    }

    /**
     * Search for nodes by query string
     */
    async searchNodes(request: SearchNodesRequest): Promise<GraphNode[]> {
        logger.info(`Searching nodes: query="${request.query}", type=${request.nodeType || 'any'}`);
        const payload = {
            ...request,
            version: request.version || this.version,
        };
        const response = await this.client.post<any[]>('/api/nodes/search', payload);
        logger.info(`Search returned ${response.data.length} results`);

        // Normalize response to handle both uppercase and lowercase property names
        return response.data.map(node => this.normalizeNode(node));
    }

    /**
     * Normalize a node object to use uppercase property names
     * API may return lowercase (id, name) or uppercase (Id, Name)
     */
    private normalizeNode(node: any): GraphNode {
        return {
            Id: node.Id || node.id || node._id || '',
            Name: node.Name || node.name || '',
            FullName: node.FullName || node.fullName || node.Name || node.name || '',
            Type: node.Type || node.type || 'Class',
            Project: node.Project || node.project || node.projectName || '',
            Namespace: node.Namespace || node.namespace || '',
            Accessibility: node.Accessibility || node.accessibility || 'Public',
            IsAbstract: node.IsAbstract || node.isAbstract || false,
            IsStatic: node.IsStatic || node.isStatic || false,
            IsSealed: node.IsSealed || node.isSealed || false,
            Location: node.Location || node.location ? {
                AbsolutePath: (node.Location || node.location)?.AbsolutePath || (node.Location || node.location)?.absolutePath,
                RelativePath: (node.Location || node.location)?.RelativePath || (node.Location || node.location)?.relativePath,
                Line: (node.Location || node.location)?.Line || (node.Location || node.location)?.line,
                Column: (node.Location || node.location)?.Column || (node.Location || node.location)?.column,
            } : undefined,
            Attributes: node.Attributes || node.attributes,
            ContainingType: node.ContainingType || node.containingType,
        };
    }

    /**
     * Get related nodes for a given node ID
     */
    async getRelatedNodes(
        nodeId: string,
        relationshipType?: RelationshipType,
        direction: 'incoming' | 'outgoing' | 'both' = 'both',
        maxDepth: number = 1
    ): Promise<RelatedNodesResponse> {
        logger.info(`Getting related nodes for: ${nodeId}`);
        const params = new URLSearchParams();
        if (relationshipType) {
            params.append('relationshipType', relationshipType);
        }
        params.append('direction', direction);
        params.append('maxDepth', maxDepth.toString());
        if (this.version) {
            params.append('version', this.version);
        }

        const response = await this.client.get<RelatedNodesResponse>(
            `/api/nodes/${encodeURIComponent(nodeId)}/related?${params.toString()}`
        );
        logger.info(`Found ${response.data.relatedNodes?.length || 0} related nodes`);
        return response.data;
    }

    /**
     * Get class inheritance hierarchy
     */
    async getClassHierarchy(classId: string, maxDepth: number = 5): Promise<ClassHierarchyResponse> {
        logger.info(`Getting class hierarchy for: ${classId}`);
        const params = new URLSearchParams();
        params.append('maxDepth', maxDepth.toString());
        if (this.version) {
            params.append('version', this.version);
        }

        const response = await this.client.get<ClassHierarchyResponse>(
            `/api/classes/${encodeURIComponent(classId)}/hierarchy?${params.toString()}`
        );

        if (response.data.found) {
            logger.info(`Hierarchy: ${response.data.ancestors?.length || 0} ancestors, ${response.data.descendants?.length || 0} descendants`);
        }

        return response.data;
    }

    /**
     * Get implementations of an interface
     */
    async getInterfaceImplementations(interfaceId: string): Promise<InterfaceImplementationsResponse> {
        logger.info(`Getting implementations for interface: ${interfaceId}`);
        const params = new URLSearchParams();
        if (this.version) {
            params.append('version', this.version);
        }

        const response = await this.client.get<InterfaceImplementationsResponse>(
            `/api/interfaces/${encodeURIComponent(interfaceId)}/implementations?${params.toString()}`
        );

        logger.info(`Found ${response.data.implementationCount || 0} implementations`);
        return response.data;
    }

    /**
     * Get graph statistics
     */
    async getStatistics(): Promise<GraphStatisticsResponse> {
        logger.info('Getting graph statistics...');
        const params = new URLSearchParams();
        if (this.version) {
            params.append('version', this.version);
        }

        const response = await this.client.get<GraphStatisticsResponse>(
            `/api/context/statistics?${params.toString()}`
        );

        logger.info(`Statistics: ${response.data.totalProjects} projects, ${response.data.totalNodes} nodes, ${response.data.totalEdges} edges`);
        return response.data;
    }

    /**
     * Get semantic statistics (relationship counts)
     */
    async getSemanticStats(): Promise<SemanticStatsResponse> {
        logger.info('Getting semantic statistics...');
        const response = await this.client.get<SemanticStatsResponse>('/api/semantic/stats');
        return response.data;
    }

    /**
     * Get relationships of a specific type
     */
    async getRelationships(
        relationshipType: RelationshipType,
        projectId?: string,
        limit: number = 100
    ): Promise<RelationshipsResponse> {
        logger.info(`Getting ${relationshipType} relationships...`);
        const params = new URLSearchParams();
        params.append('type', relationshipType);
        if (projectId) {
            params.append('projectId', projectId);
        }
        params.append('limit', limit.toString());
        if (this.version) {
            params.append('version', this.version);
        }

        const response = await this.client.get<RelationshipsResponse>(
            `/api/relationships?${params.toString()}`
        );
        return response.data;
    }

    /**
     * Search for projects
     */
    async searchProjects(query: string, limit: number = 20): Promise<ProjectSummary[]> {
        logger.info(`Searching projects: "${query}"`);
        const payload = {
            query,
            limit,
            version: this.version || undefined,
        };
        const response = await this.client.post<ProjectSummary[]>('/api/projects/search', payload);
        logger.info(`Found ${response.data.length} projects`);
        return response.data;
    }

    /**
     * List all projects
     */
    async listProjects(): Promise<ProjectSummary[]> {
        logger.info('Listing all projects...');
        const params = new URLSearchParams();
        if (this.version) {
            params.append('version', this.version);
        }

        const response = await this.client.get<ProjectSummary[]>(
            `/api/projects?${params.toString()}`
        );
        logger.info(`Found ${response.data.length} projects`);
        return response.data;
    }

    /**
     * Get callers of a method
     */
    async getCallers(methodName: string, className?: string, namespace?: string): Promise<CodeContextResponse> {
        logger.info(`Getting callers for method: ${methodName}`);
        return this.getCodeContext({
            methodName,
            className,
            namespace,
            includeRelated: true,
            maxRelated: 50,
        });
    }

    /**
     * Get methods called by a method
     */
    async getCallees(methodName: string, className?: string, namespace?: string): Promise<CodeContextResponse> {
        logger.info(`Getting callees for method: ${methodName}`);
        return this.getCodeContext({
            methodName,
            className,
            namespace,
            includeRelated: true,
            maxRelated: 50,
        });
    }

    /**
     * Check if API is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const health = await this.checkHealth();
            return health.status === 'healthy';
        } catch {
            return false;
        }
    }
}

// Singleton instance for the extension
let clientInstance: GrafoClient | null = null;

export function getGrafoClient(): GrafoClient | null {
    return clientInstance;
}

export function initializeGrafoClient(config: GrafoClientConfig): GrafoClient {
    logger.info('='.repeat(50));
    logger.info('Initializing Grafo Client');
    logger.info(`  URL: ${config.baseUrl}`);
    logger.info(`  Version: ${config.version || '(all versions)'}`);
    logger.info('='.repeat(50));

    clientInstance = new GrafoClient(config);
    return clientInstance;
}

export function disposeGrafoClient(): void {
    logger.info('Disposing Grafo Client');
    clientInstance = null;
}
