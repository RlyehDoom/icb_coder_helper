/**
 * Tree View Providers for Grafo Widgets
 * 5 widgets: Impact, Dependencies, ClassOverview, LayerMap, Implementations
 */
import * as vscode from 'vscode';
import { getClient } from '../api/grafoClient';
import { GraphNode, LayerType, CurrentContext, ImpactAnalysisResponse } from '../types';
import { logger } from '../logger';

// ============================================================================
// Shared Types
// ============================================================================

type TreeItem = GroupItem | NodeItem | InfoItem;

class InfoItem extends vscode.TreeItem {
    constructor(label: string, icon?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon || 'info');
    }
}

class GroupItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly children: NodeItem[],
        icon?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.description = `(${children.length})`;
        this.iconPath = new vscode.ThemeIcon(icon || 'folder');
    }
}

class NodeItem extends vscode.TreeItem {
    constructor(public readonly node: GraphNode, showProject = true) {
        super(node.name, vscode.TreeItemCollapsibleState.None);

        this.description = showProject ? node.project : node.namespace;
        this.tooltip = new vscode.MarkdownString()
            .appendMarkdown(`**${node.name}**\n\n`)
            .appendMarkdown(`- Type: ${node.kind}\n`)
            .appendMarkdown(`- Project: ${node.project}\n`)
            .appendMarkdown(node.namespace ? `- Namespace: \`${node.namespace}\`\n` : '')
            .appendMarkdown(node.source?.file ? `\n📁 \`${node.source.file}:${node.source.range?.start || 1}\`` : '');

        this.iconPath = this.getIcon();
        this.contextValue = 'grafoNode';

        // Navigation command
        if (node.source?.file) {
            this.command = {
                command: 'grafo.navigateToNode',
                title: 'Navigate',
                arguments: [node]
            };
        }
    }

    private getIcon(): vscode.ThemeIcon {
        const icons: Record<string, string> = {
            class: 'symbol-class',
            interface: 'symbol-interface',
            method: 'symbol-method',
            property: 'symbol-property',
            field: 'symbol-field',
            enum: 'symbol-enum'
        };
        return new vscode.ThemeIcon(icons[this.node.kind] || 'symbol-misc');
    }
}

// ============================================================================
// 1. Impact Analysis Provider
// ============================================================================

