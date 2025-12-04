/**
 * Shared Graph Service
 * Provides common graph logic for both sidebar and panel views
 * Uses Lazy Expand Nodes pattern: Click to expand/collapse, right-click to navigate
 */
import { getClient } from '../api/grafoClient';
import { GraphNode, CytoscapeNode, CytoscapeEdge } from '../types';
import { logger } from '../logger';

export interface GraphRelationships {
    nodes: CytoscapeNode[];
    edges: CytoscapeEdge[];
}

/**
 * Get all solutions (root of graph - layer='root')
 */
export async function getSolutions(): Promise<GraphNode[]> {
    const client = getClient();
    if (!client) return [];

    try {
        return await client.getSolutions();
    } catch (e) {
        logger.error('[GraphService] Error getting solutions', e);
        return [];
    }
}

/**
 * Create initial graph data with all solutions as root nodes
 * Also fetches and adds cross-solution dependency edges
 */
export async function createRootGraphData(solutions: GraphNode[]): Promise<{
    nodes: CytoscapeNode[];
    edges: CytoscapeEdge[];
}> {
    const client = getClient();
    const nodes: CytoscapeNode[] = [];
    const edges: CytoscapeEdge[] = [];

    // Create a map of solution name to id (both name and fullName as keys)
    const solutionNameToId: Record<string, string> = {};

    for (const solution of solutions) {
        // Map by name
        solutionNameToId[solution.name] = solution.id;
        // Also map by fullName if different
        if (solution.fullName && solution.fullName !== solution.name) {
            solutionNameToId[solution.fullName] = solution.id;
        }
        logger.debug(`[GraphService] Solution mapping: name="${solution.name}", id="${solution.id}"`);

        nodes.push({
            data: {
                id: solution.id,
                label: solution.name,
                type: 'solution',
                layer: solution.layer,
                project: solution.project,
                namespace: solution.namespace,
                fullName: solution.fullName,
                expandable: true,
                isCurrent: false
            }
        });
    }

    // Fetch cross-solution dependencies and add edges
    if (client) {
        try {
            const dependencies = await client.getSolutionDependencies();
            logger.debug(`[GraphService] Got ${dependencies.length} solution dependencies`);

            for (const dep of dependencies) {
                logger.debug(`[GraphService] Dependency: "${dep.from}" -> "${dep.to}" (${dep.relationshipCount} rels)`);
                const fromId = solutionNameToId[dep.from];
                const toId = solutionNameToId[dep.to];

                if (!fromId) {
                    logger.warn(`[GraphService] No solution found for "from": ${dep.from}`);
                }
                if (!toId) {
                    logger.warn(`[GraphService] No solution found for "to": ${dep.to}`);
                }

                if (fromId && toId) {
                    edges.push({
                        data: {
                            id: `${fromId}-dependsOn-${toId}`,
                            source: fromId,
                            target: toId,
                            type: 'dependsOn',
                            label: `${dep.relationshipCount} deps`
                        }
                    });
                    logger.debug(`[GraphService] Added edge: ${dep.from} -> ${dep.to}`);
                }
            }
        } catch (e: any) {
            logger.error(`[GraphService] Error loading cross-solution dependencies: ${e.message}`);
        }
    }

    logger.debug(`[GraphService] createRootGraphData complete: ${nodes.length} nodes, ${edges.length} edges`);
    return { nodes, edges };
}

/**
 * Check if a node has relationships that can be expanded
 */
export function isExpandable(node: GraphNode): boolean {
    if (node.kind === 'method') {
        return true; // Methods always have potential callers/callees
    }
    if (node.kind === 'class' || node.kind === 'interface') {
        return !!(node.implements?.length || node.inherits?.length || node.hasMember?.length);
    }
    if (node.kind === 'solution' || node.kind === 'layer' || node.kind === 'project') {
        return !!(node.contains?.length);
    }
    return false;
}

/**
 * Get the display type for a node (handles interface methods)
 */
export function getNodeDisplayType(node: GraphNode): string {
    let kind = node.kind || 'class';

    // Differentiate interface methods
    if (kind === 'method') {
        // Check if contained in an interface (containedIn has 'ifc' in the ID)
        if (node.containedIn?.includes(':ifc/')) {
            return 'interfaceMethod';
        }
        // Check if fullName contains an interface pattern like .IMyInterface.MethodName
        // The interface name should be the second-to-last part of fullName
        if (node.fullName) {
            const parts = node.fullName.split('.');
            if (parts.length >= 2) {
                const containingType = parts[parts.length - 2];
                // Interface names start with I followed by uppercase letter
                if (/^I[A-Z]/.test(containingType)) {
                    return 'interfaceMethod';
                }
            }
        }
    }
    return kind;
}

/**
 * Create Cytoscape node data from a GraphNode
 */
export function createCytoscapeNode(node: GraphNode, isCurrent: boolean = false): CytoscapeNode {
    const type = getNodeDisplayType(node);

    // Calculate count for label
    let count = 0;
    if (node.kind === 'class' || node.kind === 'interface') {
        count = node.hasMember?.length || 0;
    } else if (node.kind === 'method') {
        count = (node.calls?.length || 0) + (node.callsVia?.length || 0);
    } else if (node.kind === 'solution' || node.kind === 'layer' || node.kind === 'project') {
        count = node.contains?.length || 0;
    }

    const label = count > 0 ? `${node.name} (${count})` : node.name;

    return {
        data: {
            id: node.id,
            label,
            type,
            layer: node.layer,
            project: node.project,
            namespace: node.namespace,
            fullName: node.fullName,
            accessibility: node.accessibility,
            isAbstract: node.isAbstract,
            isStatic: node.isStatic,
            isCurrent,
            expandable: isExpandable(node)
        }
    };
}

/**
 * Get relationships for a node to expand (Lazy Expand pattern)
 */
export async function getNodeRelationships(node: GraphNode): Promise<GraphRelationships> {
    const client = getClient();
    if (!client) {
        logger.warn('[GraphService] No client available');
        return { nodes: [], edges: [] };
    }

    logger.info(`[GraphService] Getting relationships for ${node.kind}: ${node.name}`);

    const nodes: CytoscapeNode[] = [];
    const edges: CytoscapeEdge[] = [];
    const addedIds = new Set<string>();
    const addedFullNames = new Set<string>(); // Track by fullName to avoid cross-project duplicates

    try {
        // For methods, get callers and callees
        if (node.kind === 'method') {
            await loadMethodRelationships(node, nodes, edges, addedIds, addedFullNames);
        }

        // For classes/interfaces
        if (node.kind === 'class' || node.kind === 'interface') {
            await loadClassRelationships(node, nodes, edges, addedIds, addedFullNames);
        }

        // For solutions/layers/projects/namespaces
        if (node.kind === 'solution' || node.kind === 'layer' || node.kind === 'project' || node.kind === 'namespace') {
            await loadContainerRelationships(node, nodes, edges, addedIds, addedFullNames);
        }

        logger.info(`[GraphService] Done: ${nodes.length} nodes, ${edges.length} edges`);
    } catch (e: any) {
        logger.error(`[GraphService] Error getting relationships: ${e.message}`);
    }

    return { nodes, edges };
}

/**
 * Get relationships for a virtual layer node (layer:name)
 */
export async function getLayerRelationships(layerName: string, layerId: string): Promise<GraphRelationships> {
    const client = getClient();
    if (!client) return { nodes: [], edges: [] };

    const nodes: CytoscapeNode[] = [];
    const edges: CytoscapeEdge[] = [];

    try {
        const layersData = await client.getProjectsByLayer();
        if (layersData && layersData.layers && layersData.layers[layerName]) {
            const layerInfo = layersData.layers[layerName];
            const projects = (layerInfo as any).projects || [];

            for (const proj of projects.slice(0, 20)) {
                const projectId = `project:${proj.name}`;
                nodes.push({
                    data: {
                        id: projectId,
                        label: `${proj.name} (${proj.nodeCount || 0})`,
                        type: 'project',
                        layer: layerName as any,
                        project: proj.name,
                        expandable: (proj.nodeCount || 0) > 0
                    }
                });
                edges.push({
                    data: {
                        id: `${layerId}-contains-${projectId}`,
                        source: layerId,
                        target: projectId,
                        type: 'hasMember'
                    }
                });
            }
        }
    } catch (e) {
        logger.error('[GraphService] Error loading layer projects', e);
    }

    return { nodes, edges };
}

