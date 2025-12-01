/**
 * Grafo Panel - Unified dockable panel for all Grafo widgets
 * Can be opened as a separate editor panel (right side) for side-by-side coding
 */
import * as vscode from 'vscode';
import { getClient } from '../api/grafoClient';
import { GraphNode, CytoscapeNode, CytoscapeEdge } from '../types';
import { logger } from '../logger';

export class GrafoPanel {
    public static currentPanel: GrafoPanel | undefined;
    public static readonly viewType = 'grafoPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentNode: GraphNode | null = null;
    private _currentClass: GraphNode | null = null;
    private _isLocked: boolean = false;
    private _history: GraphNode[] = [];
    private _historyIndex: number = -1;
    private _maxHistory: number = 10;
    private _isNavigating: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri, viewColumn: vscode.ViewColumn = vscode.ViewColumn.Two) {
        // If panel exists, reveal it
        if (GrafoPanel.currentPanel) {
            GrafoPanel.currentPanel._panel.reveal(viewColumn);
            return GrafoPanel.currentPanel;
        }

        // Create new panel
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

        // Set panel content
        this._update();

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'nodeClick':
                        const client = getClient();
                        if (client) {
                            const node = await client.getNodeById(message.nodeId);
                            if (node) {
                                // If it's an interface or interface method, try to find implementation
                                if (node.kind === 'interface' || (node.kind === 'method' && node.containedIn?.includes('interface'))) {
                                    try {
                                        const impls = await client.findImplementations(node.id);
                                        if (impls.implementations && impls.implementations.length > 0) {
                                            if (impls.implementations.length === 1) {
                                                // Single implementation, navigate directly
                                                vscode.commands.executeCommand('grafo.navigateToNode', impls.implementations[0]);
                                            } else {
                                                // Multiple implementations, let user choose
                                                const items = impls.implementations.map(impl => ({
                                                    label: impl.name,
                                                    description: impl.namespace || impl.project,
                                                    impl
                                                }));
                                                const selected = await vscode.window.showQuickPick(items, {
                                                    placeHolder: 'Select implementation to navigate'
                                                });
                                                if (selected) {
                                                    vscode.commands.executeCommand('grafo.navigateToNode', selected.impl);
                                                }
                                            }
                                            return;
                                        }
                                    } catch (e) {
                                        // No implementations found, fall through to default behavior
                                    }
                                }
                                // Default: navigate to the node itself
                                if (node.source?.file) {
                                    vscode.commands.executeCommand('grafo.navigateToNode', node);
                                }
                            }
                        }
                        break;
                    case 'dock':
                        vscode.commands.executeCommand('grafo.dockPanel');
                        break;
                    case 'toggleLock':
                        this._setLocked(!this._isLocked);
                        break;
                    case 'navigateBack':
                        this._navigateBack();
                        break;
                    case 'navigateForward':
                        this._navigateForward();
                        break;
                    case 'refresh':
                        vscode.commands.executeCommand('grafo.refreshAll');
                        break;
                    case 'configure':
                        vscode.commands.executeCommand('grafo.configureApiUrl');
                        break;
                    case 'selectVersion':
                        vscode.commands.executeCommand('grafo.selectVersion');
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
        return this._isLocked;
    }

    private _setLocked(locked: boolean) {
        this._isLocked = locked;
        this._panel.webview.postMessage({ type: 'lockStateChanged', locked });
        logger.info(`Panel ${locked ? 'locked' : 'unlocked'}`);
    }

    private _addToHistory(node: GraphNode) {
        // Don't add to history if we're navigating through history
        if (this._isNavigating) return;

        // Don't add duplicate consecutive entries
        if (this._history[this._historyIndex]?.id === node.id) return;

        // Remove any forward history
        this._history = this._history.slice(0, this._historyIndex + 1);

        // Add new node
        this._history.push(node);

        // Limit history size
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        } else {
            this._historyIndex++;
        }

        this._updateNavigationState();
    }

    private _updateNavigationState() {
        const canGoBack = this._historyIndex > 0;
        const canGoForward = this._historyIndex < this._history.length - 1;
        this._panel.webview.postMessage({
            type: 'navigationStateChanged',
            canGoBack,
            canGoForward
        });
    }

    private async _navigateBack() {
        if (this._historyIndex > 0) {
            this._isNavigating = true;
            this._historyIndex--;
            const node = this._history[this._historyIndex];
            await this._loadGraphData(node);
            this._updateClassInfo(node);
            this._updateNavigationState();
            this._isNavigating = false;
        }
    }

    private async _navigateForward() {
        if (this._historyIndex < this._history.length - 1) {
            this._isNavigating = true;
            this._historyIndex++;
            const node = this._history[this._historyIndex];
            await this._loadGraphData(node);
            this._updateClassInfo(node);
            this._updateNavigationState();
            this._isNavigating = false;
        }
    }

    public async loadForClass(node: GraphNode) {
        this._currentClass = node;
        this._addToHistory(node);
        await this._loadGraphData(node);
        this._updateClassInfo(node);
    }

    public async loadForNode(node: GraphNode) {
        this._currentNode = node;
        this._addToHistory(node);
        await this._loadGraphData(node);
    }

    public clear() {
        this._currentNode = null;
        this._currentClass = null;
        this._panel.webview.postMessage({ type: 'clear' });
    }

    private async _loadGraphData(node: GraphNode) {
        const client = getClient();
        if (!client) return;

        try {
            const nodes: CytoscapeNode[] = [];
            const edges: CytoscapeEdge[] = [];
            const addedNodes = new Set<string>();

            // Helper to create node data

            // Use kind, fallback to type, fallback to extracting from ID (grafo:{kind}/...)
            const getNodeType = (n: GraphNode, nodeId: string): string => {
                let kind: string = 'class';
                if (n.kind) kind = n.kind;
                else if (n.type) kind = n.type;
                else {
                    // Extract from ID format: grafo:{kind}/{project}/{name}
                    const match = nodeId.match(/^grafo:(\w+)\//);
                    if (match) kind = match[1];
                }
                return kind;
            };

            // Check if a method belongs to an interface
            const isInterfaceMethod = (n: GraphNode, nodeId: string): boolean => {
                // Check containedIn for interface
                if (n.containedIn && n.containedIn.includes('interface')) return true;
                // Check if contained in an interface node (ID pattern)
                if (n.containedIn && n.containedIn.match(/grafo:interface\//)) return true;
                // Check node name patterns (methods in interfaces often have I prefix in container)
                if (n.namespace && n.namespace.match(/\.I[A-Z]/)) return true;
                return false;
            };

            const createNodeData = (n: GraphNode, id: string) => {
                let nodeType = getNodeType(n, id);
                // Differentiate interface methods from implementation methods
                if (nodeType === 'method' && isInterfaceMethod(n, id)) {
                    nodeType = 'interfaceMethod';
                }
                return {
                    id: id,
                    label: n.name,
                    type: nodeType,
                    layer: n.layer,
                    project: n.project,
                    namespace: n.namespace,
                    fullName: n.fullName,
                    accessibility: n.accessibility,
                    isAbstract: n.isAbstract,
                    isStatic: n.isStatic,
                    containedIn: n.containedIn
                };
            };

            // Add current node
            nodes.push({
                data: {
                    ...createNodeData(node, node.id),
                    isCurrent: true
                }
            });
            addedNodes.add(node.id);

            // Add calls (outgoing)
            if (node.calls) {
                for (const callId of node.calls.slice(0, 15)) {
                    const callee = await client.getNodeById(callId);
                    if (callee && !addedNodes.has(callId)) {
                        nodes.push({ data: createNodeData(callee, callId) });
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

            // Add callsVia (via interface) - these are interface method calls
            if (node.callsVia) {
                for (const viaId of node.callsVia.slice(0, 10)) {
                    const viaNode = await client.getNodeById(viaId);
                    if (viaNode && !addedNodes.has(viaId)) {
                        nodes.push({ data: createNodeData(viaNode, viaId) });
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
                        nodes.push({ data: createNodeData(implNode, implId) });
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
                        nodes.push({ data: createNodeData(inheritNode, inheritId) });
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
                    for (const { node: caller } of callers.callers.slice(0, 8)) {
                        if (!addedNodes.has(caller.id)) {
                            nodes.push({ data: createNodeData(caller, caller.id) });
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
            this._panel.webview.postMessage({
                type: 'updateGraph',
                nodes,
                edges,
                centerNodeId: node.id
            });

        } catch (e) {
            logger.error('Panel graph error:', e);
        }
    }

    private _updateClassInfo(node: GraphNode) {
        this._panel.webview.postMessage({
            type: 'updateClassInfo',
            classInfo: {
                name: node.name,
                namespace: node.namespace,
                kind: node.kind,
                project: node.project,
                layer: node.layer,
                members: node.hasMember?.length || 0,
                calls: node.calls?.length || 0,
                implements: node.implements?.length || 0,
                inherits: node.inherits?.length || 0
            }
        });
    }

    private _update() {
        const config = vscode.workspace.getConfiguration('grafo');
        const version = config.get<string>('graphVersion', '6.5.0');

        this._panel.webview.html = this._getHtmlForWebview(version);
    }

    private _getHtmlForWebview(version: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grafo Explorer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }

        .toolbar-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .toolbar-title {
            font-weight: 600;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .toolbar-version {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
        }

        .toolbar-right {
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
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
        }

        .toolbar-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .toolbar-btn svg {
            width: 16px;
            height: 16px;
        }

        .toolbar-btn.locked {
            background: var(--vscode-inputOption-activeBackground);
            color: var(--vscode-inputOption-activeForeground);
        }

        .toolbar-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .toolbar-btn:disabled:hover {
            background: transparent;
        }

        .toolbar-separator {
            width: 1px;
            height: 16px;
            background: var(--vscode-panel-border);
            margin: 0 4px;
        }

        /* Main content */
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
        }

        /* Class info bar */
        .class-info {
            padding: 10px 12px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: none;
        }

        .class-info.visible {
            display: block;
        }

        .class-name {
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 4px;
        }

        .class-namespace {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }

        .class-stats {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
        }

        .stat-value {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }

        /* Graph container */
        #cy {
            flex: 1;
            width: 100%;
            min-height: 0;
        }

        /* Tooltip */
        .node-tooltip {
            position: absolute;
            background: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 12px;
            max-width: 350px;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: none;
        }

        .node-tooltip.visible {
            display: block;
        }

        .tooltip-title {
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-editorHoverWidget-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .tooltip-type {
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 3px;
            text-transform: uppercase;
        }

        .tooltip-type.class { background: #4fc3f7; color: #000; }
        .tooltip-type.interface { background: #81c784; color: #000; }
        .tooltip-type.method { background: #ffb74d; color: #000; }
        .tooltip-type.interfaceMethod { background: #4db6ac; color: #000; }
        .tooltip-type.property { background: #ce93d8; color: #000; }

        .tooltip-row {
            display: flex;
            margin: 3px 0;
            font-size: 11px;
        }

        .tooltip-label {
            color: var(--vscode-descriptionForeground);
            min-width: 70px;
        }

        .tooltip-value {
            color: var(--vscode-editorHoverWidget-foreground);
            word-break: break-all;
        }

        /* Legend */
        .legend {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: var(--vscode-input-background);
            padding: 8px 10px;
            border-radius: 4px;
            font-size: 10px;
            opacity: 0.95;
            z-index: 10;
        }

        .legend-item {
            display: flex;
            align-items: center;
            margin: 3px 0;
        }

        .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 6px;
        }

        /* Status bar */
        .status-bar {
            padding: 4px 12px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid var(--vscode-panel-border);
        }

        /* Empty state */
        .empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px;
            text-align: center;
        }

        .empty-state svg {
            width: 64px;
            height: 64px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state h3 {
            margin-bottom: 8px;
            color: var(--vscode-editor-foreground);
        }

        .graph-container {
            flex: 1;
            position: relative;
            display: none;
            min-height: 0;
        }

        .graph-container.visible {
            display: flex;
            flex-direction: column;
        }

        /* Layout menu */
        .layout-wrapper {
            position: relative;
        }

        .layout-menu {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 4px;
            padding: 4px 0;
            min-width: 140px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 1000;
        }

        .layout-menu.show {
            display: block;
        }

        .layout-item {
            padding: 6px 12px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .layout-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .layout-item.selected::before {
            content: '✓';
            margin-right: 4px;
        }
    </style>
</head>
<body>
    <!-- Toolbar -->
    <div class="toolbar">
        <div class="toolbar-left">
            <button class="toolbar-btn" id="btnBack" onclick="handleBack()" title="Go Back" disabled>
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
            </button>
            <button class="toolbar-btn" id="btnForward" onclick="handleForward()" title="Go Forward" disabled>
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
            </button>
            <div class="toolbar-separator"></div>
            <div class="toolbar-title">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                Grafo Explorer
            </div>
            <span class="toolbar-version">v${version}</span>
        </div>
        <div class="toolbar-right">
            <div class="layout-wrapper">
                <button class="toolbar-btn" id="layoutBtn" onclick="toggleLayoutMenu(event)" title="Change Layout">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2h2v2H5v-2zm14 2H9v-2h10v2zm0-4H9v-2h10v2zm0-4H9V7h10v2z"/>
                    </svg>
                    Layout
                </button>
                <div class="layout-menu" id="layoutMenu">
                    <div class="layout-item selected" data-layout="cose" onclick="selectLayout('cose')">Force Directed</div>
                    <div class="layout-item" data-layout="breadthfirst" onclick="selectLayout('breadthfirst')">Hierarchical</div>
                    <div class="layout-item" data-layout="circle" onclick="selectLayout('circle')">Circle</div>
                    <div class="layout-item" data-layout="concentric" onclick="selectLayout('concentric')">Concentric</div>
                    <div class="layout-item" data-layout="grid" onclick="selectLayout('grid')">Grid</div>
                </div>
            </div>
            <button class="toolbar-btn" onclick="handleFit()" title="Fit to View">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/>
                </svg>
            </button>
            <div class="toolbar-separator"></div>
            <button class="toolbar-btn" onclick="handleRefresh()" title="Refresh">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
            </button>
            <button class="toolbar-btn" onclick="handleVersion()" title="Select Version">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
            </button>
            <button class="toolbar-btn" onclick="handleConfigure()" title="Configure API URL">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
            </button>
            <button class="toolbar-btn" id="lockBtn" onclick="handleLock()" title="Lock/Unlock view (keep current context)">
                <svg id="lockIcon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                </svg>
            </button>
            <button class="toolbar-btn" onclick="handleDock()" title="Dock to Sidebar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h2v10H7z"/>
                </svg>
            </button>
        </div>
    </div>

    <!-- Class Info -->
    <div class="class-info" id="classInfo">
        <div class="class-name" id="className">-</div>
        <div class="class-namespace" id="classNamespace">-</div>
        <div class="class-stats">
            <div class="stat-item">
                <span>Members:</span>
                <span class="stat-value" id="statMembers">0</span>
            </div>
            <div class="stat-item">
                <span>Calls:</span>
                <span class="stat-value" id="statCalls">0</span>
            </div>
            <div class="stat-item">
                <span>Implements:</span>
                <span class="stat-value" id="statImplements">0</span>
            </div>
            <div class="stat-item">
                <span>Inherits:</span>
                <span class="stat-value" id="statInherits">0</span>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
        <!-- Empty State -->
        <div class="empty-state" id="emptyState">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <h3>No Class Selected</h3>
            <p>Open a C# file to visualize code relationships</p>
        </div>

        <!-- Graph Container -->
        <div class="graph-container" id="graphContainer">
            <div id="cy"></div>
            <div class="node-tooltip" id="nodeTooltip"></div>
            <div class="legend">
                <div class="legend-item"><span class="legend-color" style="background:#4fc3f7"></span>Class</div>
                <div class="legend-item"><span class="legend-color" style="background:#81c784"></span>Interface</div>
                <div class="legend-item"><span class="legend-color" style="background:#ffb74d"></span>Method</div>
                <div class="legend-item"><span class="legend-color" style="background:#4db6ac"></span>Interface Method</div>
            </div>
        </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
        <span id="statusLeft">Ready</span>
        <span id="statusRight">Nodes: 0 | Edges: 0</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        const colors = {
            class: '#4fc3f7',
            interface: '#81c784',
            method: '#ffb74d',
            interfaceMethod: '#4db6ac',
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

        // Layout configurations
        let currentLayout = 'cose';
        let currentCenterNodeId = null;

        const layoutConfigs = {
            cose: {
                name: 'cose',
                animate: false,
                nodeRepulsion: 10000,
                idealEdgeLength: 120,
                gravity: 0.2
            },
            breadthfirst: {
                name: 'breadthfirst',
                animate: false,
                directed: true,
                spacingFactor: 1.5,
                avoidOverlap: true
            },
            circle: {
                name: 'circle',
                animate: false,
                avoidOverlap: true,
                spacingFactor: 1.2
            },
            concentric: {
                name: 'concentric',
                animate: false,
                minNodeSpacing: 50,
                concentric: (node) => node.data('isCurrent') ? 10 : 1,
                levelWidth: () => 2
            },
            grid: {
                name: 'grid',
                animate: false,
                avoidOverlap: true,
                spacingFactor: 1.5
            }
        };

        function applyLayout(layoutName) {
            if (!cy) return;
            currentLayout = layoutName;
            const config = layoutConfigs[layoutName] || layoutConfigs.cose;
            cy.layout(config).run();

            if (currentCenterNodeId) {
                const centerNode = cy.getElementById(currentCenterNodeId);
                if (centerNode.length > 0) {
                    cy.center(centerNode);
                }
            }

            // Update menu selection
            document.querySelectorAll('.layout-item').forEach(item => {
                item.classList.toggle('selected', item.dataset.layout === layoutName);
            });
        }

        function toggleLayoutMenu(e) {
            e.stopPropagation();
            const menu = document.getElementById('layoutMenu');
            menu.classList.toggle('show');
        }

        function selectLayout(layoutName) {
            applyLayout(layoutName);
            document.getElementById('layoutMenu').classList.remove('show');
        }

        function handleFit() {
            if (cy) cy.fit(null, 20);
        }

        // Close menu when clicking outside
        document.addEventListener('click', () => {
            document.getElementById('layoutMenu').classList.remove('show');
        });

        let cy = null;

        function initCytoscape() {
            if (cy) return;

            cy = cytoscape({
                container: document.getElementById('cy'),
                wheelSensitivity: 0.1,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': (ele) => colors[ele.data('type')] || colors.default,
                            'label': 'data(label)',
                            'text-valign': 'bottom',
                            'text-margin-y': 5,
                            'font-size': 11,
                            'color': '#fff',
                            'text-outline-color': '#000',
                            'text-outline-width': 1,
                            'width': 35,
                            'height': 35
                        }
                    },
                    {
                        selector: 'node[?isCurrent]',
                        style: {
                            'border-width': 3,
                            'border-color': '#fff',
                            'width': 45,
                            'height': 45
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

            // Tooltip handling
            const tooltip = document.getElementById('nodeTooltip');
            let tooltipTimeout;

            cy.on('mouseover', 'node', function(evt) {
                const node = evt.target;
                const data = node.data();

                clearTimeout(tooltipTimeout);

                // Build tooltip content
                let html = '<div class="tooltip-title">';
                html += '<span class="tooltip-type ' + (data.type || '') + '">' + (data.type || 'unknown') + '</span>';
                html += '<span>' + data.label + '</span>';
                html += '</div>';

                if (data.namespace) {
                    html += '<div class="tooltip-row"><span class="tooltip-label">Namespace:</span><span class="tooltip-value">' + data.namespace + '</span></div>';
                }
                if (data.project) {
                    html += '<div class="tooltip-row"><span class="tooltip-label">Project:</span><span class="tooltip-value">' + data.project + '</span></div>';
                }
                if (data.layer) {
                    html += '<div class="tooltip-row"><span class="tooltip-label">Layer:</span><span class="tooltip-value">' + data.layer + '</span></div>';
                }
                if (data.accessibility) {
                    html += '<div class="tooltip-row"><span class="tooltip-label">Access:</span><span class="tooltip-value">' + data.accessibility + '</span></div>';
                }

                // Modifiers
                const modifiers = [];
                if (data.isAbstract) modifiers.push('abstract');
                if (data.isStatic) modifiers.push('static');
                if (modifiers.length > 0) {
                    html += '<div class="tooltip-row"><span class="tooltip-label">Modifiers:</span><span class="tooltip-value">' + modifiers.join(', ') + '</span></div>';
                }

                if (data.fullName && data.fullName !== data.label) {
                    html += '<div class="tooltip-row"><span class="tooltip-label">Full name:</span><span class="tooltip-value">' + data.fullName + '</span></div>';
                }

                tooltip.innerHTML = html;

                // Position tooltip near the node
                const renderedPos = node.renderedPosition();
                const container = document.getElementById('cy').getBoundingClientRect();

                let left = renderedPos.x + 20;
                let top = renderedPos.y - 10;

                // Keep tooltip within bounds
                if (left + 350 > container.width) {
                    left = renderedPos.x - 360;
                }
                if (top < 0) top = 10;

                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                tooltip.classList.add('visible');
            });

            cy.on('mouseout', 'node', function() {
                tooltipTimeout = setTimeout(() => {
                    tooltip.classList.remove('visible');
                }, 100);
            });

            cy.on('pan zoom', function() {
                tooltip.classList.remove('visible');
            });
        }

        function handleRefresh() {
            vscode.postMessage({ type: 'refresh' });
        }

        function handleVersion() {
            vscode.postMessage({ type: 'selectVersion' });
        }

        function handleConfigure() {
            vscode.postMessage({ type: 'configure' });
        }

        function handleDock() {
            vscode.postMessage({ type: 'dock' });
        }

        function handleLock() {
            vscode.postMessage({ type: 'toggleLock' });
        }

        function handleBack() {
            vscode.postMessage({ type: 'navigateBack' });
        }

        function handleForward() {
            vscode.postMessage({ type: 'navigateForward' });
        }

        function updateNavigationButtons(canGoBack, canGoForward) {
            document.getElementById('btnBack').disabled = !canGoBack;
            document.getElementById('btnForward').disabled = !canGoForward;
        }

        function updateLockButton(locked) {
            const btn = document.getElementById('lockBtn');
            const icon = document.getElementById('lockIcon');
            if (locked) {
                btn.classList.add('locked');
                btn.title = 'Unlock view (resume auto-update)';
                // Locked icon (closed padlock)
                icon.innerHTML = '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>';
            } else {
                btn.classList.remove('locked');
                btn.title = 'Lock view (keep current context)';
                // Unlocked icon (open padlock)
                icon.innerHTML = '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>';
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateGraph':
                    document.getElementById('emptyState').style.display = 'none';
                    document.getElementById('graphContainer').classList.add('visible');

                    initCytoscape();
                    cy.elements().remove();

                    if (message.nodes.length > 0) {
                        cy.add(message.nodes);
                        cy.add(message.edges);

                        currentCenterNodeId = message.centerNodeId;
                        applyLayout(currentLayout);

                        document.getElementById('statusRight').textContent =
                            'Nodes: ' + message.nodes.length + ' | Edges: ' + message.edges.length;
                    }
                    break;

                case 'updateClassInfo':
                    const info = message.classInfo;
                    document.getElementById('classInfo').classList.add('visible');
                    document.getElementById('className').textContent = info.name;
                    document.getElementById('classNamespace').textContent = info.namespace || '-';
                    document.getElementById('statMembers').textContent = info.members;
                    document.getElementById('statCalls').textContent = info.calls;
                    document.getElementById('statImplements').textContent = info.implements;
                    document.getElementById('statInherits').textContent = info.inherits;
                    document.getElementById('statusLeft').textContent = info.project || 'Ready';
                    break;

                case 'clear':
                    document.getElementById('emptyState').style.display = 'flex';
                    document.getElementById('graphContainer').classList.remove('visible');
                    document.getElementById('classInfo').classList.remove('visible');
                    if (cy) cy.elements().remove();
                    document.getElementById('statusRight').textContent = 'Nodes: 0 | Edges: 0';
                    document.getElementById('statusLeft').textContent = 'Ready';
                    break;

                case 'lockStateChanged':
                    updateLockButton(message.locked);
                    break;

                case 'navigationStateChanged':
                    updateNavigationButtons(message.canGoBack, message.canGoForward);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