export class ImpactProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private callersByLayer: Map<string, NodeItem[]> = new Map();
    private callersViaInterface: NodeItem[] = [];
    private implementers: NodeItem[] = [];
    private inheritors: NodeItem[] = [];
    private currentNode: GraphNode | null = null;
    private loading = false;
    private impactData: ImpactAnalysisResponse['impact'] | null = null;
    private affectedProjects: string[] = [];
    private impactDescription: string = '';

    refresh() { this._onDidChange.fire(); }

    async loadForNode(node: GraphNode) {
        this.loading = true;
        this.currentNode = node;
        this.callersByLayer.clear();
        this.callersViaInterface = [];
        this.implementers = [];
        this.inheritors = [];
        this.impactData = null;
        this.affectedProjects = [];
        this.impactDescription = '';
        this.refresh();

        const client = getClient();
        if (!client || node.kind !== 'method') {
            this.loading = false;
            this.refresh();
            return;
        }

        try {
            const response = await client.analyzeImpact(node.id);

            // Store impact metrics and description
            this.impactData = response.impact;
            this.affectedProjects = response.affectedProjects;
            this.impactDescription = response.description || '';

            // Process callers by layer (includes both direct and via interface)
            for (const [layer, callers] of Object.entries(response.incoming.callersByLayer)) {
                this.callersByLayer.set(layer, callers.map(c => new NodeItem(c)));
            }

            // Process callers via interface separately for display
            if (response.incoming.callersViaInterface) {
                this.callersViaInterface = response.incoming.callersViaInterface.map(c => new NodeItem(c));
            }

            // Process implementers and inheritors
            this.implementers = response.incoming.implementers.map(i => new NodeItem(i));
            this.inheritors = response.incoming.inheritors.map(i => new NodeItem(i));

        } catch (e) {
            console.error('Impact analysis error:', e);
        }

        this.loading = false;
        this.refresh();
    }

    clear() {
        this.currentNode = null;
        this.callersByLayer.clear();
        this.callersViaInterface = [];
        this.implementers = [];
        this.inheritors = [];
        this.impactData = null;
        this.affectedProjects = [];
        this.impactDescription = '';
        this.refresh();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: TreeItem): TreeItem[] {
        if (this.loading) return [new InfoItem('Loading...', 'sync~spin')];

        if (!this.currentNode) {
            return [new InfoItem('Select a method to see impact', 'info')];
        }

        if (this.currentNode.kind !== 'method') {
            return [new InfoItem('Impact analysis is for methods only', 'warning')];
        }

        if (!element) {
            const items: TreeItem[] = [];

            // Header showing which method is being analyzed
            items.push(new InfoItem(`Method: ${this.currentNode.name}`, 'target'));

            const hasCallers = this.callersByLayer.size > 0;
            const hasViaInterface = this.callersViaInterface.length > 0;
            const hasImplementers = this.implementers.length > 0;
            const hasInheritors = this.inheritors.length > 0;

            if (!hasCallers && !hasViaInterface && !hasImplementers && !hasInheritors) {
                items.push(new InfoItem('───────────────', 'dash'));
                items.push(new InfoItem('🟢 Low Impact - No dependencies', 'circle-filled'));
                items.push(new InfoItem('No dependencies found', 'check'));
                return items;
            }

            // Impact summary first (before components)
            items.push(new InfoItem('───────────────', 'dash'));

            if (this.impactData) {
                // Use impact level from API - now includes "critical"
                const icons: Record<string, string> = { critical: '🟣', high: '🔴', medium: '🟡', low: '🟢' };
                const labels: Record<string, string> = { critical: 'CRITICAL', high: 'High Impact', medium: 'Medium Impact', low: 'Low Impact' };

                // Impact level with description tooltip
                const impactItem = new InfoItem(`${icons[this.impactData.level]} ${labels[this.impactData.level]}`, 'circle-filled');
                if (this.impactDescription) {
                    impactItem.tooltip = new vscode.MarkdownString(this.impactDescription);
                }
                items.push(impactItem);

                // Show flows affected (the key metric now)
                const flowsAffected = this.impactData.flowsAffected || 0;
                if (flowsAffected > 0) {
                    items.push(new InfoItem(`Flows affected: ${flowsAffected}`, 'git-branch'));
                }

                // Show both direct and via interface callers
                const directCallers = this.impactData.directCallers || 0;
                const viaInterfaceCallers = this.impactData.viaInterfaceCallers || 0;
                const totalCallers = directCallers + viaInterfaceCallers;

                if (viaInterfaceCallers > 0) {
                    items.push(new InfoItem(`Callers: ${totalCallers} (${directCallers} direct, ${viaInterfaceCallers} via interface)`, 'call-incoming'));
                } else {
                    items.push(new InfoItem(`Callers: ${totalCallers}`, 'call-incoming'));
                }

                items.push(new InfoItem(`Layers: ${this.impactData.affectedLayers} | Projects: ${this.impactData.affectedProjects}`, 'layers'));

                // Warning for critical level
                if (this.impactData.level === 'critical') {
                    items.push(new InfoItem('🟣 Multiple service flows affected!', 'warning'));
                }

                // Warning for UI layer affected
                if (this.impactData.hasPresentation) {
                    items.push(new InfoItem('⚠️ UI layer affected', 'warning'));
                }

                // Warning for services layer via interface (Unity/DI)
                if (this.impactData.hasServices && viaInterfaceCallers > 0) {
                    items.push(new InfoItem('⚠️ Services layer via Unity/DI', 'warning'));
                }

                // Additional stats
                if (this.impactData.implementers > 0) {
                    items.push(new InfoItem(`Implementers: ${this.impactData.implementers}`, 'symbol-interface'));
                }
                if (this.impactData.inheritors > 0) {
                    items.push(new InfoItem(`Inheritors: ${this.impactData.inheritors}`, 'type-hierarchy'));
                }
            }

            // Components section
            items.push(new InfoItem('───────────────', 'dash'));

            // Layer groups for callers
            const layerOrder = ['presentation', 'services', 'business', 'data', 'infrastructure', 'other'];
            const layerIcons: Record<string, string> = {
                presentation: 'browser',
                services: 'server-process',
                business: 'briefcase',
                data: 'database',
                infrastructure: 'tools',
                other: 'question'
            };

            const groups = layerOrder
                .filter(l => this.callersByLayer.has(l))
                .map(l => new GroupItem(l.toUpperCase(), this.callersByLayer.get(l)!, layerIcons[l]));

            items.push(...groups);

            // Via Interface callers (Unity/DI - high impact indicator)
            if (hasViaInterface) {
                items.push(new GroupItem('🔗 VIA INTERFACE/UNITY', this.callersViaInterface, 'plug'));
            }

            // Implementers (high impact indicator)
            if (hasImplementers) {
                items.push(new GroupItem('⚠️ IMPLEMENTERS', this.implementers, 'symbol-interface'));
            }

            // Inheritors (high impact indicator)
            if (hasInheritors) {
                items.push(new GroupItem('⚠️ INHERITORS', this.inheritors, 'type-hierarchy'));
            }

            return items;
        }

        if (element instanceof GroupItem) {
            return element.children;
        }

        return [];
    }
}

