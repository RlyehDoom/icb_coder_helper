/**
 * TypeScript interfaces for Grafo API responses
 */

// ============================================================================
// Graph Node Types
// ============================================================================

export interface GraphNode {
    Id: string;
    Name: string;
    FullName: string;
    Type: NodeType;
    Project: string;
    Namespace: string;
    Accessibility: string;
    IsAbstract: boolean;
    IsStatic: boolean;
    IsSealed: boolean;
    Location?: NodeLocation;
    Attributes?: NodeAttributes;
    ContainingType?: string;
}

export type NodeType =
    | 'Class'
    | 'Interface'
    | 'Method'
    | 'Property'
    | 'Field'
    | 'Enum'
    | 'Struct'
    | 'File';

export interface NodeLocation {
    AbsolutePath?: string;
    RelativePath?: string;
    Line?: number;
    Column?: number;
}

export interface NodeAttributes {
    parameters?: MethodParameter[];
    returnType?: string;
    baseTypes?: string[];
    interfaces?: string[];
    modifiers?: string[];
    customAttributes?: Record<string, unknown>;
}

export interface MethodParameter {
    name: string;
    type: string;
    isOptional?: boolean;
    defaultValue?: string;
}

// ============================================================================
// Graph Edge Types
// ============================================================================

export interface GraphEdge {
    Id: string;
    Source: string;
    Target: string;
    Relationship: RelationshipType;
    Strength: number;
    Count: number;
}

export type RelationshipType =
    | 'Inherits'
    | 'Implements'
    | 'Calls'
    | 'Uses'
    | 'Contains'
    | 'project_reference';

// ============================================================================
// API Request Types
// ============================================================================

export interface SearchNodesRequest {
    query: string;
    nodeType?: NodeType;
    project?: string;
    namespace?: string;
    version?: string;
    limit?: number;
}

export interface CodeContextRequest {
    relativePath?: string;
    absolutePath?: string;
    className?: string;
    methodName?: string;
    namespace?: string;
    projectName?: string;
    version?: string;
    includeRelated?: boolean;
    maxRelated?: number;
    maxDepth?: number;
}

export interface GetRelatedNodesRequest {
    nodeId: string;
    relationshipType?: RelationshipType;
    direction?: 'incoming' | 'outgoing' | 'both';
    maxDepth?: number;
}

export interface ClassHierarchyRequest {
    classId: string;
    maxDepth?: number;
}

export interface InterfaceImplementationsRequest {
    interfaceId: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface CodeContextResponse {
    found: boolean;
    mainElement?: GraphNode;
    relatedElements: GraphNode[];
    edges: GraphEdge[];
    projectInfo?: ProjectSummary;
    suggestions: string[];
}

export interface ProjectSummary {
    MongoId?: string;
    ProjectId: string;
    ProjectName: string;
    Layer: string;
    NodeCount: number;
    EdgeCount: number;
    LastProcessed: string;
    SourceFile: string;
    Version?: string;
}

export interface RelatedNodesResponse {
    sourceNode: GraphNode;
    relatedNodes: GraphNode[];
    edges: GraphEdge[];
    projectId?: string;
    totalRelated: number;
}

export interface SemanticStatsResponse {
    relationships: {
        Inherits: number;
        Implements: number;
        Calls: number;
        Uses: number;
        Contains: number;
        Other: number;
    };
    totalSemanticEdges: number;
    totalEdges: number;
    nodes: {
        classesWithNamespace: number;
        totalClasses: number;
        interfacesWithNamespace: number;
        totalInterfaces: number;
    };
}

export interface RelationshipsResponse {
    relationshipType: RelationshipType;
    count: number;
    relationships: Array<{
        source: string;
        target: string;
        relationship: string;
        projectId?: string;
        projectName?: string;
    }>;
}

export interface ClassHierarchyResponse {
    found: boolean;
    class?: {
        id: string;
        name: string;
        fullName: string;
        namespace: string;
        isAbstract: boolean;
        isSealed: boolean;
    };
    ancestors: Array<{
        id: string;
        name: string;
        fullName: string;
        namespace: string;
        depth: number;
    }>;
    descendants: Array<{
        id: string;
        name: string;
        fullName: string;
        namespace: string;
    }>;
    hierarchyDepth: number;
    message?: string;
}

export interface InterfaceImplementationsResponse {
    found: boolean;
    interface?: {
        id: string;
        name: string;
        fullName: string;
        namespace: string;
    };
    implementations: Array<{
        id: string;
        name: string;
        fullName: string;
        namespace: string;
        projectId?: string;
        isAbstract: boolean;
    }>;
    implementationCount: number;
    message?: string;
}

export interface HealthCheckResponse {
    status: 'healthy' | 'degraded';
    service: string;
    version: string;
    mongodb: 'connected' | 'disconnected';
}

export interface GraphStatisticsResponse {
    totalProjects: number;
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
    projectsByLayer: Record<string, number>;
    versions?: string[];
}

// ============================================================================
// Extension Types
// ============================================================================

export interface GrafoConfig {
    apiUrl: string;
    graphVersion: string;
    enableHover: boolean;
    enableCodeLens: boolean;
    enableTreeView: boolean;
    maxRelatedItems: number;
}

export interface ElementInfo {
    name: string;
    type: NodeType;
    namespace?: string;
    className?: string;
    line: number;
    column: number;
}
