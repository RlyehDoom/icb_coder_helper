/**
 * Grafo API v2.1 Types
 * Schema: Versioned collections (nodes_{version})
 * IDs: grafo:{kind}/{project}/{identifier}
 */

// Node Types
export interface GraphNode {
    id: string;
    name: string;
    fullName: string;
    type: string;
    kind: NodeKind;
    language: string;
    namespace?: string;
    project?: string;
    solution?: string;
    layer?: LayerType;
    accessibility?: string;
    isAbstract?: boolean;
    isStatic?: boolean;
    isSealed?: boolean;
    source?: SourceLocation;
    containedIn?: string;
    contains?: string[];
    hasMember?: string[];  // Class/Interface -> Method/Property/Field (logical containment)
    calls?: string[];
    callsVia?: string[];
    indirectCall?: string[];
    implements?: string[];
    inherits?: string[];
    uses?: string[];
}

export type NodeKind = 'class' | 'interface' | 'method' | 'property' | 'field' | 'enum' | 'struct' | 'file' | 'project' | 'solution' | 'layer';

export type LayerType = 'presentation' | 'services' | 'business' | 'data' | 'infrastructure' | 'test';

export interface SourceLocation {
    file?: string;
    range?: { start: number; end: number };
}

// API Responses
export interface SearchResponse {
    version: string;
    query: string;
    results: GraphNode[];
    count: number;
}

export interface CallersResponse {
    found: boolean;
    target: GraphNode;
    version: string;
    callers: Array<{ node: GraphNode; depth: number }>;
    indirectCallers: Array<{ node: GraphNode; depth: number }>;
    totalCallers: number;
}

export interface CalleesResponse {
    found: boolean;
    source: GraphNode;
    version: string;
    callees: Array<{ node: GraphNode; depth: number }>;
    viaInterface: Array<{ node: GraphNode; depth: number }>;
    totalCallees: number;
}

export interface ImplementationsResponse {
    found: boolean;
    interface: GraphNode;
    version: string;
    implementations: GraphNode[];
    count: number;
}

export interface InheritanceResponse {
    found: boolean;
    class: GraphNode;
    version: string;
    ancestors: Array<{ node: GraphNode; depth: number }>;
    descendants: Array<{ node: GraphNode; depth: number }>;
}

export interface VersionsResponse {
    versions: string[];
    default: string;
    count: number;
}

export interface HealthResponse {
    status: 'healthy' | 'degraded';
    service: string;
    version: string;
    mongodb: 'connected' | 'disconnected';
}

export interface StatsResponse {
    version: string;
    totalNodes: number;
    totalProjects: number;
    totalSolutions: number;
    nodesByType: Record<string, number>;
}

export interface SemanticStatsResponse {
    version: string;
    relationships: {
        Inherits: number;
        Implements: number;
        Calls: number;
        CallsVia: number;
        Uses: number;
        Contains: number;
    };
    totalSemanticEdges: number;
    nodes: {
        totalClasses: number;
        totalInterfaces: number;
    };
}

// Extension Types
export interface CurrentContext {
    filePath: string;
    className?: string;
    methodName?: string;
    namespace?: string;
    baseClass?: string;
    isExtendedClass: boolean;
    node?: GraphNode;
}

export interface LayerStats {
    layer: LayerType;
    count: number;
    nodes: GraphNode[];
}

// Graph Visualization
export interface CytoscapeNode {
    data: {
        id: string;
        label: string;
        type: NodeKind;
        layer?: LayerType;
        project?: string;
        isCurrent?: boolean;
    };
}

export interface CytoscapeEdge {
    data: {
        id: string;
        source: string;
        target: string;
        type: 'calls' | 'callsVia' | 'implements' | 'inherits' | 'uses';
    };
}

export interface CytoscapeData {
    nodes: CytoscapeNode[];
    edges: CytoscapeEdge[];
}