// ============================================================================
// 2. Dependencies Provider
// ============================================================================

export class DependenciesProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    // Incoming (who calls this method) - all callers combined
    private incomingCallers: NodeItem[] = [];

    // Outgoing - Methods called (all combined)
    private outgoingMethods: NodeItem[] = [];

    // Outgoing - Types used
    private outgoingTypes: NodeItem[] = [];

    private currentNode: GraphNode | null = null;
    private loading = false;

    refresh() { this._onDidChange.fire(); }

    async loadForNode(node: GraphNode) {
        this.loading = true;
        this.currentNode = node;
        this.incomingCallers = [];
        this.outgoingMethods = [];
        this.outgoingTypes = [];
        this.refresh();

        const client = getClient();
        if (!client || node.kind !== 'method') {
            this.loading = false;
            this.refresh();
            return;
        }

        const addedCallerIds = new Set<string>();
        const addedCalleeIds = new Set<string>();
        const addedTypeIds = new Set<string>();

        try {
            // === INCOMING: Who calls this method ===
            logger.debug(`[Dependencies] Loading callers for ${node.id}`);
            const callersResponse = await client.findCallers(node.id, 2);
            logger.debug(`[Dependencies] Got ${callersResponse.callers?.length || 0} direct, ${callersResponse.indirectCallers?.length || 0} indirect callers`);

            // Direct callers
            for (const { node: caller } of callersResponse.callers || []) {
                if (!addedCallerIds.has(caller.id)) {
                    this.incomingCallers.push(new NodeItem(caller));
                    addedCallerIds.add(caller.id);
                }
            }

            // Indirect callers (via interface/Unity) - combine with direct
            for (const { node: caller } of callersResponse.indirectCallers || []) {
                if (!addedCallerIds.has(caller.id)) {
                    this.incomingCallers.push(new NodeItem(caller));
                    addedCallerIds.add(caller.id);
                }
            }

            // === OUTGOING: What this method calls ===
            const calleesResponse = await client.findCallees(node.id, 1);

            // Direct callees
            for (const { node: callee } of calleesResponse.callees || []) {
                if (!addedCalleeIds.has(callee.id)) {
                    if (callee.kind === 'method') {
                        this.outgoingMethods.push(new NodeItem(callee));
                    } else {
                        this.outgoingTypes.push(new NodeItem(callee));
                    }
                    addedCalleeIds.add(callee.id);
                }
            }

            // Via interface callees - combine with methods
            for (const { node: callee } of calleesResponse.viaInterface || []) {
                if (!addedCalleeIds.has(callee.id)) {
                    if (callee.kind === 'method') {
                        this.outgoingMethods.push(new NodeItem(callee));
                    } else {
                        this.outgoingTypes.push(new NodeItem(callee));
                    }
                    addedCalleeIds.add(callee.id);
                }
            }

            // Indirect calls from node.indirectCall
            if (node.indirectCall && node.indirectCall.length > 0) {
                const indirectPromises = node.indirectCall.map(id => client.getNodeById(id));
                const indirectNodes = await Promise.all(indirectPromises);
                for (const indirectNode of indirectNodes) {
                    if (indirectNode && !addedCalleeIds.has(indirectNode.id)) {
                        this.outgoingMethods.push(new NodeItem(indirectNode));
                        addedCalleeIds.add(indirectNode.id);
                    }
                }
            }

            // Calls from node.calls
            if (node.calls && node.calls.length > 0) {
                const callsPromises = node.calls.map(id => client.getNodeById(id));
                const callsNodes = await Promise.all(callsPromises);
                for (const callNode of callsNodes) {
                    if (callNode && !addedCalleeIds.has(callNode.id)) {
                        if (callNode.kind === 'method') {
                            this.outgoingMethods.push(new NodeItem(callNode));
                        } else {
                            this.outgoingTypes.push(new NodeItem(callNode));
                        }
                        addedCalleeIds.add(callNode.id);
                    }
                }
            }

            // CallsVia from node.callsVia
            if (node.callsVia && node.callsVia.length > 0) {
                const callsViaPromises = node.callsVia.map(id => client.getNodeById(id));
                const callsViaNodes = await Promise.all(callsViaPromises);
                for (const callNode of callsViaNodes) {
                    if (callNode && !addedCalleeIds.has(callNode.id)) {
                        if (callNode.kind === 'method') {
                            this.outgoingMethods.push(new NodeItem(callNode));
                        } else {
                            this.outgoingTypes.push(new NodeItem(callNode));
                        }
                        addedCalleeIds.add(callNode.id);
                    }
                }
            }

            // Uses (types used by this method) from node.uses
            if (node.uses && node.uses.length > 0) {
                const usesPromises = node.uses.map(id => client.getNodeById(id));
                const usesNodes = await Promise.all(usesPromises);
                for (const usesNode of usesNodes) {
                    if (usesNode && !addedTypeIds.has(usesNode.id)) {
                        this.outgoingTypes.push(new NodeItem(usesNode));
                        addedTypeIds.add(usesNode.id);
                    }
                }
            }

            logger.debug(`[Dependencies] Result: ${this.incomingCallers.length} callers, ${this.outgoingMethods.length} methods, ${this.outgoingTypes.length} types`);

        } catch (e) {
            console.error('Dependencies error:', e);
            logger.error('[Dependencies] Error loading dependencies', e);
        }

        this.loading = false;
        this.refresh();
    }

    clear() {
        this.currentNode = null;
        this.incomingCallers = [];
        this.outgoingMethods = [];
        this.outgoingTypes = [];
        this.refresh();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: TreeItem): TreeItem[] {
        if (this.loading) return [new InfoItem('Loading...', 'sync~spin')];

        if (!this.currentNode) {
            return [new InfoItem('Select a method to see dependencies', 'info')];
        }

        if (!element) {
            const items: TreeItem[] = [];

            // Header showing which method is being analyzed
            items.push(new InfoItem(`Method: ${this.currentNode.name}`, 'target'));

            const totalIncoming = this.incomingCallers.length;
            const totalOutgoing = this.outgoingMethods.length + this.outgoingTypes.length;

            if (totalIncoming === 0 && totalOutgoing === 0) {
                items.push(new InfoItem('No dependencies found', 'check'));
                return items;
            }

            // === INCOMING SECTION ===
            if (totalIncoming > 0) {
                items.push(new InfoItem('───────────────', 'dash'));
                items.push(new GroupItem(`⬅ CALLERS`, this.incomingCallers, 'call-incoming'));
            }

            // === OUTGOING SECTION ===
            if (totalOutgoing > 0) {
                items.push(new InfoItem('───────────────', 'dash'));

                if (this.outgoingMethods.length > 0) {
                    items.push(new GroupItem('➡ METHODS CALLED', this.outgoingMethods, 'symbol-method'));
                }

                if (this.outgoingTypes.length > 0) {
                    items.push(new GroupItem('➡ TYPES USED', this.outgoingTypes, 'references'));
                }
            }

            return items;
        }

        if (element instanceof GroupItem) {
            return element.children;
        }

        return [];
    }
}

