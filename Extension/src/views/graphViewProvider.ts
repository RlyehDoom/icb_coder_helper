/**
 * Cytoscape Graph WebView Provider
 * Visual graph that changes based on current file/class
 * Detects inherited ICBanking classes and displays from base class
 */
import * as vscode from 'vscode';
import { getClient } from '../api/grafoClient';
import { GraphNode, CytoscapeNode, CytoscapeEdge } from '../types';

export class GraphViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'grafo.graphView';

    private _view?: vscode.WebviewView;
    private _currentNode: GraphNode | null = null;

    constructor(private readonly _extensionUri: vscode.Uri) {}

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

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'nodeClick') {
                const client = getClient();
                if (client) {
                    const node = await client.getNodeById(data.nodeId);
                    if (node?.source?.file) {
                        vscode.commands.executeCommand('grafo.navigateToNode', node);
                    }
                }
            }
        });
    }

    public async loadForNode(node: GraphNode) {
        this._currentNode = node;

        if (!this._view) return;

        const client = getClient();
        if (!client) return;

        try {
            const nodes: CytoscapeNode[] = [];
            const edges: CytoscapeEdge[] = [];
            const addedNodes = new Set<string>();

            // Add current node
            nodes.push({
                data: {
                    id: node.id,
                    label: node.name,
                    type: node.kind,
                    layer: node.layer,
                    project: node.project,
                    isCurrent: true
                }
            });
            addedNodes.add(node.id);

            // Add calls (outgoing)
            if (node.calls) {
                for (const callId of node.calls.slice(0, 10)) {
                    const callee = await client.getNodeById(callId);
                    if (callee && !addedNodes.has(callId)) {
                        nodes.push({
                            data: {
                                id: callId,
                                label: callee.name,
                                type: callee.kind,
                                layer: callee.layer,
                                project: callee.project
                            }
                        });
                        addedNodes.add(callId);
                    }
                    edges.push({
                        data: {
                            id: `${node.id}-calls-${callId}`,
                            source: node.id,
                            target: callId,
                            type: 'calls'
                        }
                    });
                }
            }

            // Add callsVia (via interface)
            if (node.callsVia) {
                for (const viaId of node.callsVia.slice(0, 5)) {
                    const viaNode = await client.getNodeById(viaId);
                    if (viaNode && !addedNodes.has(viaId)) {
                        nodes.push({
                            data: {
                                id: viaId,
                                label: viaNode.name,
                                type: viaNode.kind,
                                layer: viaNode.layer,
                                project: viaNode.project
                            }
                        });
                        addedNodes.add(viaId);
                    }
                    edges.push({
                        data: {
                            id: `${node.id}-callsVia-${viaId}`,
                            source: node.id,
                            target: viaId,
                            type: 'callsVia'
                        }
                    });
                }
            }

            // Add implements
            if (node.implements) {
                for (const implId of node.implements) {
                    const implNode = await client.getNodeById(implId);
                    if (implNode && !addedNodes.has(implId)) {
                        nodes.push({
                            data: {
                                id: implId,
                                label: implNode.name,
                                type: implNode.kind,
                                layer: implNode.layer,
                                project: implNode.project
                            }
                        });
                        addedNodes.add(implId);
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

            // Add inherits
            if (node.inherits) {
                for (const inheritId of node.inherits) {
                    const inheritNode = await client.getNodeById(inheritId);
                    if (inheritNode && !addedNodes.has(inheritId)) {
                        nodes.push({
                            data: {
                                id: inheritId,
                                label: inheritNode.name,
                                type: inheritNode.kind,
                                layer: inheritNode.layer,
                                project: inheritNode.project
                            }
                        });
                        addedNodes.add(inheritId);
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

            // Add callers (for methods)
            if (node.kind === 'method') {
                try {
                    const callers = await client.findCallers(node.id, 1);
                    for (const { node: caller } of callers.callers.slice(0, 5)) {
                        if (!addedNodes.has(caller.id)) {
                            nodes.push({
                                data: {
                                    id: caller.id,
                                    label: caller.name,
                                    type: caller.kind,
                                    layer: caller.layer,
                                    project: caller.project
                                }
                            });
                            addedNodes.add(caller.id);
                        }
                        edges.push({
                            data: {
                                id: `${caller.id}-calls-${node.id}`,
                                source: caller.id,
                                target: node.id,
                                type: 'calls'
                            }
                        });
                    }
                } catch (e) {
                    // Ignore callers errors
                }
            }

            // Send data to webview
            this._view.webview.postMessage({
                type: 'updateGraph',
                nodes,
                edges,
                centerNodeId: node.id
            });

        } catch (e) {
            console.error('Graph view error:', e);
        }
    }

    public clear() {
        this._currentNode = null;
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grafo Graph</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
        }
        #cy {
            width: 100%;
            height: 100vh;
        }
        #info {
            position: absolute;
            top: 10px;
            left: 10px;
            background: var(--vscode-input-background);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 11px;
            opacity: 0.9;
        }
        #legend {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: var(--vscode-input-background);
            padding: 8px;
            border-radius: 4px;
            font-size: 10px;
        }
        .legend-item { display: flex; align-items: center; margin: 2px 0; }
        .legend-color { width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; }
    </style>
</head>
<body>
    <div id="cy"></div>
    <div id="info">Select a class or method to visualize</div>
    <div id="legend">
        <div class="legend-item"><span class="legend-color" style="background:#4fc3f7"></span>Class</div>
        <div class="legend-item"><span class="legend-color" style="background:#81c784"></span>Interface</div>
        <div class="legend-item"><span class="legend-color" style="background:#ffb74d"></span>Method</div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        const colors = {
            class: '#4fc3f7',
            interface: '#81c784',
            method: '#ffb74d',
            property: '#ce93d8',
            enum: '#f48fb1',
            default: '#90a4ae'
        };

        const edgeColors = {
            calls: '#64b5f6',
            callsVia: '#4db6ac',
            implements: '#81c784',
            inherits: '#ba68c8',
            uses: '#90a4ae'
        };

        let cy = cytoscape({
            container: document.getElementById('cy'),
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': (ele) => colors[ele.data('type')] || colors.default,
                        'label': 'data(label)',
                        'text-valign': 'bottom',
                        'text-margin-y': 5,
                        'font-size': 10,
                        'color': '#fff',
                        'text-outline-color': '#000',
                        'text-outline-width': 1,
                        'width': 30,
                        'height': 30
                    }
                },
                {
                    selector: 'node[?isCurrent]',
                    style: {
                        'border-width': 3,
                        'border-color': '#fff',
                        'width': 40,
                        'height': 40
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
                        'arrow-scale': 0.8
                    }
                },
                {
                    selector: 'edge[type="inherits"]',
                    style: {
                        'line-style': 'dashed',
                        'target-arrow-shape': 'triangle-tee'
                    }
                },
                {
                    selector: 'edge[type="implements"]',
                    style: {
                        'line-style': 'dotted'
                    }
                }
            ],
            layout: { name: 'cose', animate: false }
        });

        cy.on('tap', 'node', function(evt) {
            const node = evt.target;
            vscode.postMessage({
                type: 'nodeClick',
                nodeId: node.id()
            });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.type === 'updateGraph') {
                cy.elements().remove();

                if (message.nodes.length > 0) {
                    cy.add(message.nodes);
                    cy.add(message.edges);

                    cy.layout({
                        name: 'cose',
                        animate: false,
                        nodeRepulsion: 8000,
                        idealEdgeLength: 100,
                        gravity: 0.25
                    }).run();

                    // Center on current node
                    if (message.centerNodeId) {
                        const centerNode = cy.getElementById(message.centerNodeId);
                        if (centerNode.length > 0) {
                            cy.center(centerNode);
                        }
                    }

                    document.getElementById('info').textContent =
                        'Nodes: ' + message.nodes.length + ' | Edges: ' + message.edges.length;
                }
            } else if (message.type === 'clear') {
                cy.elements().remove();
                document.getElementById('info').textContent = 'Select a class or method to visualize';
            }
        });
    </script>
</body>
</html>`;
    }
}