/**
 * Get relationships for a virtual project node (project:name)
 * Groups classes/interfaces by namespace for hierarchical navigation
 */
export async function getProjectRelationships(projectName: string, projectId: string): Promise<GraphRelationships> {
    const client = getClient();
    if (!client) return { nodes: [], edges: [] };

    const nodes: CytoscapeNode[] = [];
    const edges: CytoscapeEdge[] = [];

    try {
        // Get ALL classes and interfaces in this project (no limit)
        const projectNodes = await client.getNodesByProject(projectName);
        const classesAndInterfaces = projectNodes.filter(n =>
            n.kind === 'class' || n.kind === 'interface'
        );

        // Group by namespace
        const namespaceMap = new Map<string, GraphNode[]>();
        for (const childNode of classesAndInterfaces) {
            const ns = childNode.namespace || '(no namespace)';
            if (!namespaceMap.has(ns)) {
                namespaceMap.set(ns, []);
            }
            namespaceMap.get(ns)!.push(childNode);
        }

        // Create namespace nodes (expandable)
        for (const [namespace, nsNodes] of namespaceMap) {
            const nsId = `ns:${projectName}:${namespace}`;
            // Get just the last segment of the namespace for display
            const lastSegment = namespace.split('.').pop() || namespace;
            nodes.push({
                data: {
                    id: nsId,
                    label: `${lastSegment} (${nsNodes.length})`,
                    type: 'namespace',
                    fullName: namespace,
                    project: projectName,
                    expandable: true
                }
            });
            edges.push({
                data: {
                    id: `${projectId}-contains-${nsId}`,
                    source: projectId,
                    target: nsId,
                    type: 'hasMember'
                }
            });
        }
    } catch (e) {
        logger.error('[GraphService] Error loading project namespaces', e);
    }

    return { nodes, edges };
}

/**
 * Get relationships for a virtual namespace node (ns:projectName:namespace)
 * Shows all classes/interfaces in that namespace
 */
export async function getNamespaceRelationships(projectName: string, namespace: string, nsId: string): Promise<GraphRelationships> {
    const client = getClient();
    if (!client) return { nodes: [], edges: [] };

    const nodes: CytoscapeNode[] = [];
    const edges: CytoscapeEdge[] = [];

    try {
        // Get classes and interfaces separately to ensure we get them all
        const [classes, interfaces] = await Promise.all([
            client.getNodesByProject(projectName, 'class'),
            client.getNodesByProject(projectName, 'interface')
        ]);

        const allNodes = [...classes, ...interfaces];
        const nsClasses = allNodes.filter(n => n.namespace === namespace);

        logger.info(`[GraphService] Namespace ${namespace}: found ${nsClasses.length} classes/interfaces`);

        for (const childNode of nsClasses) {
            nodes.push(createCytoscapeNode(childNode));
            edges.push({
                data: {
                    id: `${nsId}-contains-${childNode.id}`,
                    source: nsId,
                    target: childNode.id,
                    type: 'hasMember'
                }
            });
        }
    } catch (e) {
        logger.error('[GraphService] Error loading namespace classes', e);
    }

    return { nodes, edges };
}

/**
 * Load relationships for a method node
 */
async function loadMethodRelationships(
    node: GraphNode,
    nodes: CytoscapeNode[],
    edges: CytoscapeEdge[],
    addedIds: Set<string>,
    addedFullNames: Set<string>
): Promise<void> {
    const client = getClient();
    if (!client) return;

    logger.info(`[loadMethod] Starting for ${node.name}`);

    // Helper to check if node should be added (by ID or fullName)
    const shouldAddNode = (n: GraphNode): boolean => {
        if (addedIds.has(n.id)) {
            logger.debug(`[loadMethod] Skip by ID: ${n.id}`);
            return false;
        }
        if (n.fullName && addedFullNames.has(n.fullName)) {
            logger.debug(`[loadMethod] Skip by fullName: ${n.fullName}`);
            return false;
        }
        return true;
    };

    // Helper to mark node as added
    const markNodeAdded = (n: GraphNode): void => {
        addedIds.add(n.id);
        if (n.fullName) {
            addedFullNames.add(n.fullName);
            logger.debug(`[loadMethod] Added: ${n.name} -> fullName: ${n.fullName}`);
        } else {
            logger.warn(`[loadMethod] Node without fullName: ${n.name} (${n.id})`);
        }
    };

    // Get containing class from fullName and load its hierarchy
    if (node.fullName) {
        const parts = node.fullName.split('.');
        if (parts.length >= 2) {
            const classFullName = parts.slice(0, -1).join('.');
            try {
                const containingClass = await client.findByName(classFullName, 'class');
                if (containingClass && shouldAddNode(containingClass)) {
                    nodes.push(createCytoscapeNode(containingClass));
                    markNodeAdded(containingClass);
                    edges.push({
                        data: {
                            id: `${containingClass.id}-hasMember-${node.id}`,
                            source: containingClass.id,
                            target: node.id,
                            type: 'hasMember'
                        }
                    });

                    // Also load the containing class's inheritance hierarchy
                    if (containingClass.inherits) {
                        for (const inheritId of containingClass.inherits) {
                            const baseClass = await client.getNodeById(inheritId);
                            if (baseClass && shouldAddNode(baseClass)) {
                                nodes.push(createCytoscapeNode(baseClass));
                                markNodeAdded(baseClass);
                            }
                            edges.push({
                                data: {
                                    id: `${containingClass.id}-inherits-${inheritId}`,
                                    source: containingClass.id,
                                    target: inheritId,
                                    type: 'inherits'
                                }
                            });
                        }
                    }

                    // Also load the containing class's implements
                    if (containingClass.implements) {
                        for (const implId of containingClass.implements) {
                            const iface = await client.getNodeById(implId);
                            if (iface && shouldAddNode(iface)) {
                                nodes.push(createCytoscapeNode(iface));
                                markNodeAdded(iface);
                            }
                            edges.push({
                                data: {
                                    id: `${containingClass.id}-implements-${implId}`,
                                    source: containingClass.id,
                                    target: implId,
                                    type: 'implements'
                                }
                            });
                        }
                    }
                }
                logger.info(`[loadMethod] ContainingClass done with hierarchy`);
            } catch (e) {
                logger.info(`[loadMethod] ContainingClass error`);
            }
        }
    }

    // Callers (who calls this method) - direct AND indirect
    try {
        const callersResult = await client.findCallers(node.id, 1);

        // Direct callers
        for (const { node: caller } of (callersResult.callers || [])) {
            if (shouldAddNode(caller)) {
                nodes.push(createCytoscapeNode(caller));
                markNodeAdded(caller);
                edges.push({
                    data: {
                        id: `${caller.id}-calls-${node.id}`,
                        source: caller.id,
                        target: node.id,
                        type: 'calls'
                    }
                });
            }
        }

        // Indirect callers (via interface)
        for (const { node: caller } of (callersResult.indirectCallers || [])) {
            if (shouldAddNode(caller)) {
                nodes.push(createCytoscapeNode(caller));
                markNodeAdded(caller);
                edges.push({
                    data: {
                        id: `${caller.id}-callsVia-${node.id}`,
                        source: caller.id,
                        target: node.id,
                        type: 'callsVia'
                    }
                });
            }
        }
        logger.info(`[loadMethod] Callers done: direct=${callersResult.callers?.length || 0}, indirect=${callersResult.indirectCallers?.length || 0}`);
    } catch (e) {
        logger.info(`[loadMethod] Callers error`);
    }

    // Callees (what this method calls) - from node.calls and node.indirectCall
    // Direct calls
    if (node.calls && node.calls.length > 0) {
        for (const calleeId of node.calls) {
            try {
                const callee = await client.getNodeById(calleeId);
                if (callee && shouldAddNode(callee)) {
                    nodes.push(createCytoscapeNode(callee));
                    markNodeAdded(callee);
                    edges.push({
                        data: {
                            id: `${node.id}-calls-${calleeId}`,
                            source: node.id,
                            target: calleeId,
                            type: 'calls'
                        }
                    });
                }
            } catch (e) {
                // Skip if not found
            }
        }
        logger.info(`[loadMethod] Direct calls done: ${node.calls.length}`);
    }

    // Indirect calls (via interface) - these are the actual methods called
    if (node.indirectCall && node.indirectCall.length > 0) {
        for (const calleeId of node.indirectCall) {
            try {
                const callee = await client.getNodeById(calleeId);
                if (callee && shouldAddNode(callee)) {
                    nodes.push(createCytoscapeNode(callee));
                    markNodeAdded(callee);
                    edges.push({
                        data: {
                            id: `${node.id}-callsVia-${calleeId}`,
                            source: node.id,
                            target: calleeId,
                            type: 'callsVia'
                        }
                    });
                }
            } catch (e) {
                // Skip if not found
            }
        }
        logger.info(`[loadMethod] Indirect calls done: ${node.indirectCall.length}`);
    }

    // Uses (classes/types this method uses)
    if (node.uses && node.uses.length > 0) {
        for (const usedId of node.uses) {
            try {
                const usedNode = await client.getNodeById(usedId);
                if (usedNode && shouldAddNode(usedNode)) {
                    nodes.push(createCytoscapeNode(usedNode));
                    markNodeAdded(usedNode);
                    edges.push({
                        data: {
                            id: `${node.id}-uses-${usedId}`,
                            source: node.id,
                            target: usedId,
                            type: 'uses'
                        }
                    });
                }
            } catch (e) {
                // Skip if node not found
            }
        }
        logger.info(`[loadMethod] Uses done: ${node.uses.length}`);
    }

    logger.info(`[loadMethod] Completed for ${node.name}`);
}