// ============================================================================
// 3. Class Overview Provider
// ============================================================================

export class ClassOverviewProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private items: InfoItem[] = [];
    private currentNode: GraphNode | null = null;
    private loading = false;

    refresh() { this._onDidChange.fire(); }

    async loadForClass(node: GraphNode) {
        this.loading = true;
        this.currentNode = node;
        this.items = [];
        this.refresh();

        const client = getClient();
        if (!client || (node.kind !== 'class' && node.kind !== 'interface')) {
            this.loading = false;
            this.refresh();
            return;
        }

        try {
            this.items = [
                new InfoItem(`Name: ${node.name}`, 'symbol-class'),
                new InfoItem(`Project: ${node.project}`, 'folder'),
                new InfoItem(`Layer: ${node.layer || 'unknown'}`, 'layers'),
                new InfoItem(`Namespace: ${node.namespace || 'none'}`, 'symbol-namespace'),
            ];

            // Count relationships
            // Use hasMember for class->method relationships (logical containment)
            // Support both formats: grafo:mtd/hash (new) and grafo:method/project/name (old)
            const methods = node.hasMember?.filter(id => id.includes(':mtd/') || id.includes(':method/')) || [];
            const calls = node.calls?.length || 0;
            const callsVia = node.callsVia?.length || 0;
            const implements_ = node.implements?.length || 0;
            const inherits = node.inherits?.length || 0;
            const uses = node.uses?.length || 0;

            this.items.push(new InfoItem('---', 'dash'));
            this.items.push(new InfoItem(`Methods: ${methods.length}`, 'symbol-method'));
            this.items.push(new InfoItem(`Calls: ${calls} direct, ${callsVia} via interface`, 'call-outgoing'));
            this.items.push(new InfoItem(`Implements: ${implements_} interfaces`, 'symbol-interface'));
            this.items.push(new InfoItem(`Inherits: ${inherits} classes`, 'type-hierarchy'));
            this.items.push(new InfoItem(`Uses: ${uses} types`, 'references'));

            // Modifiers
            const modifiers: string[] = [];
            if (node.isAbstract) modifiers.push('abstract');
            if (node.isStatic) modifiers.push('static');
            if (node.isSealed) modifiers.push('sealed');
            if (modifiers.length > 0) {
                this.items.push(new InfoItem(`Modifiers: ${modifiers.join(', ')}`, 'tag'));
            }

        } catch (e) {
            console.error('Class overview error:', e);
        }

        this.loading = false;
        this.refresh();
    }

    clear() {
        this.currentNode = null;
        this.items = [];
        this.refresh();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem { return element; }

    getChildren(): TreeItem[] {
        if (this.loading) return [new InfoItem('Loading...', 'sync~spin')];

        if (!this.currentNode) {
            return [new InfoItem('Open a C# file to see class overview', 'info')];
        }

        return this.items;
    }
}

