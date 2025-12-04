/**
 * Grafo Panel - Main dockable panel for code graph visualization
 * Uses shared graphService for Lazy Expand Nodes pattern
 * History is managed in the webview for proper state preservation
 */
import * as vscode from 'vscode';
import { getClient } from '../api/grafoClient';
import { GraphNode } from '../types';
import { logger } from '../logger';
import {
    createCytoscapeNode,
    getNodeRelationships,
    getLayerRelationships,
    getProjectRelationships,
    getNamespaceRelationships,
    generateGraphWebviewHtml,
    getSolutions,
    createRootGraphData
} from '../services/graphService';

export class GrafoPanel {
    public static currentPanel: GrafoPanel | undefined;
    public static readonly viewType = 'grafoPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentNode: GraphNode | null = null;
    private _isHomeMode: boolean = false;
    private _isLocked: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri, viewColumn: vscode.ViewColumn = vscode.ViewColumn.Two) {
        if (GrafoPanel.currentPanel) {
            GrafoPanel.currentPanel._panel.reveal(viewColumn);
            return GrafoPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            GrafoPanel.viewType,
            'Grafo Explorer',
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        GrafoPanel.currentPanel = new GrafoPanel(panel, extensionUri);
        return GrafoPanel.currentPanel;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        GrafoPanel.currentPanel = new GrafoPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        const config = vscode.workspace.getConfiguration('grafo');
        const version = config.get<string>('graphVersion', '6.5.0');

        this._panel.webview.html = generateGraphWebviewHtml({
            showToolbar: true,
            showLegend: true,
            showStatusBar: true,
            showSearch: true,
            version
        });

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                const client = getClient();

                switch (message.type) {
                    case 'expandNode':
                        logger.debug(`[GrafoPanel] Expanding node: ${message.nodeId}`);
                        let panelNodes: any[] = [];
                        let panelEdges: any[] = [];
                        if (!client) {
                            logger.warn('[GrafoPanel] No client available');
                            this._panel.webview.postMessage({
                                type: 'addRelationships',
                                sourceId: message.nodeId,
                                nodes: [],
                                edges: []
                            });
                            break;
                        }
                        try {
                            // Handle virtual layer nodes (layer:name)
                            if (message.nodeId.startsWith('layer:')) {
                                const layerName = message.nodeId.replace('layer:', '');
                                const layerRelationships = await getLayerRelationships(layerName, message.nodeId);
                                panelNodes = layerRelationships.nodes;
                                panelEdges = layerRelationships.edges;
                            }
                            // Handle virtual project nodes (project:name)
                            else if (message.nodeId.startsWith('project:')) {
                                const projectName = message.nodeId.replace('project:', '');
                                const projectRelationships = await getProjectRelationships(projectName, message.nodeId);
                                panelNodes = projectRelationships.nodes;
                                panelEdges = projectRelationships.edges;
                            }
                            // Handle virtual namespace nodes (ns:projectName:namespace)
                            else if (message.nodeId.startsWith('ns:')) {
                                const parts = message.nodeId.split(':');
                                if (parts.length >= 3) {
                                    const projectName = parts[1];
                                    const namespace = parts.slice(2).join(':');
                                    const nsRelationships = await getNamespaceRelationships(projectName, namespace, message.nodeId);
                                    panelNodes = nsRelationships.nodes;
                                    panelEdges = nsRelationships.edges;
                                }
                            }
                            // Handle regular nodes
                            else {
                                const node = await client.getNodeById(message.nodeId);
                                if (node) {
                                    const relationships = await getNodeRelationships(node);
                                    panelNodes = relationships.nodes;
                                    panelEdges = relationships.edges;
                                    logger.debug(`[GrafoPanel] Got ${panelNodes.length} nodes, ${panelEdges.length} edges`);
                                } else {
                                    logger.warn(`[GrafoPanel] Node not found: ${message.nodeId}`);
                                }
                            }
                        } catch (e: any) {
                            logger.error(`[GrafoPanel] Error expanding node: ${e.message}`);
                        } finally {
                            // ALWAYS send response to hide loading overlay
                            logger.info(`[GrafoPanel] Sending response: ${panelNodes.length} nodes, ${panelEdges.length} edges`);
                            this._panel.webview.postMessage({
                                type: 'addRelationships',
                                sourceId: message.nodeId,
                                nodes: panelNodes,
                                edges: panelEdges
                            });
                        }
                        break;

                    case 'navigateToNode':
                        // Skip virtual nodes (no source file)
                        if (message.nodeId.startsWith('layer:') || message.nodeId.startsWith('project:') || message.nodeId.startsWith('ns:')) {
                            break;
                        }
                        if (client) {
                            const navNode = await client.getNodeById(message.nodeId);
                            if (navNode?.source?.file) {
                                vscode.commands.executeCommand('grafo.navigateToNode', navNode);
                            }
                        }
                        break;

                    case 'setAsRoot':
                        // Handle virtual layer nodes
                        if (message.nodeId.startsWith('layer:')) {
                            const layerName = message.nodeId.replace('layer:', '');
                            this._currentNode = null;
                            this._panel.webview.postMessage({
                                type: 'initGraph',
                                rootNode: {
                                    data: {
                                        id: message.nodeId,
                                        label: layerName.toUpperCase(),
                                        type: 'layer',
                                        layer: layerName,
                                        expandable: true,
                                        isCurrent: true
                                    }
                                },
                                rootNodeId: message.nodeId
                            });
                            break;
                        }

                        // Handle virtual project nodes
                        if (message.nodeId.startsWith('project:')) {
                            const projectName = message.nodeId.replace('project:', '');
                            this._currentNode = null;
                            this._panel.webview.postMessage({
                                type: 'initGraph',
                                rootNode: {
                                    data: {
                                        id: message.nodeId,
                                        label: projectName,
                                        type: 'project',
                                        project: projectName,
                                        expandable: true,
                                        isCurrent: true
                                    }
                                },
                                rootNodeId: message.nodeId
                            });
                            break;
                        }

                        // Handle virtual namespace nodes (ns:projectName:namespace)
                        if (message.nodeId.startsWith('ns:')) {
                            const parts = message.nodeId.split(':');
                            if (parts.length >= 3) {
                                const projectName = parts[1];
                                const namespace = parts.slice(2).join(':');
                                const lastSegment = namespace.split('.').pop() || namespace;
                                this._currentNode = null;
                                this._panel.webview.postMessage({
                                    type: 'initGraph',
                                    rootNode: {
                                        data: {
                                            id: message.nodeId,
                                            label: lastSegment,
                                            type: 'namespace',
                                            fullName: namespace,
                                            project: projectName,
                                            expandable: true,
                                            isCurrent: true
                                        }
                                    },
                                    rootNodeId: message.nodeId
                                });
                            }
                            break;
                        }

                        // Handle regular nodes
                        if (client) {
                            const rootNode = await client.getNodeById(message.nodeId);
                            if (rootNode) {
                                this._currentNode = rootNode;
                                this._panel.webview.postMessage({
                                    type: 'initGraph',
                                    rootNode: createCytoscapeNode(rootNode, true),
                                    rootNodeId: rootNode.id
                                });
                            }
                        }
                        break;

                    case 'goHome':
                        await this._toggleHomeMode();
                        break;

                    case 'toggleLock':
                        this._toggleLock();
                        break;

                    case 'toggleMaximize':
                        vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
                        break;

                    case 'search':
                        if (client && message.query) {
                            try {
                                // Search with optional project/namespace filter and exact mode
                                const projectFilter = message.projectFilter || undefined;
                                const exactFirst = message.exactFirst !== false; // default true
                                // Request more to account for duplicates that will be filtered
                                let results = await client.searchNodes(message.query, undefined, projectFilter, 50, exactFirst);

                                // If projectFilter provided but not exact project match, also filter by namespace
                                if (projectFilter && results.length > 0) {
                                    const filterLower = projectFilter.toLowerCase();
                                    results = results.filter(n =>
                                        (n.project && n.project.toLowerCase().includes(filterLower)) ||
                                        (n.namespace && n.namespace.toLowerCase().includes(filterLower)) ||
                                        (n.fullName && n.fullName.toLowerCase().includes(filterLower))
                                    );
                                }

                                this._panel.webview.postMessage({
                                    type: 'searchResults',
                                    results: results.slice(0, 20).map(n => ({
                                        id: n.id,
                                        name: n.name,
                                        kind: n.kind,
                                        namespace: n.namespace,
                                        project: n.project,
                                        solution: n.solution,
                                        fullName: n.fullName
                                    }))
                                });
                            } catch (e: any) {
                                logger.error(`[GrafoPanel] Search error: ${e.message}`);
                                this._panel.webview.postMessage({
                                    type: 'searchResults',
                                    results: []
                                });
                            }
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        GrafoPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }

    public get isLocked(): boolean {
        return this._isLocked || this._isHomeMode;
    }

    public get isHomeMode(): boolean {
        return this._isHomeMode;
    }

    private _toggleLock() {
        this._isLocked = !this._isLocked;
        logger.info(`[GrafoPanel] Lock mode: ${this._isLocked ? 'ON' : 'OFF'}`);

        this._panel.webview.postMessage({
            type: 'lockModeChanged',
            locked: this._isLocked
        });
    }

    private async _toggleHomeMode() {
        this._isHomeMode = !this._isHomeMode;
        logger.info(`[GrafoPanel] Home mode: ${this._isHomeMode ? 'ON' : 'OFF'}`);

        this._panel.webview.postMessage({
            type: 'homeModeChanged',
            homeMode: this._isHomeMode
        });

        if (this._isHomeMode) {
            await this._loadSolutions();
        }
    }

    private async _loadSolutions() {
        try {
            const solutions = await getSolutions();
            if (solutions.length > 0) {
                logger.debug(`[GrafoPanel] Loading ${solutions.length} solutions as root`);
                this._currentNode = null; // Multiple roots

                const graphData = await createRootGraphData(solutions);
                logger.debug(`[GrafoPanel] Graph data: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
                this._panel.webview.postMessage({
                    type: 'initMultipleRoots',
                    ...graphData
                });
            } else {
                logger.warn('[GrafoPanel] No solutions found');
            }
        } catch (e: any) {
            logger.error(`[GrafoPanel] _loadSolutions error: ${e.message}`);
        }
    }

    public setHomeMode(enabled: boolean) {
        this._isHomeMode = enabled;
        this._panel.webview.postMessage({
            type: 'homeModeChanged',
            homeMode: this._isHomeMode
        });
    }

    public async loadForClass(node: GraphNode) {
        await this.loadForNode(node);
    }

    /**
     * Load a node as root - respects home mode lock
     */
    public async loadForNode(node: GraphNode) {
        if (this._isHomeMode) {
            return; // Locked in home mode
        }

        this._currentNode = node;

        logger.debug(`[GrafoPanel] Loading root node: ${node.name}`);

        this._panel.webview.postMessage({
            type: 'initGraph',
            rootNode: createCytoscapeNode(node, true),
            rootNodeId: node.id
        });
    }

    public clear() {
        this._currentNode = null;
        this._panel.webview.postMessage({ type: 'clear' });
    }
}