/**
 * Load relationships for a class/interface node
 */
async function loadClassRelationships(
    node: GraphNode,
    nodes: CytoscapeNode[],
    edges: CytoscapeEdge[],
    addedIds: Set<string>,
    addedFullNames: Set<string>
): Promise<void> {
    const client = getClient();
    if (!client) return;

    logger.info(`[loadClass] Getting relationships for class: ${node.fullName}`);

    // Helper to check if node should be added (by ID or fullName)
    const shouldAddNode = (n: GraphNode): boolean => {
        if (addedIds.has(n.id)) {
            logger.debug(`[loadClass] Skip by ID: ${n.id}`);
            return false;
        }
        if (n.fullName && addedFullNames.has(n.fullName)) {
            logger.debug(`[loadClass] Skip by fullName: ${n.fullName}`);
            return false;
        }
        return true;
    };

    // Helper to mark node as added
    const markNodeAdded = (n: GraphNode): void => {
        addedIds.add(n.id);
        if (n.fullName) {
            addedFullNames.add(n.fullName);
            logger.debug(`[loadClass] Added: ${n.name} -> fullName: ${n.fullName}`);
        } else {
            logger.warn(`[loadClass] Node without fullName: ${n.name} (${n.id})`);
        }
    };

    // Implements
    if (node.implements) {
        for (const implId of node.implements) {
            const implNode = await client.getNodeById(implId);
            if (implNode && shouldAddNode(implNode)) {
                nodes.push(createCytoscapeNode(implNode));
                markNodeAdded(implNode);
            }
            edges.push({
                data: {
                    id: `${node.id}-implements-${implId}`,
                    source: node.id,
                    target: implId,
                    type: 'implements'
                }
            });
        }
    }

    // Inherits
    if (node.inherits) {
        for (const inheritId of node.inherits) {
            const inheritNode = await client.getNodeById(inheritId);
            if (inheritNode && shouldAddNode(inheritNode)) {
                nodes.push(createCytoscapeNode(inheritNode));
                markNodeAdded(inheritNode);
            }
            edges.push({
                data: {
                    id: `${node.id}-inherits-${inheritId}`,
                    source: node.id,
                    target: inheritId,
                    type: 'inherits'
                }
            });
        }
    }

    // Members (methods, properties) - show ALL
    if (node.hasMember) {
        const memberPromises = node.hasMember.map(id => client.getNodeById(id));
        const members = await Promise.all(memberPromises);
        for (let i = 0; i < members.length; i++) {
            const memberNode = members[i];
            if (memberNode && shouldAddNode(memberNode)) {
                nodes.push(createCytoscapeNode(memberNode));
                markNodeAdded(memberNode);
                edges.push({
                    data: {
                        id: `${node.id}-hasMember-${memberNode.id}`,
                        source: node.id,
                        target: memberNode.id,
                        type: 'hasMember'
                    }
                });
            }
        }
    }

    // Find implementations (for interfaces) - show ALL
    if (node.kind === 'interface') {
        try {
            const implsResult = await client.findImplementations(node.id);
            for (const impl of implsResult.implementations) {
                if (shouldAddNode(impl)) {
                    nodes.push(createCytoscapeNode(impl));
                    markNodeAdded(impl);
                    edges.push({
                        data: {
                            id: `${impl.id}-implements-${node.id}`,
                            source: impl.id,
                            target: node.id,
                            type: 'implements'
                        }
                    });
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Find inheritors (for classes) - show ALL
    if (node.kind === 'class') {
        try {
            const inheritResult = await client.findInheritance(node.id, 1);
            for (const { node: desc } of inheritResult.descendants) {
                if (shouldAddNode(desc)) {
                    nodes.push(createCytoscapeNode(desc));
                    markNodeAdded(desc);
                    edges.push({
                        data: {
                            id: `${desc.id}-inherits-${node.id}`,
                            source: desc.id,
                            target: node.id,
                            type: 'inherits'
                        }
                    });
                }
            }
        } catch (e) {
            // Ignore
        }
    }
}

/**
 * Load relationships for container nodes (solution/layer/project)
 * Solutions -> show layers/projects
 * Layers -> show projects
 * Projects -> show namespaces (grouped), namespaces -> show classes/interfaces
 */
async function loadContainerRelationships(
    node: GraphNode,
    nodes: CytoscapeNode[],
    edges: CytoscapeEdge[],
    addedIds: Set<string>,
    addedFullNames: Set<string>
): Promise<void> {
    const client = getClient();
    if (!client) return;

    // For projects, group by namespace
    if (node.kind === 'project') {
        try {
            // Get ALL classes and interfaces in this project (no limit)
            const projectNodes = await client.getNodesByProject(node.name);
            const classesAndInterfaces = projectNodes.filter(n =>
                n.kind === 'class' || n.kind === 'interface'
            );

            // Group by namespace
            const namespaceMap = new Map<string, GraphNode[]>();
            for (const childNode of classesAndInterfaces) {
                const ns = childNode.namespace || '(no namespace)';
                if (!namespaceMap.has(ns)) {
                    namespaceMap.set(ns, []);
                }
                namespaceMap.get(ns)!.push(childNode);
            }

            // Create namespace nodes
            for (const [namespace, nsNodes] of namespaceMap) {
                const nsId = `ns:${node.name}:${namespace}`;
                if (!addedIds.has(nsId)) {
                    nodes.push({
                        data: {
                            id: nsId,
                            label: `${namespace.split('.').pop() || namespace} (${nsNodes.length})`,
                            type: 'namespace',
                            fullName: namespace,
                            project: node.name,
                            layer: node.layer,
                            expandable: true
                        }
                    });
                    addedIds.add(nsId);
                    edges.push({
                        data: {
                            id: `${node.id}-contains-${nsId}`,
                            source: node.id,
                            target: nsId,
                            type: 'hasMember'
                        }
                    });
                }
            }
        } catch (e) {
            logger.error('[GraphService] Error loading project namespaces', e);
        }
        return;
    }

    // For namespace nodes (virtual), show all classes/interfaces in that namespace
    if (node.kind === 'namespace' || (node as any).type === 'namespace') {
        try {
            const namespace = node.fullName || (node as any).data?.fullName;
            const projectName = node.project || (node as any).data?.project;

            if (namespace && projectName) {
                const projectNodes = await client.getNodesByProject(projectName);
                const nsClasses = projectNodes.filter(n =>
                    (n.kind === 'class' || n.kind === 'interface') && n.namespace === namespace
                );

                for (const childNode of nsClasses) {
                    if (!addedIds.has(childNode.id)) {
                        nodes.push(createCytoscapeNode(childNode));
                        addedIds.add(childNode.id);
                        edges.push({
                            data: {
                                id: `${node.id}-contains-${childNode.id}`,
                                source: node.id,
                                target: childNode.id,
                                type: 'hasMember'
                            }
                        });
                    }
                }
            }
        } catch (e) {
            logger.error('[GraphService] Error loading namespace classes', e);
        }
        return;
    }

    // For solutions and layers, use contains array but filter for relevant types
    if (node.contains && node.contains.length > 0) {
        const containsPromises = node.contains.map(id => client.getNodeById(id));
        const containedNodes = await Promise.all(containsPromises);

        for (let i = 0; i < containedNodes.length; i++) {
            const containedNode = containedNodes[i];
            const containedId = node.contains[i];

            // Only show layers, projects, classes, interfaces - NOT files
            if (containedNode && !addedIds.has(containedId)) {
                const validKinds = ['layer', 'project', 'class', 'interface', 'solution'];
                if (validKinds.includes(containedNode.kind)) {
                    nodes.push(createCytoscapeNode(containedNode));
                    addedIds.add(containedId);
                    edges.push({
                        data: {
                            id: `${node.id}-contains-${containedId}`,
                            source: node.id,
                            target: containedId,
                            type: 'hasMember'
                        }
                    });
                }
            }
        }
    }

    // For solutions, also try to load layers from API
    if (node.kind === 'solution') {
        try {
            const layersData = await client.getProjectsByLayer();
            if (layersData && layersData.layers) {
                for (const [layerName, layerInfo] of Object.entries(layersData.layers)) {
                    // Create a virtual layer node
                    const layerId = `layer:${layerName}`;
                    if (!addedIds.has(layerId)) {
                        const projectCount = (layerInfo as any).projects?.length || 0;
                        nodes.push({
                            data: {
                                id: layerId,
                                label: `${layerName.toUpperCase()} (${projectCount})`,
                                type: 'layer',
                                layer: layerName as any,
                                expandable: projectCount > 0
                            }
                        });
                        addedIds.add(layerId);
                        edges.push({
                            data: {
                                id: `${node.id}-contains-${layerId}`,
                                source: node.id,
                                target: layerId,
                                type: 'hasMember'
                            }
                        });
                    }
                }
            }
        } catch (e) {
            logger.debug('[GraphService] Could not load layers from API');
        }
    }
}

/**
 * Generate the shared webview HTML for the graph
 */
export function generateGraphWebviewHtml(options: {
    showToolbar?: boolean;
    showLegend?: boolean;
    showStatusBar?: boolean;
    showTooltip?: boolean;
    showSearch?: boolean;
    version?: string;
} = {}): string {
    const { showToolbar = true, showLegend = true, showStatusBar = true, showTooltip = true, showSearch = false, version = '' } = options;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grafo Graph</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        #cy { flex: 1; width: 100%; }

        /* Toolbar */
        .toolbar {
            display: ${showToolbar ? 'flex' : 'none'};
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            background: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .toolbar-left, .toolbar-right {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .toolbar-btn {
            background: transparent;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .toolbar-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
        .toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .toolbar-btn svg { width: 14px; height: 14px; }
        .toolbar-separator { width: 1px; height: 16px; background: var(--vscode-panel-border); margin: 0 4px; }
        .toolbar-title { font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .toolbar-version { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 5px; border-radius: 3px; font-size: 10px; }

        /* Search box */
        .search-container { display: flex; align-items: center; gap: 4px; flex: 1; max-width: 400px; margin: 0 8px; }
        .search-input {
            flex: 1;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            outline: none;
            min-width: 200px;
        }
        .search-input:focus { border-color: var(--vscode-focusBorder); }
        .search-input::placeholder { color: var(--vscode-input-placeholderForeground); }
        .search-results-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            min-width: 500px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .search-results-dropdown.visible { display: block; }
        .search-result-item {
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 11px;
            border-bottom: 1px solid var(--vscode-dropdown-border);
        }
        .search-result-item:last-child { border-bottom: none; }
        .search-result-item:hover { background: var(--vscode-list-hoverBackground); }
        .search-result-row { display: flex; align-items: center; gap: 8px; }
        .search-result-type {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            flex-shrink: 0;
        }
        .search-result-type.class { background: #4fc3f7; color: #000; }
        .search-result-type.interface { background: #81c784; color: #000; }
        .search-result-type.method { background: #ffb74d; color: #000; }
        .search-result-type.property { background: #ce93d8; color: #000; }
        .search-result-interface-badge {
            background: #81c784;
            color: #000;
            padding: 2px 5px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 700;
            flex-shrink: 0;
        }
        .search-result-name { font-weight: 600; color: var(--vscode-foreground); }
        .search-result-details { display: flex; gap: 8px; font-size: 10px; color: var(--vscode-descriptionForeground); padding-left: 2px; }
        .search-result-namespace { color: var(--vscode-textLink-foreground); }
        .search-result-solution { color: #ce9178; font-weight: 500; }
        .search-result-project { color: var(--vscode-descriptionForeground); }
        .search-no-results { padding: 10px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 11px; }
        .search-exact-label {
            display: flex;
            align-items: center;
            gap: 3px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            white-space: nowrap;
        }
        .search-exact-label input { margin: 0; cursor: pointer; }
        .search-exact-label span { user-select: none; }

        /* Layout selector */
        .layout-selector { position: relative; }
        .layout-btn { padding: 4px 6px !important; }
        .layout-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            min-width: 160px;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            margin-top: 4px;
        }
        .layout-dropdown.visible { display: block; }
        .layout-option {
            padding: 6px 10px;
            cursor: pointer;
            font-size: 11px;
            border-bottom: 1px solid var(--vscode-dropdown-border);
        }
        .layout-option:last-child { border-bottom: none; }
        .layout-option:hover { background: var(--vscode-list-hoverBackground); }
        .layout-option.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }

        /* Context Menu */
        #context-menu {
            display: none;
            position: absolute;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 4px;
            padding: 4px 0;
            min-width: 160px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 200;
        }
        .menu-item {
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .menu-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }
        .menu-separator { height: 1px; background: var(--vscode-menu-separatorBackground); margin: 4px 0; }

        /* Legend - horizontal compact */
        #legend {
            display: ${showLegend ? 'flex' : 'none'};
            flex-direction: column;
            position: absolute;
            bottom: ${showStatusBar ? '30px' : '8px'};
            left: 8px;
            right: 8px;
            background: var(--vscode-input-background);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 9px;
            opacity: 0.9;
            gap: 2px;
        }
        .legend-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .legend-label { font-weight: bold; color: var(--vscode-descriptionForeground); min-width: 40px; }
        .legend-item { display: inline-flex; align-items: center; gap: 4px; }
        .legend-color { width: 8px; height: 8px; border-radius: 50%; }
        .legend-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
        .legend-icon svg { width: 100%; height: 100%; }

        /* Info panel */
        #info {
            position: absolute;
            top: ${showToolbar ? '44px' : '8px'};
            left: 8px;
            background: var(--vscode-input-background);
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 11px;
            opacity: 0.95;
        }

        /* Status bar */
        .status-bar {
            display: ${showStatusBar ? 'flex' : 'none'};
            padding: 4px 10px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 10px;
            justify-content: space-between;
            border-top: 1px solid var(--vscode-panel-border);
        }

        /* Loading */
        .loading-overlay {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            display: none;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            z-index: 100;
        }
        .loading-overlay.visible { display: flex; }
        .loading-spinner {
            width: 32px; height: 32px;
            border: 3px solid var(--vscode-editor-foreground);
            border-top-color: var(--vscode-textLink-foreground);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text { margin-top: 10px; font-size: 12px; }

        /* Tooltip - Modern Design */
        .tooltip {
            display: none;
            position: absolute;
            background: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            border-radius: 8px;
            padding: 0;
            font-size: 11px;
            min-width: 220px;
            max-width: 400px;
            z-index: 150;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .tooltip.visible { display: ${showTooltip ? 'block' : 'none'}; }
        .tooltip-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-editorHoverWidget-border);
            background: rgba(255,255,255,0.03);
        }
        .tooltip-type {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .tooltip-type.class { background: #4fc3f7; color: #000; }
        .tooltip-type.interface { background: #81c784; color: #000; }
        .tooltip-type.method { background: #ffb74d; color: #000; }
        .tooltip-type.property { background: #ce93d8; color: #000; }
        .tooltip-type.solution { background: #26a69a; color: #fff; }
        .tooltip-type.project { background: #7e57c2; color: #fff; }
        .tooltip-type.layer { background: #ff7043; color: #fff; }
        .tooltip-name {
            font-weight: 600;
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            word-break: break-word;
        }
        .tooltip-body { padding: 10px 12px; }
        .tooltip-row {
            display: flex;
            margin: 4px 0;
            font-size: 11px;
            line-height: 1.4;
        }
        .tooltip-label {
            color: var(--vscode-descriptionForeground);
            min-width: 70px;
            flex-shrink: 0;
        }
        .tooltip-value {
            color: var(--vscode-editor-foreground);
            word-break: break-word;
        }
        .tooltip-fullname {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-editorHoverWidget-border);
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="toolbar-left">
            <button class="toolbar-btn" id="btnBack" title="Go Back" disabled>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
            <button class="toolbar-btn" id="btnForward" title="Go Forward" disabled>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
            </button>
            <div class="toolbar-separator"></div>
            <div class="toolbar-title">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                Grafo
            </div>
            ${version ? `<span class="toolbar-version">v${version}</span>` : ''}
        </div>
        ${showSearch ? `
        <div class="search-container" style="position: relative;">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="opacity: 0.6;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" class="search-input" id="searchInput" placeholder="Search... (name, project)" autocomplete="off" />
            <label class="search-exact-label" title="Match exact name first">
                <input type="checkbox" id="searchExact" checked />
                <span>Exact</span>
            </label>
            <div class="layout-selector">
                <button class="toolbar-btn layout-btn" id="btnLayout" title="Change graph layout">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h8v8h-8v-8zm2 2v4h4v-4h-4z"/></svg>
                </button>
                <div class="layout-dropdown" id="layoutDropdown">
                    <div class="layout-option" data-layout="dagre">Hierarchical (Dagre)</div>
                    <div class="layout-option" data-layout="breadthfirst">Tree (BFS)</div>
                    <div class="layout-option" data-layout="circle">Circle</div>
                    <div class="layout-option" data-layout="concentric">Concentric</div>
                    <div class="layout-option" data-layout="grid">Grid</div>
                    <div class="layout-option" data-layout="cose">Force-Directed (CoSE)</div>
                </div>
            </div>
            <div class="search-results-dropdown" id="searchResults"></div>
        </div>
        ` : ''}
        <div class="toolbar-right">
            <button class="toolbar-btn" id="btnMaximize" title="Maximize / Restore">
                <svg viewBox="0 0 24 24" fill="currentColor" id="iconMaximize"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6z"/></svg>
            </button>
            <button class="toolbar-btn" id="btnLock" title="Lock graph (prevent changes on code selection)">
                <svg viewBox="0 0 24 24" fill="currentColor" id="iconLock"><path d="M12 17a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2m6-9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5 5 5 0 0 1 5 5v2h1m-6-5a3 3 0 0 0-3 3v2h6V6a3 3 0 0 0-3-3z"/></svg>
                <span id="lockIndicator" style="display:none; color:#ff9800;">●</span>
            </button>
            <button class="toolbar-btn" id="btnHome" title="Home (Navigate to solutions root)">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                <span id="homeModeIndicator" style="display:none; color:#4caf50;">●</span>
            </button>
            <button class="toolbar-btn" id="btnFit" title="Fit to View">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/></svg>
            </button>
            <button class="toolbar-btn" id="btnReset" title="Reset">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
        </div>
    </div>

    <div id="cy"></div>

    <div id="info">Click to expand | Right-click for menu</div>

    <div id="context-menu">
        <div class="menu-item" data-action="navigate">📂 Go to File</div>
        <div class="menu-item" data-action="expand">➕ Expand Node</div>
        <div class="menu-item" data-action="collapse">➖ Collapse Node</div>
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="setRoot">🎯 Set as Root</div>
    </div>

    <div id="legend">
        <div class="legend-row">
            <span class="legend-label">Layers:</span>
            <span class="legend-item"><span class="legend-color" style="background:#2196F3"></span>Presentation</span>
            <span class="legend-item"><span class="legend-color" style="background:#9C27B0"></span>Services</span>
            <span class="legend-item"><span class="legend-color" style="background:#FF9800"></span>Business</span>
            <span class="legend-item"><span class="legend-color" style="background:#4CAF50"></span>Data</span>
            <span class="legend-item"><span class="legend-color" style="background:#607D8B"></span>Shared</span>
            <span class="legend-item"><span class="legend-color" style="background:#009688"></span>Root</span>
        </div>
        <div class="legend-row">
            <span class="legend-label">Types:</span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><path d="M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3"/></svg>
                </span>Solution
            </span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><path d="M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z"/></svg>
                </span>Layer
            </span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/></svg>
                </span>Project
            </span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z"/></svg>
                </span>Namespace
            </span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><path d="M11,7A2,2 0 0,0 9,9V15A2,2 0 0,0 11,17H13A2,2 0 0,0 15,15V14H13V15H11V9H13V10H15V9A2,2 0 0,0 13,7H11Z"/></svg>
                </span>Class
            </span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><path d="M9,7V9H11V15H9V17H15V15H13V9H15V7H9Z"/></svg>
                </span>Interface
            </span>
            <span class="legend-item">
                <span class="legend-icon">
                    <svg viewBox="0 0 24 24" fill="#888"><text x="12" y="16" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" fill="#888">Fn</text></svg>
                </span>Method
            </span>
        </div>
    </div>

    <div class="loading-overlay" id="loadingOverlay">
        <div class="loading-spinner"></div>
        <div class="loading-text" id="loadingText">Loading...</div>
    </div>

    <div class="tooltip" id="tooltip"></div>

    <div class="status-bar">
        <span id="statusLeft">Ready</span>
        <span id="statusRight">Nodes: 0 | Edges: 0</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Colors by LAYER (not type)
        const layerColors = {
            presentation: '#2196F3',  // Blue
            services: '#9C27B0',      // Purple
            business: '#FF9800',      // Orange
            data: '#4CAF50',          // Green
            shared: '#607D8B',        // Blue Grey
            infrastructure: '#795548', // Brown
            root: '#009688',          // Teal
            test: '#E91E63',          // Pink
            default: '#9E9E9E'        // Grey
        };

        // All nodes are ellipses (spheres)
        function getNodeShape() {
            return 'ellipse';
        }

        // SVG icon templates - symbols only, no outlines (adapts to any node shape)
        // Using width/height instead of viewBox (viewBox can cause Firefox issues per Cytoscape docs)
        // Use {{COLOR}} as placeholder for fill color
        const iconTemplates = {
            // Solution: Grid (4 squares)
            solution: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3"/></svg>',

            // Layer: Stacked layers
            layer: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z"/></svg>',

            // Project: Folder
            project: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/></svg>',

            // Namespace: Curly braces { }
            namespace: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z"/></svg>',

            // Class: Letter C only
            class: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M11,7A2,2 0 0,0 9,9V15A2,2 0 0,0 11,17H13A2,2 0 0,0 15,15V14H13V15H11V9H13V10H15V9A2,2 0 0,0 13,7H11Z"/></svg>',

            // Interface: Letter I only
            interface: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M9,7V9H11V15H9V17H15V15H13V9H15V7H9Z"/></svg>',

            // Method: "Fn" text
            method: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="12" y="16" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" fill="{{COLOR}}">Fn</text></svg>',

            // Interface Method: Same as method
            interfaceMethod: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="12" y="16" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" fill="{{COLOR}}">Fn</text></svg>',

            // Property: Letter P only
            property: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M9,7V17H11V13H13A2,2 0 0,0 15,11V9A2,2 0 0,0 13,7H9M11,9H13V11H11V9Z"/></svg>',

            // Field: Letter F only
            field: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M9,7V17H11V13H14V11H11V9H15V7H9Z"/></svg>',

            // Enum: Letter E only
            enum: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="{{COLOR}}" d="M9,7V17H15V15H11V13H14V11H11V9H15V7H9Z"/></svg>'
        };

        // Generate SVG icon with specific color
        // Use encodeURIComponent instead of base64 (recommended by Cytoscape.js docs)
        function generateIcon(type, strokeColor) {
            const template = iconTemplates[type];
            if (!template) return null;
            const svg = template.replace(/\{\{COLOR\}\}/g, strokeColor);
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        }

        // Get SVG icon for a node (white icon on colored background)
        function getNodeIcon(ele) {
            const type = ele.data('type');
            return generateIcon(type, 'white');
        }

        // Get color based on layer
        function getNodeColor(ele) {
            const layer = ele.data('layer');
            if (layer && layerColors[layer]) {
                return layerColors[layer];
            }
            // Fallback for nodes without layer (like solutions)
            const type = ele.data('type');
            if (type === 'solution') return layerColors.root;
            if (type === 'layer') return layerColors[ele.data('label')?.toLowerCase()] || layerColors.default;
            if (type === 'project') return layerColors.shared;
            return layerColors.default;
        }

        const edgeColors = {
            calls: '#64b5f6',
            callsVia: '#4db6ac',
            implements: '#81c784',
            inherits: '#ba68c8',
            uses: '#90a4ae',
            hasMember: '#78909c',
            dependsOn: '#ff5722'
        };

        // State
        const expandedNodes = new Set();
        let rootNodeId = null;
        let selectedNodeId = null;

        // History with expansion state
        let history = []; // Array of { rootNodeId, nodes, edges, expandedNodeIds }
        let historyIndex = -1;

        function saveCurrentState() {
            if (!rootNodeId) return null;
            return {
                rootNodeId,
                nodes: cy.nodes().map(n => n.json()),
                edges: cy.edges().map(e => e.json()),
                expandedNodeIds: Array.from(expandedNodes)
            };
        }

        function restoreState(state) {
            cy.elements().remove();
            expandedNodes.clear();

            // Restore nodes and edges
            state.nodes.forEach(n => cy.add(n));
            state.edges.forEach(e => cy.add(e));

            // Restore expanded state
            rootNodeId = state.rootNodeId;
            state.expandedNodeIds.forEach(id => {
                expandedNodes.add(id);
                cy.getElementById(id).addClass('expanded');
            });

            cy.fit(null, 30);
            updateInfo();
            updateNavigationButtons();
        }

        function pushToHistory() {
            const state = saveCurrentState();
            if (!state) return;

            // Remove forward history
            history = history.slice(0, historyIndex + 1);
            history.push(state);
            historyIndex++;

            // Limit size
            if (history.length > 20) {
                history.shift();
                historyIndex--;
            }
            updateNavigationButtons();
        }

        function updateNavigationButtons() {
            const backBtn = document.getElementById('btnBack');
            const fwdBtn = document.getElementById('btnForward');
            if (backBtn) backBtn.disabled = historyIndex <= 0;
            if (fwdBtn) fwdBtn.disabled = historyIndex >= history.length - 1;
        }

        const cy = cytoscape({
            container: document.getElementById('cy'),
            wheelSensitivity: 0.2,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': getNodeColor,
                        'shape': 'ellipse',
                        'background-image': getNodeIcon,
                        'background-fit': 'contain',
                        'background-clip': 'node',
                        'background-width': '70%',
                        'background-height': '70%',
                        'label': 'data(label)',
                        'text-valign': 'bottom',
                        'text-margin-y': 5,
                        'font-size': 10,
                        'color': '#fff',
                        'text-outline-color': '#000',
                        'text-outline-width': 1,
                        'width': 36,
                        'height': 36
                    }
                },
                {
                    selector: 'node[type="solution"]',
                    style: { 'width': 44, 'height': 44, 'background-width': '55%', 'background-height': '55%' }
                },
                {
                    selector: 'node[type="layer"]',
                    style: { 'width': 40, 'height': 40, 'background-width': '55%', 'background-height': '55%' }
                },
                {
                    selector: 'node[type="project"]',
                    style: { 'width': 38, 'height': 38, 'background-width': '55%', 'background-height': '55%' }
                },
                {
                    selector: 'node[type="namespace"]',
                    style: { 'width': 36, 'height': 36, 'background-width': '55%', 'background-height': '55%' }
                },
                {
                    selector: 'node[type="method"], node[type="interfaceMethod"]',
                    style: { 'width': 32, 'height': 32 }
                },
                {
                    selector: 'node[?isCurrent]',
                    style: {
                        'border-width': 4,
                        'border-color': '#fff',
                        'width': 44,
                        'height': 44
                    }
                },
                {
                    selector: 'node[?expandable]',
                    style: {
                        'border-width': 2,
                        'border-color': '#fff',
                        'border-style': 'dashed'
                    }
                },
                {
                    selector: 'node.expanded',
                    style: {
                        'border-style': 'solid',
                        'border-color': '#4caf50'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': (ele) => edgeColors[ele.data('type')] || '#888',
                        'target-arrow-color': (ele) => edgeColors[ele.data('type')] || '#888',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 0.7
                    }
                },
                {
                    selector: 'edge[type="inherits"], edge[type="implements"]',
                    style: { 'line-style': 'dashed' }
                },
                {
                    selector: 'edge[type="hasMember"]',
                    style: { 'line-style': 'dotted', 'target-arrow-shape': 'none' }
                },
                {
                    selector: 'edge[type="dependsOn"]',
                    style: {
                        'width': 3,
                        'line-style': 'solid',
                        'line-color': '#ff5722',
                        'target-arrow-color': '#ff5722',
                        'target-arrow-shape': 'triangle',
                        'label': 'data(label)',
                        'font-size': 9,
                        'text-rotation': 'autorotate',
                        'text-margin-y': -10,
                        'color': '#ff5722'
                    }
                }
            ]
        });

        // Click to expand/collapse
        cy.on('tap', 'node', function(evt) {
            const node = evt.target;
            const nodeId = node.id();

            if (expandedNodes.has(nodeId)) {
                collapseNode(nodeId);
            } else {
                expandNode(nodeId);
            }
        });

        function expandNode(nodeId) {
            if (expandedNodes.has(nodeId)) return;
            expandedNodes.add(nodeId);
            cy.getElementById(nodeId).addClass('expanded');
            showLoading('Expanding...');
            vscode.postMessage({ type: 'expandNode', nodeId });
        }

        function collapseNode(nodeId) {
            if (!expandedNodes.has(nodeId)) return;

            const node = cy.getElementById(nodeId);
            const connectedEdges = node.connectedEdges();
            const nodesToRemove = [];

            connectedEdges.forEach(edge => {
                const otherNode = edge.source().id() === nodeId ? edge.target() : edge.source();
                const otherId = otherNode.id();

                if (otherId === rootNodeId || expandedNodes.has(otherId)) return;

                const otherConnections = otherNode.connectedEdges().filter(e => {
                    return e.source().id() !== nodeId && e.target().id() !== nodeId;
                });

                if (otherConnections.length === 0) {
                    nodesToRemove.push(otherId);
                }
            });

            nodesToRemove.forEach(id => cy.getElementById(id).remove());
            expandedNodes.delete(nodeId);
            node.removeClass('expanded');
            updateInfo();
        }

        // Right-click context menu
        cy.on('cxttap', 'node', function(evt) {
            evt.originalEvent.preventDefault();
            selectedNodeId = evt.target.id();
            const menu = document.getElementById('context-menu');
            const navigateItem = menu.querySelector('[data-action="navigate"]');

            // Hide "Go to File" for virtual nodes (layer:, project:)
            if (selectedNodeId.startsWith('layer:') || selectedNodeId.startsWith('project:')) {
                navigateItem.style.display = 'none';
            } else {
                navigateItem.style.display = '';
            }

            menu.style.left = evt.originalEvent.clientX + 'px';
            menu.style.top = evt.originalEvent.clientY + 'px';
            menu.style.display = 'block';
        });

        document.addEventListener('click', () => {
            document.getElementById('context-menu').style.display = 'none';
        });

        cy.on('tap', function(evt) {
            if (evt.target === cy) {
                document.getElementById('context-menu').style.display = 'none';
            }
        });

        // Context menu actions
        document.querySelectorAll('#context-menu .menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                document.getElementById('context-menu').style.display = 'none';
                if (!selectedNodeId) return;

                switch (action) {
                    case 'navigate':
                        vscode.postMessage({ type: 'navigateToNode', nodeId: selectedNodeId });
                        break;
                    case 'expand':
                        expandNode(selectedNodeId);
                        break;
                    case 'collapse':
                        collapseNode(selectedNodeId);
                        break;
                    case 'setRoot':
                        vscode.postMessage({ type: 'setAsRoot', nodeId: selectedNodeId });
                        break;
                }
            });
        });

        // Tooltip
        const tooltip = document.getElementById('tooltip');
        cy.on('mouseover', 'node', function(evt) {
            const data = evt.target.data();
            const nodeType = data.type || 'class';
            const nodeName = data.label.replace(/\\s*\\(\\d+\\)$/, ''); // Remove count from label

            let html = '<div class="tooltip-header">';
            html += '<span class="tooltip-type ' + nodeType + '">' + nodeType + '</span>';
            html += '<span class="tooltip-name">' + nodeName + '</span>';
            html += '</div>';

            html += '<div class="tooltip-body">';
            if (data.namespace) {
                html += '<div class="tooltip-row"><span class="tooltip-label">Namespace</span><span class="tooltip-value">' + data.namespace + '</span></div>';
            }
            if (data.project) {
                html += '<div class="tooltip-row"><span class="tooltip-label">Project</span><span class="tooltip-value">' + data.project + '</span></div>';
            }
            if (data.layer) {
                const layerColors = { presentation: '#ff7043', services: '#7e57c2', business: '#ffb74d', data: '#4fc3f7', shared: '#90a4ae' };
                const layerColor = layerColors[data.layer] || '#90a4ae';
                html += '<div class="tooltip-row"><span class="tooltip-label">Layer</span><span class="tooltip-value" style="color:' + layerColor + '">' + data.layer + '</span></div>';
            }
            if (data.accessibility) {
                html += '<div class="tooltip-row"><span class="tooltip-label">Access</span><span class="tooltip-value">' + data.accessibility + '</span></div>';
            }
            if (data.fullName) {
                html += '<div class="tooltip-fullname">' + data.fullName + '</div>';
            }
            html += '</div>';

            tooltip.innerHTML = html;

            // Position tooltip
            const pos = evt.target.renderedPosition();
            const container = document.getElementById('cy').getBoundingClientRect();
            let left = pos.x + 25;
            let top = pos.y - 10;

            // Adjust if tooltip goes off screen
            if (left + 300 > container.width) {
                left = pos.x - 250;
            }
            if (top + 150 > container.height) {
                top = pos.y - 100;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = Math.max(10, top) + 'px';
            tooltip.classList.add('visible');
        });

        cy.on('mouseout', 'node', () => tooltip.classList.remove('visible'));
        cy.on('pan zoom', () => tooltip.classList.remove('visible'));

        // Toolbar buttons
        document.getElementById('btnMaximize')?.addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleMaximize' });
        });
        document.getElementById('btnFit')?.addEventListener('click', () => cy.fit(null, 30));
        document.getElementById('btnReset')?.addEventListener('click', () => {
            if (rootNodeId) {
                cy.elements().forEach(ele => {
                    if (ele.isNode() && ele.id() !== rootNodeId) ele.remove();
                });
                expandedNodes.clear();
                cy.getElementById(rootNodeId).removeClass('expanded');
                cy.fit(null, 30);
                updateInfo();
            }
        });
        document.getElementById('btnHome')?.addEventListener('click', () => {
            vscode.postMessage({ type: 'goHome' });
        });
        document.getElementById('btnLock')?.addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleLock' });
        });
        document.getElementById('btnBack')?.addEventListener('click', () => {
            if (historyIndex > 0) {
                historyIndex--;
                restoreState(history[historyIndex]);
            }
        });
        document.getElementById('btnForward')?.addEventListener('click', () => {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                restoreState(history[historyIndex]);
            }
        });

        function showLoading(text) {
            document.getElementById('loadingText').textContent = text || 'Loading...';
            document.getElementById('loadingOverlay').classList.add('visible');
        }

        function hideLoading() {
            document.getElementById('loadingOverlay').classList.remove('visible');
        }

        function updateInfo() {
            document.getElementById('statusRight').textContent =
                'Nodes: ' + cy.nodes().length + ' | Edges: ' + cy.edges().length;
        }

        // Layout configuration
        let currentLayout = 'dagre';

        const layoutConfigs = {
            dagre: {
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 50,
                rankSep: 80,
                padding: 30
            },
            breadthfirst: {
                name: 'breadthfirst',
                directed: true,
                spacingFactor: 1.5,
                padding: 30
            },
            circle: {
                name: 'circle',
                padding: 30,
                avoidOverlap: true
            },
            concentric: {
                name: 'concentric',
                padding: 30,
                minNodeSpacing: 50,
                concentric: node => node.degree(),
                levelWidth: () => 2
            },
            grid: {
                name: 'grid',
                padding: 30,
                avoidOverlap: true,
                condense: true
            },
            cose: {
                name: 'cose',
                animate: false,
                nodeRepulsion: 6000,
                idealEdgeLength: 80,
                gravity: 0.3,
                padding: 30
            }
        };

        function runLayout(layoutName) {
            const layout = layoutName || currentLayout;
            const config = layoutConfigs[layout] || layoutConfigs.dagre;
            cy.layout({ ...config, animate: false }).run();
        }

        function setLayout(layoutName) {
            currentLayout = layoutName;
            runLayout(layoutName);

            // Update active state in dropdown
            document.querySelectorAll('.layout-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.layout === layoutName);
            });
        }

        // Messages from extension
        window.addEventListener('message', event => {
            const msg = event.data;

            try {
                switch (msg.type) {
                    case 'initGraph':
                        // Save current state before loading new graph
                        if (rootNodeId && cy.nodes().length > 0 && msg.pushToHistory !== false) {
                            pushToHistory();
                        }

                        cy.elements().remove();
                        expandedNodes.clear();
                        rootNodeId = msg.rootNodeId;
                        cy.add(msg.rootNode);
                        cy.fit(null, 50);
                        updateInfo();
                        hideLoading();
                        updateNavigationButtons();

                        // Auto-expand if only root node (single node should show expanded)
                        if (cy.nodes().length === 1 && msg.autoExpand !== false) {
                            setTimeout(() => expandNode(rootNodeId), 100);
                        }
                        break;

                    case 'initMultipleRoots':
                        // Save current state before loading new graph
                        if (rootNodeId && cy.nodes().length > 0) {
                            pushToHistory();
                        }

                        cy.elements().remove();
                        expandedNodes.clear();
                        rootNodeId = null; // No single root

                        console.log('[Grafo] initMultipleRoots - nodes:', msg.nodes?.length, 'edges:', msg.edges?.length);

                        // Add all root nodes
                        if (msg.nodes) {
                            msg.nodes.forEach(node => cy.add(node));
                        }
                        if (msg.edges) {
                            msg.edges.forEach(edge => {
                                console.log('[Grafo] Adding edge:', edge.data.id, edge.data.source, '->', edge.data.target);
                                cy.add(edge);
                            });
                        }

                        // Use current layout or default to dagre for hierarchical display
                        runLayout();

                        cy.fit(null, 50);
                        updateInfo();
                        hideLoading();
                        updateNavigationButtons();
                        break;

                    case 'addRelationships':
                        try {
                            const existingIds = new Set(cy.nodes().map(n => n.id()));
                            const existingFullNames = new Set(cy.nodes().map(n => n.data('fullName')).filter(fn => fn));
                            if (msg.nodes && Array.isArray(msg.nodes)) {
                                msg.nodes.forEach(node => {
                                    if (node && node.data && node.data.id) {
                                        // Check both ID and fullName to avoid cross-project duplicates
                                        const isDuplicate = existingIds.has(node.data.id) ||
                                            (node.data.fullName && existingFullNames.has(node.data.fullName));
                                        if (!isDuplicate) {
                                            cy.add(node);
                                            existingIds.add(node.data.id);
                                            if (node.data.fullName) existingFullNames.add(node.data.fullName);
                                        }
                                    }
                                });
                            }
                            const existingEdgeIds = new Set(cy.edges().map(e => e.id()));
                            if (msg.edges && Array.isArray(msg.edges)) {
                                msg.edges.forEach(edge => {
                                    if (edge && edge.data && edge.data.id &&
                                        !existingEdgeIds.has(edge.data.id) &&
                                        cy.getElementById(edge.data.source).length > 0 &&
                                        cy.getElementById(edge.data.target).length > 0) {
                                        cy.add(edge);
                                    }
                                });
                            }
                            runLayout();
                            updateInfo();
                        } catch (e) {
                            console.error('[Grafo] Error processing relationships:', e);
                        } finally {
                            hideLoading();
                        }
                        break;

                case 'clear':
                    cy.elements().remove();
                    expandedNodes.clear();
                    rootNodeId = null;
                    document.getElementById('info').textContent = 'Select a class or method';
                    updateInfo();
                    break;

                case 'showLoading':
                    showLoading(msg.text);
                    break;

                case 'hideLoading':
                    hideLoading();
                    break;

                case 'homeModeChanged':
                    const indicator = document.getElementById('homeModeIndicator');
                    const homeBtn = document.getElementById('btnHome');
                    if (msg.homeMode) {
                        indicator.style.display = 'inline';
                        homeBtn.style.color = '#4caf50';
                        homeBtn.title = 'Home Mode Active (click to exit)';
                    } else {
                        indicator.style.display = 'none';
                        homeBtn.style.color = '';
                        homeBtn.title = 'Home (Navigate to solutions root)';
                    }
                    break;

                case 'lockModeChanged':
                    const lockIndicator = document.getElementById('lockIndicator');
                    const lockBtn = document.getElementById('btnLock');
                    if (msg.locked) {
                        lockIndicator.style.display = 'inline';
                        lockBtn.style.color = '#ff9800';
                        lockBtn.title = 'Locked (click to unlock)';
                    } else {
                        lockIndicator.style.display = 'none';
                        lockBtn.style.color = '';
                        lockBtn.title = 'Lock graph (prevent changes on code selection)';
                    }
                    break;

                case 'searchResults':
                    displaySearchResults(msg.results || []);
                    break;
                }
            } catch (error) {
                console.error('[Grafo] Error handling message:', error);
                hideLoading();
            }
        });

        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        const searchExact = document.getElementById('searchExact');
        let searchTimeout = null;

        function triggerSearch() {
            const rawQuery = searchInput.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);

            // Parse query: "name, project/namespace" format
            let query = rawQuery;
            let projectFilter = '';

            if (rawQuery.includes(',')) {
                const parts = rawQuery.split(',').map(p => p.trim());
                query = parts[0];
                projectFilter = parts[1] || '';
            }

            if (query.length < 2) {
                searchResults.classList.remove('visible');
                return;
            }

            const exactFirst = searchExact ? searchExact.checked : true;

            searchTimeout = setTimeout(() => {
                vscode.postMessage({ type: 'search', query, projectFilter, exactFirst });
            }, 300);
        }

        if (searchInput) {
            searchInput.addEventListener('input', triggerSearch);

            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length >= 2 && searchResults.children.length > 0) {
                    searchResults.classList.add('visible');
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) {
                    searchResults.classList.remove('visible');
                }
            });

            // Keyboard navigation
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchResults.classList.remove('visible');
                    searchInput.blur();
                }
            });
        }

        // Re-search when checkbox changes
        if (searchExact) {
            searchExact.addEventListener('change', () => {
                if (searchInput && searchInput.value.trim().length >= 2) {
                    triggerSearch();
                }
            });
        }

        // Layout selector
        const btnLayout = document.getElementById('btnLayout');
        const layoutDropdown = document.getElementById('layoutDropdown');

        if (btnLayout && layoutDropdown) {
            btnLayout.addEventListener('click', (e) => {
                e.stopPropagation();
                layoutDropdown.classList.toggle('visible');
                // Close search results if open
                if (searchResults) searchResults.classList.remove('visible');
            });

            // Handle layout option clicks
            layoutDropdown.querySelectorAll('.layout-option').forEach(option => {
                option.addEventListener('click', () => {
                    const layoutName = option.dataset.layout;
                    setLayout(layoutName);
                    layoutDropdown.classList.remove('visible');
                });
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.layout-selector')) {
                    layoutDropdown.classList.remove('visible');
                }
            });

            // Mark initial layout as active
            layoutDropdown.querySelector('[data-layout="dagre"]').classList.add('active');
        }

        function displaySearchResults(results) {
            if (!searchResults) return;

            if (results.length === 0) {
                searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
            } else {
                searchResults.innerHTML = results.map(r => {
                    // Extract container class from fullName
                    // e.g., "Namespace.ClassName.MethodName" -> "ClassName.MethodName"
                    let displayName = r.name;
                    let containerClass = '';
                    if (r.fullName && r.namespace) {
                        const afterNamespace = r.fullName.substring(r.namespace.length + 1);
                        if (afterNamespace.includes('.')) {
                            displayName = afterNamespace; // e.g., "GeolocationService.UpdateCity"
                            containerClass = afterNamespace.split('.')[0]; // e.g., "GeolocationService"
                        }
                    }

                    // Check if container is an interface (starts with I + uppercase)
                    const isFromInterface = containerClass && /^I[A-Z]/.test(containerClass);
                    const interfaceBadge = isFromInterface ? '<span class="search-result-interface-badge">I</span>' : '';

                    return \`
                    <div class="search-result-item" data-id="\${r.id}">
                        <div class="search-result-row">
                            \${interfaceBadge}<span class="search-result-type \${r.kind}">\${r.kind}</span>
                            <span class="search-result-name">\${displayName}</span>
                        </div>
                        <div class="search-result-details">
                            <span class="search-result-namespace">\${r.namespace || ''}</span>
                            <span class="search-result-solution">[\${r.solution || ''}]</span>
                            <span class="search-result-project">\${r.project || ''}</span>
                        </div>
                    </div>
                \`}).join('');

                // Add click handlers
                searchResults.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const nodeId = item.dataset.id;
                        searchResults.classList.remove('visible');
                        searchInput.value = '';
                        vscode.postMessage({ type: 'setAsRoot', nodeId });
                    });
                });
            }
            searchResults.classList.add('visible');
        }
    </script>
</body>
</html>`;
}