// ============================================================================
// 4. Overridable Methods Provider
// ============================================================================

interface OverridableMethod {
    name: string;
    node: GraphNode;
    isOverridden: boolean;
    callsBase: boolean;
    lineNumber?: number;
}

class OverrideMethodItem extends vscode.TreeItem {
    constructor(public readonly method: OverridableMethod) {
        super(method.name, vscode.TreeItemCollapsibleState.None);

        // Set icon and appearance based on state
        if (method.isOverridden) {
            if (method.callsBase) {
                // Overridden and calls base - good
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                this.description = 'override + base';
            } else {
                // Overridden but doesn't call base - warning
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
                this.description = 'override (no base call)';
            }

            // Navigate to override on click
            if (method.lineNumber) {
                this.command = {
                    command: 'grafo.goToLine',
                    title: 'Go to Override',
                    arguments: [method.lineNumber]
                };
            }
        } else {
            // Not overridden - disabled/opaque appearance
            this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
            this.description = 'not overridden';
        }

        // Tooltip
        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${method.name}**\n\n`);
        this.tooltip.appendMarkdown(`- Project: ${method.node.project}\n`);
        this.tooltip.appendMarkdown(`- Status: ${method.isOverridden ? 'Overridden' : 'Available for override'}\n`);
        if (method.isOverridden && !method.callsBase) {
            this.tooltip.appendMarkdown(`\n⚠️ **Warning:** Override doesn't call \`base.${method.name}()\``);
        }
    }
}

