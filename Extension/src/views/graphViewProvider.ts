/**
 * Cytoscape Graph WebView Provider (Sidebar)
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

export class GraphViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'grafo.graphView';

    private _view?: vscode.WebviewView;
    private _currentNode: GraphNode | null = null;
    private _isHomeMode: boolean = false;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public get currentNode(): GraphNode | null {
        return this._currentNode;
    }

    public get isHomeMode(): boolean {
        return this._isHomeMode;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = generateGraphWebviewHtml({
            showToolbar: true,
            showLegend: false,
            showStatusBar: true,
            showTooltip: false
        });

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            const client = getClient();

            switch (data.type) {
                case 'expandNode':
                    logger.debug(`[GraphView] Expanding node: ${data.nodeId}`);
                    let expandNodes: any[] = [];
                    let expandEdges: any[] = [];
                    if (!client) {
                        logger.warn('[GraphView] No client available');
                        this._view?.webview.postMessage({
                            type: 'addRelationships',
                            sourceId: data.nodeId,
                            nodes: [],
                            edges: []
                        });
                        break;
                    }
                    try {
                        // Handle virtual layer nodes (layer:name)
                        if (data.nodeId.startsWith('layer:')) {
                            const layerName = data.nodeId.replace('layer:', '');
                            const layerRelationships = await getLayerRelationships(layerName, data.nodeId);
                            expandNodes = layerRelationships.nodes;
                            expandEdges = layerRelationships.edges;
                        }
                        // Handle virtual project nodes (project:name)
                        else if (data.nodeId.startsWith('project:')) {
                            const projectName = data.nodeId.replace('project:', '');
                            const projectRelationships = await getProjectRelationships(projectName, data.nodeId);
                            expandNodes = projectRelationships.nodes;
                            expandEdges = projectRelationships.edges;
                        }
                        // Handle virtual namespace nodes (ns:projectName:namespace)
                        else if (data.nodeId.startsWith('ns:')) {
                            // Format: ns:projectName:namespace
                            const parts = data.nodeId.split(':');
                            if (parts.length >= 3) {
                                const projectName = parts[1];
                                const namespace = parts.slice(2).join(':'); // Handle namespace that might contain colons
                                const nsRelationships = await getNamespaceRelationships(projectName, namespace, data.nodeId);
                                expandNodes = nsRelationships.nodes;
                                expandEdges = nsRelationships.edges;
                            }
                        }
                        // Handle regular nodes
                        else {
                            const node = await client.getNodeById(data.nodeId);
                            if (node) {
                                const relationships = await getNodeRelationships(node);
                                expandNodes = relationships.nodes;
                                expandEdges = relationships.edges;
                                logger.debug(`[GraphView] Got ${expandNodes.length} nodes, ${expandEdges.length} edges`);
                            } else {
                                logger.warn(`[GraphView] Node not found: ${data.nodeId}`);
                            }
                        }
                    } catch (e: any) {
                        logger.error(`[GraphView] Error expanding node: ${e.message}`);
                    } finally {
                        // ALWAYS send response to hide loading overlay
                        logger.info(`[GraphView] Sending response: ${expandNodes.length} nodes, ${expandEdges.length} edges`);
                        this._view?.webview.postMessage({
                            type: 'addRelationships',
                            sourceId: data.nodeId,
                            nodes: expandNodes,
                            edges: expandEdges
                        });
                    }
                    break;

                case 'navigateToNode':
                    // Skip virtual nodes (no source file)
                    if (data.nodeId.startsWith('layer:') || data.nodeId.startsWith('project:') || data.nodeId.startsWith('ns:')) {
                        break;
                    }
                    if (client) {
                        const navNode = await client.getNodeById(data.nodeId);
                        if (navNode?.source?.file) {
                            vscode.commands.executeCommand('grafo.navigateToNode', navNode);
                        }
                    }
                    break;

                case 'setAsRoot':
                    // Handle virtual layer nodes
                    if (data.nodeId.startsWith('layer:')) {
                        const layerName = data.nodeId.replace('layer:', '');
                        this._currentNode = null;
                        this._view?.webview.postMessage({
                            type: 'initGraph',
                            rootNode: {
                                data: {
                                    id: data.nodeId,
                                    label: layerName.toUpperCase(),
                                    type: 'layer',
                                    layer: layerName,
                                    expandable: true,
                                    isCurrent: true
                                }
                            },
                            rootNodeId: data.nodeId
                        });
                        break;
                    }

                    // Handle virtual project nodes
                    if (data.nodeId.startsWith('project:')) {
                        const projectName = data.nodeId.replace('project:', '');
                        this._currentNode = null;
                        this._view?.webview.postMessage({
                            type: 'initGraph',
                            rootNode: {
                                data: {
                                    id: data.nodeId,
                                    label: projectName,
                                    type: 'project',
                                    project: projectName,
                                    expandable: true,
                                    isCurrent: true
                                }
                            },
                            rootNodeId: data.nodeId
                        });
                        break;
                    }

                    // Handle virtual namespace nodes (ns:projectName:namespace)
                    if (data.nodeId.startsWith('ns:')) {
                        const parts = data.nodeId.split(':');
                        if (parts.length >= 3) {
                            const projectName = parts[1];
                            const namespace = parts.slice(2).join(':');
                            const lastSegment = namespace.split('.').pop() || namespace;
                            this._currentNode = null;
                            this._view?.webview.postMessage({
                                type: 'initGraph',
                                rootNode: {
                                    data: {
                                        id: data.nodeId,
                                        label: lastSegment,
                                        type: 'namespace',
                                        fullName: namespace,
                                        project: projectName,
                                        expandable: true,
                                        isCurrent: true
                                    }
                                },
                                rootNodeId: data.nodeId
                            });
                        }
                        break;
                    }

                    // Handle regular nodes
                    if (client) {
                        const rootNode = await client.getNodeById(data.nodeId);
                        if (rootNode) {
                            this._currentNode = rootNode;
                            this._view?.webview.postMessage({
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
            }
        });
    }

    private async _toggleHomeMode() {
        this._isHomeMode = !this._isHomeMode;
        logger.info(`[GraphView] Home mode: ${this._isHomeMode ? 'ON' : 'OFF'}`);

        this._view?.webview.postMessage({
            type: 'homeModeChanged',
            homeMode: this._isHomeMode
        });

        if (this._isHomeMode) {
            await this._loadSolutions();
        }

        // Fire event for extension to handle
        this._onHomeModeChanged.fire(this._isHomeMode);
    }

    // Event emitter for home mode changes
    private _onHomeModeChanged = new vscode.EventEmitter<boolean>();
    public readonly onHomeModeChanged = this._onHomeModeChanged.event;

    private async _loadSolutions() {
        const solutions = await getSolutions();
        if (solutions.length > 0) {
            logger.info(`[GraphView] Loading ${solutions.length} solutions as root`);
            this._currentNode = null; // Multiple roots

            const graphData = await createRootGraphData(solutions);
            this._view?.webview.postMessage({
                type: 'initMultipleRoots',
                ...graphData
            });
        } else {
            logger.warn('[GraphView] No solutions found');
        }
    }

    public setHomeMode(enabled: boolean) {
        this._isHomeMode = enabled;
        this._view?.webview.postMessage({
            type: 'homeModeChanged',
            homeMode: this._isHomeMode
        });
    }

    /**
     * Load a node as root - respects home mode lock
     */
    public async loadForNode(node: GraphNode) {
        if (this._isHomeMode) {
            return; // Locked in home mode
        }

        this._currentNode = node;

        if (!this._view) return;

        logger.debug(`[GraphView] Loading root node: ${node.name}`);

        this._view.webview.postMessage({
            type: 'initGraph',
            rootNode: createCytoscapeNode(node, true),
            rootNodeId: node.id
        });
    }

    public clear() {
        this._currentNode = null;
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear' });
        }
    }
}