export class OverridableMethodsProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private methods: OverridableMethod[] = [];
    private baseClassName: string = '';
    private currentDocument: vscode.TextDocument | null = null;
    private loading = false;

    refresh() { this._onDidChange.fire(); }

    private noBaseClass = false;

    async loadForClass(currentClassNode: GraphNode, document: vscode.TextDocument) {
        this.loading = true;
        this.methods = [];
        this.baseClassName = '';
        this.noBaseClass = false;
        this.currentDocument = document;
        this.refresh();

        const client = getClient();

        try {
            // Check if the class inherits from another CLASS (not just interfaces)
            // inherits[] contains class IDs, implements[] contains interface IDs
            const inheritsFromClass = currentClassNode.inherits && currentClassNode.inherits.length > 0;

            if (!inheritsFromClass) {
                logger.debug(`[OverridableMethods] Class ${currentClassNode.name} does not inherit from any class`);
                this.noBaseClass = true;
                this.loading = false;
                this.refresh();
                return;
            }

            // Get the base class node
            let baseClassNode: GraphNode | null = null;
            if (client && currentClassNode.inherits) {
                const baseClassId = currentClassNode.inherits[0]; // First inherited class
                baseClassNode = await client.getNodeById(baseClassId);
                if (baseClassNode) {
                    this.baseClassName = baseClassNode.name;
                    logger.debug(`[OverridableMethods] Base class: ${baseClassNode.name}`);
                }
            }

            if (!baseClassNode) {
                logger.debug(`[OverridableMethods] Could not fetch base class`);
                this.noBaseClass = true;
                this.loading = false;
                this.refresh();
                return;
            }

            const documentText = document.getText();
            const lines = documentText.split('\n');

            // Step 1: Scan document for ALL override methods (this always works)
            const documentOverrides = new Map<string, { lineNumber: number; callsBase: boolean }>();
            const overridePattern = /\b(public|protected|internal)\s+override\s+[\w<>\[\],\.\s]+\s+(\w+)\s*\(/;

            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(overridePattern);
                if (match) {
                    const methodName = match[2];
                    const lineNumber = i + 1;

                    // Check if base.MethodName() is called
                    let callsBase = false;
                    const baseCallRegex = new RegExp(`base\\.${this.escapeRegex(methodName)}\\s*\\(`);
                    for (let j = i; j < Math.min(i + 150, lines.length); j++) {
                        if (baseCallRegex.test(lines[j])) {
                            callsBase = true;
                            break;
                        }
                        if (j > i && /\b(public|protected|private|internal)\s+\w/.test(lines[j]) &&
                            !lines[j].includes(methodName)) {
                            break;
                        }
                    }

                    documentOverrides.set(methodName, { lineNumber, callsBase });
                    logger.debug(`[OverridableMethods] Found override in doc: ${methodName} line ${lineNumber}, callsBase=${callsBase}`);
                }
            }

            // Step 2: Get base class methods from API using 'hasMember' relationship
            let baseClassMethods: GraphNode[] = [];
            if (client) {
                try {
                    // Get full node with hasMember array (logical class->method containment)
                    const fullNode = await client.getNodeById(baseClassNode.id);
                    // Support both formats: grafo:mtd/hash (new) and grafo:method/project/name (old)
                    const methodIds = fullNode?.hasMember?.filter(id => id.includes(':mtd/') || id.includes(':method/')) || [];
                    logger.debug(`[OverridableMethods] Base class has ${methodIds.length} methods in hasMember`);

                    // Fetch actual method details from API (IDs are now hashes, not names)
                    for (const methodId of methodIds) {
                        try {
                            const methodNode = await client.getNodeById(methodId);
                            if (methodNode && methodNode.name) {
                                baseClassMethods.push(methodNode);
                            }
                        } catch (e) {
                            // Skip methods that can't be fetched
                            logger.debug(`[OverridableMethods] Could not fetch method ${methodId}`);
                        }
                    }

                    logger.debug(`[OverridableMethods] Fetched ${baseClassMethods.length} methods from API`);
                } catch (e) {
                    logger.debug(`[OverridableMethods] Could not fetch base methods from API`);
                }
            }

            // Step 3: Build the final list
            if (baseClassMethods.length > 0) {
                // We have API data - show all base methods with override status from document
                for (const methodNode of baseClassMethods) {
                    const docInfo = documentOverrides.get(methodNode.name);
                    this.methods.push({
                        name: methodNode.name,
                        node: methodNode,
                        isOverridden: !!docInfo,
                        callsBase: docInfo?.callsBase || false,
                        lineNumber: docInfo?.lineNumber
                    });
                }
            } else {
                // No API data - show only overrides found in document
                logger.debug(`[OverridableMethods] No API data, showing document overrides only`);
                for (const [methodName, info] of documentOverrides) {
                    this.methods.push({
                        name: methodName,
                        node: baseClassNode,
                        isOverridden: true,
                        callsBase: info.callsBase,
                        lineNumber: info.lineNumber
                    });
                }
            }

            // Sort: overridden first, then by name
            this.methods.sort((a, b) => {
                if (a.isOverridden && !b.isOverridden) return -1;
                if (!a.isOverridden && b.isOverridden) return 1;
                return a.name.localeCompare(b.name);
            });

            logger.info(`[OverridableMethods] Result: ${this.methods.length} methods, ${this.methods.filter(m => m.isOverridden).length} overridden`);

        } catch (e: any) {
            logger.error('[OverridableMethods] Error', e);
        }

        this.loading = false;
        this.refresh();
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    clear() {
        this.methods = [];
        this.baseClassName = '';
        this.noBaseClass = false;
        this.currentDocument = null;
        this.refresh();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: TreeItem): TreeItem[] {
        if (this.loading) return [new InfoItem('Loading...', 'sync~spin')];

        if (this.noBaseClass) {
            return [new InfoItem('Selected class does not support override', 'info')];
        }

        if (!this.baseClassName) {
            return [new InfoItem('Open a C# class to see overridable methods', 'info')];
        }

        if (!element) {
            if (this.methods.length === 0) {
                return [new InfoItem('No overridable methods in base class', 'info')];
            }

            // Summary stats
            const overriddenCount = this.methods.filter(m => m.isOverridden).length;
            const notOverriddenCount = this.methods.filter(m => !m.isOverridden).length;
            const missingBaseCall = this.methods.filter(m => m.isOverridden && !m.callsBase).length;

            const items: TreeItem[] = [];

            // Header info
            items.push(new InfoItem(`Base: ${this.baseClassName}`, 'symbol-class'));
            items.push(new InfoItem(`${overriddenCount}/${this.methods.length} overridden`, 'checklist'));

            if (missingBaseCall > 0) {
                items.push(new InfoItem(`${missingBaseCall} missing base call`, 'warning'));
            }

            items.push(new InfoItem('───────────────', 'dash'));

            // Method items
            for (const method of this.methods) {
                items.push(new OverrideMethodItem(method));
            }

            return items;
        }

        return [];
    }
}

// ============================================================================
// 5. Implementations Provider
// ============================================================================

export class ImplementationsProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private byProject: Map<string, NodeItem[]> = new Map();
    private currentNode: GraphNode | null = null;
    private loading = false;

    refresh() { this._onDidChange.fire(); }

    async loadForInterface(node: GraphNode) {
        this.loading = true;
        this.currentNode = node;
        this.byProject.clear();
        this.refresh();

        const client = getClient();
        if (!client || node.kind !== 'interface') {
            this.loading = false;
            this.refresh();
            return;
        }

        try {
            const response = await client.findImplementations(node.id);

            for (const impl of response.implementations) {
                const project = impl.project || 'unknown';
                if (!this.byProject.has(project)) this.byProject.set(project, []);
                this.byProject.get(project)!.push(new NodeItem(impl, false));
            }
        } catch (e) {
            console.error('Implementations error:', e);
        }

        this.loading = false;
        this.refresh();
    }

    clear() {
        this.currentNode = null;
        this.byProject.clear();
        this.refresh();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: TreeItem): TreeItem[] {
        if (this.loading) return [new InfoItem('Loading...', 'sync~spin')];

        if (!this.currentNode) {
            return [new InfoItem('Select an interface to see implementations', 'info')];
        }

        if (this.currentNode.kind !== 'interface') {
            return [new InfoItem('Select an interface (not a class)', 'warning')];
        }

        if (!element) {
            if (this.byProject.size === 0) {
                return [new InfoItem('No implementations found', 'check')];
            }

            return Array.from(this.byProject.entries())
                .map(([project, items]) => new GroupItem(project, items, 'folder'));
        }

        if (element instanceof GroupItem) {
            return element.children;
        }

        return [];
    }
}
