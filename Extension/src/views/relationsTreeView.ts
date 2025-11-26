import * as vscode from 'vscode';
import { getGrafoClient, GrafoClient } from '../api/grafoClient';
import { GraphNode, GraphEdge, CodeContextResponse } from '../types';
import { getMaxRelatedItems, getGraphVersion } from '../config';
import { logger } from '../logger';

/**
 * Get the Git repository root path using VS Code's Git extension
 */
function getGitRepositoryRoot(): string | undefined {
    try {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            logger.debug('Git extension not found');
            return undefined;
        }

        const git = gitExtension.exports?.getAPI(1);
        if (!git) {
            logger.debug('Git API not available');
            return undefined;
        }

        // Get the repository that contains the active file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const repo = git.getRepository(activeEditor.document.uri);
            if (repo) {
                return repo.rootUri.fsPath;
            }
        }

        // Fallback to first repository
        if (git.repositories.length > 0) {
            return git.repositories[0].rootUri.fsPath;
        }

        return undefined;
    } catch (error) {
        logger.debug(`Error getting Git repository root: ${error}`);
        return undefined;
    }
}

type TreeItemType = RelationGroupItem | RelationItem | MessageItem;

export class RelationsTreeProvider implements vscode.TreeDataProvider<TreeItemType> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItemType | undefined | null | void> =
        new vscode.EventEmitter<TreeItemType | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItemType | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private currentContext: CodeContextResponse | null = null;
    private currentElementName: string = '';

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async loadElement(
        name: string,
        type: 'method' | 'class' | 'interface',
        className?: string,
        namespace?: string
    ): Promise<void> {
        const client = getGrafoClient();
        if (!client) {
            vscode.window.showErrorMessage('Grafo: Not connected to API');
            return;
        }

        try {
            // Handle Extended classes - they don't exist in graph, search for base class
            let searchName = name;
            let searchNamespace = namespace;
            let searchClassName = className;

            // Check if we're in an Extended class file
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'csharp') {
                const text = editor.document.getText();
                const extendedClassMatch = text.match(/class\s+(\w+Extended)\s*:\s*([^{\n]+)/);

                if (extendedClassMatch) {
                    const extendedClassName = extendedClassMatch[1];
                    const inheritance = extendedClassMatch[2];
                    const baseClassInfo = this.extractBaseClassInfo(inheritance);

                    if (baseClassInfo) {
                        // If searching for the Extended class itself, use base class
                        if (type === 'class' && name === extendedClassName) {
                            logger.info(`Extended class detected: ${name} -> searching for base: ${baseClassInfo.fullName}`);
                            searchName = baseClassInfo.name;
                            // Use namespace from inheritance or resolve from usings
                            if (baseClassInfo.namespace) {
                                searchNamespace = baseClassInfo.namespace;
                            } else {
                                const usings = this.findUsings(text);
                                logger.info(`Base class "${baseClassInfo.name}" has no namespace, resolving from ${usings.length} usings`);
                                searchNamespace = await this.resolveNamespaceFromUsings(client, baseClassInfo.name, usings);
                            }
                        }
                        // If searching for a method in an Extended class, use base class name
                        else if (type === 'method') {
                            if (className === extendedClassName || !className) {
                                logger.info(`Method in Extended class: ${name} -> using base class: ${baseClassInfo.fullName}`);
                                searchClassName = baseClassInfo.name;
                                // Use namespace from inheritance or resolve from usings
                                if (baseClassInfo.namespace) {
                                    searchNamespace = baseClassInfo.namespace;
                                } else {
                                    const usings = this.findUsings(text);
                                    logger.info(`Base class "${baseClassInfo.name}" has no namespace, resolving from ${usings.length} usings`);
                                    searchNamespace = await this.resolveNamespaceFromUsings(client, baseClassInfo.name, usings);
                                }
                            }
                        }
                    }
                }
            }

            this.currentElementName = searchName;
            logger.info(`Loading relations for: ${searchName} (${type})`);

            this.currentContext = await client.getCodeContext({
                methodName: type === 'method' ? searchName : undefined,
                className: searchClassName || (type !== 'method' ? searchName : undefined),
                namespace: searchNamespace,
                includeRelated: true,
                maxRelated: getMaxRelatedItems(),
            });

            logger.info(`Context loaded: found=${this.currentContext.found}, ` +
                `relatedElements=${this.currentContext.relatedElements?.length || 0}, ` +
                `edges=${this.currentContext.edges?.length || 0}`);

            this.refresh();
        } catch (error) {
            logger.error('Error loading element:', error);
            vscode.window.showErrorMessage(`Grafo: Failed to load relations - ${error}`);
        }
    }

    clear(): void {
        this.currentContext = null;
        this.currentElementName = '';
        this.refresh();
    }

    getTreeItem(element: TreeItemType): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeItemType): Thenable<TreeItemType[]> {
        if (!this.currentContext || !this.currentContext.found) {
            if (this.currentElementName) {
                return Promise.resolve([new MessageItem('No data found', 'warning')]);
            }
            return Promise.resolve([new MessageItem('Select a class or method to see relations', 'info')]);
        }

        if (!element) {
            // Root level - return relationship groups
            const groups = this.getRelationshipGroups();
            if (groups.length === 0) {
                return Promise.resolve([new MessageItem('No relationships found', 'info')]);
            }
            return Promise.resolve(groups);
        }

        if (element instanceof RelationGroupItem) {
            // Return items in this group
            return Promise.resolve(element.children);
        }

        return Promise.resolve([]);
    }

    private getRelationshipGroups(): RelationGroupItem[] {
        if (!this.currentContext?.mainElement) {
            return [];
        }

        const mainId = this.currentContext.mainElement.Id;
        const nodes = this.currentContext.relatedElements || [];
        const edges = this.currentContext.edges || [];

        logger.debug(`Building relationship groups: mainId=${mainId}, nodes=${nodes.length}, edges=${edges.length}`);

        const nodeMap = new Map(nodes.map(n => [n.Id, n]));
        const groups: Map<string, RelationItem[]> = new Map();

        // Initialize groups
        const groupNames = [
            'Inherits From',
            'Inherited By',
            'Implements',
            'Implemented By',
            'Calls',
            'Called By',
            'Uses',
            'Used By',
            'Contains',
            'Contained In',
        ];
        groupNames.forEach(name => groups.set(name, []));

        // Categorize edges
        for (const edge of edges) {
            const isSource = edge.Source === mainId;
            const otherId = isSource ? edge.Target : edge.Source;

            // Try to get the node from relatedElements, or create a minimal node from the ID
            let otherNode = nodeMap.get(otherId);

            if (!otherNode) {
                // Extract info from the edge ID (format: "type:Namespace.ClassName" or similar)
                otherNode = this.createNodeFromId(otherId);
                logger.debug(`Created node from ID: ${otherId} -> ${otherNode?.Name}`);
            }

            if (!otherNode) {
                logger.debug(`Skipping edge with unknown node: ${otherId}`);
                continue;
            }

            const item = new RelationItem(otherNode, edge, mainId);
            const groupName = this.getGroupName(edge.Relationship, isSource);

            groups.get(groupName)?.push(item);
        }

        // Create tree items for non-empty groups
        const result: RelationGroupItem[] = [];
        for (const [groupName, items] of groups) {
            if (items.length > 0) {
                result.push(new RelationGroupItem(groupName, items));
            }
        }

        logger.info(`Created ${result.length} relationship groups`);
        return result;
    }

    private createNodeFromId(nodeId: string): GraphNode | undefined {
        if (!nodeId) return undefined;

        // Parse node ID format: "type:Namespace.ClassName" or "component:Namespace.ClassName"
        let fullName = nodeId;
        let nodeType = 'Class';

        if (nodeId.includes(':')) {
            const parts = nodeId.split(':', 2);
            const prefix = parts[0].toLowerCase();
            fullName = parts[1] || nodeId;

            // Determine type from prefix
            if (prefix === 'interface' || fullName.match(/^I[A-Z]/)) {
                nodeType = 'Interface';
            } else if (prefix === 'method') {
                nodeType = 'Method';
            }
        }

        // Extract name and namespace
        const nameParts = fullName.split('.');
        const name = nameParts[nameParts.length - 1] || fullName;
        const namespace = nameParts.slice(0, -1).join('.') || '';

        return {
            Id: nodeId,
            Name: name,
            FullName: fullName,
            Type: nodeType as any,
            Project: '',
            Namespace: namespace,
            Accessibility: 'Public',
            IsAbstract: false,
            IsStatic: false,
            IsSealed: false,
        };
    }

    /**
     * Extract base class info from inheritance declaration
     */
    private extractBaseClassInfo(inheritance: string): { name: string; fullName: string; namespace?: string } | null {
        const parts = inheritance.split(',').map(p => p.trim());

        for (const part of parts) {
            const simpleName = part.split('.').pop() || part;
            // Skip interfaces (start with I followed by uppercase)
            if (simpleName && !simpleName.match(/^I[A-Z]/)) {
                const dotIndex = part.lastIndexOf('.');
                const namespace = dotIndex > 0 ? part.substring(0, dotIndex) : undefined;
                return { name: simpleName, fullName: part, namespace };
            }
        }

        if (parts.length > 0) {
            const part = parts[0].trim();
            const simpleName = part.split('.').pop() || part;
            const dotIndex = part.lastIndexOf('.');
            const namespace = dotIndex > 0 ? part.substring(0, dotIndex) : undefined;
            return { name: simpleName, fullName: part, namespace };
        }

        return null;
    }

    /**
     * Extract all using statements from a document
     */
    private findUsings(text: string): string[] {
        const usings: string[] = [];
        const usingPattern = /using\s+([\w.]+)\s*;/g;
        let match;
        while ((match = usingPattern.exec(text)) !== null) {
            usings.push(match[1]);
        }
        return usings;
    }

    /**
     * Resolve the correct namespace for a class by searching and matching against usings
     */
    private async resolveNamespaceFromUsings(
        client: GrafoClient,
        className: string,
        usings: string[]
    ): Promise<string | undefined> {
        try {
            logger.info(`Searching for class "${className}" to resolve namespace from usings`);
            const results = await client.searchNodes({
                query: className,
                nodeType: 'Class',
                limit: 20,
            });

            if (results.length === 0) {
                logger.info(`No classes found with name "${className}"`);
                return undefined;
            }

            logger.info(`Found ${results.length} classes with name "${className}"`);

            // Filter to exact name matches
            const exactMatches = results.filter(n => n.Name === className);

            if (exactMatches.length === 1) {
                logger.info(`Single match found: ${exactMatches[0].Namespace}`);
                return exactMatches[0].Namespace;
            }

            // Multiple matches - filter by usings
            for (const node of exactMatches) {
                if (node.Namespace && usings.includes(node.Namespace)) {
                    logger.info(`Namespace "${node.Namespace}" matches using statement`);
                    return node.Namespace;
                }
            }

            // Try partial match
            for (const node of exactMatches) {
                for (const using of usings) {
                    if (node.Namespace && (
                        node.Namespace.startsWith(using) ||
                        using.startsWith(node.Namespace)
                    )) {
                        logger.info(`Namespace "${node.Namespace}" partially matches using "${using}"`);
                        return node.Namespace;
                    }
                }
            }

            // Fallback to first match
            if (exactMatches.length > 0 && exactMatches[0].Namespace) {
                logger.info(`Using first match as fallback: ${exactMatches[0].Namespace}`);
                return exactMatches[0].Namespace;
            }

            return undefined;
        } catch (error) {
            logger.error('Error resolving namespace from usings:', error);
            return undefined;
        }
    }

    private getGroupName(relationship: string, isSource: boolean): string {
        switch (relationship) {
            case 'Inherits':
                return isSource ? 'Inherits From' : 'Inherited By';
            case 'Implements':
                return isSource ? 'Implements' : 'Implemented By';
            case 'Calls':
                return isSource ? 'Calls' : 'Called By';
            case 'Uses':
                return isSource ? 'Uses' : 'Used By';
            case 'Contains':
                return isSource ? 'Contains' : 'Contained In';
            default:
                return isSource ? 'Uses' : 'Used By';
        }
    }
}

class MessageItem extends vscode.TreeItem {
    constructor(message: string, type: 'info' | 'warning' | 'error') {
        super(message, vscode.TreeItemCollapsibleState.None);
        switch (type) {
            case 'warning':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

class RelationGroupItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly children: RelationItem[]
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.description = `(${children.length})`;
        this.contextValue = 'relationGroup';
        this.iconPath = this.getGroupIcon(label);
    }

    private getGroupIcon(label: string): vscode.ThemeIcon {
        if (label.includes('Inherit')) {
            return new vscode.ThemeIcon('type-hierarchy');
        }
        if (label.includes('Implement')) {
            return new vscode.ThemeIcon('symbol-interface');
        }
        if (label.includes('Call')) {
            return new vscode.ThemeIcon('call-outgoing');
        }
        if (label.includes('Use')) {
            return new vscode.ThemeIcon('references');
        }
        if (label.includes('Contain')) {
            return new vscode.ThemeIcon('symbol-namespace');
        }
        return new vscode.ThemeIcon('list-tree');
    }
}

class RelationItem extends vscode.TreeItem {
    constructor(
        public readonly node: GraphNode,
        public readonly edge: GraphEdge,
        private readonly mainId: string
    ) {
        super(node.Name, vscode.TreeItemCollapsibleState.None);

        this.description = node.Namespace || node.Project || '';
        this.tooltip = this.createTooltip();
        this.contextValue = 'relationItem';
        this.iconPath = this.getNodeIcon();

        // Command to navigate to the file - use RelativePath + workspace root
        const absolutePath = this.resolveAbsolutePath();
        if (absolutePath) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [
                    vscode.Uri.file(absolutePath),
                    {
                        selection: node.Location?.Line
                            ? new vscode.Range(
                                  node.Location.Line - 1,
                                  0,
                                  node.Location.Line - 1,
                                  0
                              )
                            : undefined,
                    },
                ],
            };
        }
    }

    /**
     * Resolve the absolute path from RelativePath + Git repo root, or use AbsolutePath as fallback
     */
    private resolveAbsolutePath(): string | undefined {
        if (!this.node.Location) {
            return undefined;
        }

        // Prefer RelativePath + Git repo root
        if (this.node.Location.RelativePath) {
            const gitRoot = getGitRepositoryRoot();
            if (gitRoot) {
                const relativePath = this.node.Location.RelativePath.replace(/^[\\/]+/, '');
                return vscode.Uri.joinPath(vscode.Uri.file(gitRoot), relativePath).fsPath;
            }
        }

        // Fallback to AbsolutePath
        return this.node.Location.AbsolutePath;
    }

    private createTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${this.node.Name}**\n\n`);
        md.appendMarkdown(`- Type: ${this.node.Type}\n`);

        if (this.node.Namespace) {
            md.appendMarkdown(`- Namespace: \`${this.node.Namespace}\`\n`);
        }

        if (this.node.Project) {
            md.appendMarkdown(`- Project: ${this.node.Project}\n`);
        }

        if (this.node.Accessibility) {
            md.appendMarkdown(`- Accessibility: ${this.node.Accessibility}\n`);
        }

        if (this.edge.Count > 1) {
            md.appendMarkdown(`- Reference count: ${this.edge.Count}\n`);
        }

        // Show file location if available
        if (this.node.Location?.RelativePath) {
            const line = this.node.Location.Line || 1;
            md.appendMarkdown(`\n---\n\n📁 \`${this.node.Location.RelativePath}:${line}\`\n\n`);
            md.appendMarkdown(`*Click to open file*`);
        }

        return md;
    }

    private getNodeIcon(): vscode.ThemeIcon {
        switch (this.node.Type) {
            case 'Class':
                return new vscode.ThemeIcon('symbol-class');
            case 'Interface':
                return new vscode.ThemeIcon('symbol-interface');
            case 'Method':
                return new vscode.ThemeIcon('symbol-method');
            case 'Property':
                return new vscode.ThemeIcon('symbol-property');
            case 'Field':
                return new vscode.ThemeIcon('symbol-field');
            case 'Enum':
                return new vscode.ThemeIcon('symbol-enum');
            case 'Struct':
                return new vscode.ThemeIcon('symbol-struct');
            default:
                return new vscode.ThemeIcon('symbol-misc');
        }
    }
}

// Hierarchy Tree Provider
export class HierarchyTreeProvider implements vscode.TreeDataProvider<HierarchyItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HierarchyItem | undefined | null | void> =
        new vscode.EventEmitter<HierarchyItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HierarchyItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private rootItem: HierarchyItem | null = null;
    private currentClassName: string = '';

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async loadClass(classId: string): Promise<void> {
        const client = getGrafoClient();
        if (!client) {
            vscode.window.showErrorMessage('Grafo: Not connected to API');
            return;
        }

        try {
            logger.info(`Loading hierarchy for class: ${classId}`);

            // Extract class name from ID
            let className = classId;
            let namespace: string | undefined;

            if (classId.includes(':')) {
                const fullName = classId.split(':')[1] || classId;
                const parts = fullName.split('.');
                className = parts[parts.length - 1];
                namespace = parts.slice(0, -1).join('.');
            } else if (classId.includes('.')) {
                const parts = classId.split('.');
                className = parts[parts.length - 1];
                namespace = parts.slice(0, -1).join('.');
            }

            this.currentClassName = className;

            // Build the hierarchy tree recursively
            this.rootItem = await this.buildHierarchyTree(client, className, namespace, 0);

            logger.info(`Hierarchy tree built for: ${className}`);
            this.refresh();
        } catch (error) {
            logger.error('Error loading hierarchy:', error);
            this.rootItem = null;
            this.refresh();
        }
    }

    private async buildHierarchyTree(
        client: any,
        className: string,
        namespace: string | undefined,
        depth: number
    ): Promise<HierarchyItem | null> {
        if (depth > 10) {
            // Prevent infinite recursion
            return null;
        }

        try {
            const context = await client.getCodeContext({
                className,
                namespace,
                includeRelated: true,
                maxRelated: 50,
            });

            if (!context.found || !context.mainElement) {
                // Class not found, create a placeholder
                return new HierarchyItem(
                    className,
                    namespace || '',
                    depth === 0 ? 'current' : 'ancestor',
                    depth,
                    [], // No children
                    undefined // No location
                );
            }

            const mainId = context.mainElement.Id;
            const nodeMap = new Map((context.relatedElements || []).map((n: GraphNode) => [n.Id, n]));

            // Find parent classes (ancestors)
            const parentItems: HierarchyItem[] = [];

            for (const edge of (context.edges || [])) {
                if (edge.Relationship === 'Inherits' && edge.Source === mainId) {
                    // This class inherits from edge.Target
                    const parentId = edge.Target;
                    let parentNode = nodeMap.get(parentId);

                    if (!parentNode && parentId) {
                        // Extract info from ID
                        const parts = parentId.includes(':')
                            ? parentId.split(':')[1].split('.')
                            : parentId.split('.');
                        const name = parts[parts.length - 1] || parentId;
                        const ns = parts.slice(0, -1).join('.');
                        parentNode = {
                            Id: parentId,
                            Name: name,
                            FullName: parentId,
                            Type: 'Class' as const,
                            Project: '',
                            Namespace: ns,
                            Accessibility: 'Public',
                            IsAbstract: false,
                            IsStatic: false,
                            IsSealed: false,
                        };
                    }

                    if (parentNode) {
                        // Recursively build parent's hierarchy
                        const pNode = parentNode as GraphNode;
                        const parentTree = await this.buildHierarchyTree(
                            client,
                            pNode.Name,
                            pNode.Namespace,
                            depth + 1
                        );

                        if (parentTree) {
                            parentItems.push(parentTree);
                        }
                    }
                }
            }

            // Create the current item with parents as children (inverted tree - ancestors at top)
            const role = depth === 0 ? 'current' : 'ancestor';
            return new HierarchyItem(
                context.mainElement.Name,
                context.mainElement.Namespace,
                role,
                depth,
                parentItems,
                context.mainElement.Location // Pass location for navigation
            );
        } catch (error) {
            logger.debug(`Error building hierarchy for ${className}: ${error}`);
            return null;
        }
    }

    clear(): void {
        this.rootItem = null;
        this.currentClassName = '';
        this.refresh();
    }

    getTreeItem(element: HierarchyItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HierarchyItem): Thenable<HierarchyItem[]> {
        if (!element) {
            // Root level
            if (!this.rootItem) {
                return Promise.resolve([
                    new HierarchyItem('Select a class to view hierarchy', '', 'info', 0, [])
                ]);
            }
            return Promise.resolve([this.rootItem]);
        }

        // Return children of the element
        return Promise.resolve(element.children || []);
    }
}

class HierarchyItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly namespace: string,
        public readonly role: 'ancestor' | 'current' | 'descendant' | 'info',
        public readonly depth: number,
        public readonly children: HierarchyItem[] = [],
        public readonly location?: { RelativePath?: string; AbsolutePath?: string; Line?: number }
    ) {
        // Make expandable if has children
        super(
            name,
            children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        this.description = namespace;

        // Create tooltip with location info
        const md = new vscode.MarkdownString();

        switch (role) {
            case 'ancestor':
                this.iconPath = new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('charts.blue'));
                md.appendMarkdown(`**Base class**\n\n\`${namespace}.${name}\``);
                break;
            case 'current':
                this.iconPath = new vscode.ThemeIcon('target', new vscode.ThemeColor('charts.green'));
                md.appendMarkdown(`**Current class**\n\n\`${namespace}.${name}\``);
                break;
            case 'descendant':
                this.iconPath = new vscode.ThemeIcon('arrow-down');
                md.appendMarkdown(`**Derived class**\n\n\`${namespace}.${name}\``);
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                md.appendMarkdown(`${name}`);
                break;
        }

        // Add location info to tooltip
        if (location?.RelativePath) {
            const line = location.Line || 1;
            md.appendMarkdown(`\n\n---\n\n📁 \`${location.RelativePath}:${line}\`\n\n*Click to open file*`);
        }

        this.tooltip = md;

        // Add navigation command - use RelativePath + workspace root
        const absolutePath = this.resolveAbsolutePath();
        if (absolutePath) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [
                    vscode.Uri.file(absolutePath),
                    {
                        selection: location?.Line
                            ? new vscode.Range(
                                  location.Line - 1,
                                  0,
                                  location.Line - 1,
                                  0
                              )
                            : undefined,
                    },
                ],
            };
        }

        // Add context value for potential actions
        this.contextValue = role;
    }

    /**
     * Resolve the absolute path from RelativePath + Git repo root, or use AbsolutePath as fallback
     */
    private resolveAbsolutePath(): string | undefined {
        if (!this.location) {
            return undefined;
        }

        // Prefer RelativePath + Git repo root
        if (this.location.RelativePath) {
            const gitRoot = getGitRepositoryRoot();
            if (gitRoot) {
                const relativePath = this.location.RelativePath.replace(/^[\\/]+/, '');
                return vscode.Uri.joinPath(vscode.Uri.file(gitRoot), relativePath).fsPath;
            }
        }

        // Fallback to AbsolutePath
        return this.location.AbsolutePath;
    }
}

// Statistics Tree Provider
export class StatsTreeProvider implements vscode.TreeDataProvider<StatsItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatsItem | undefined | null | void> =
        new vscode.EventEmitter<StatsItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatsItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private stats: StatsItem[] = [];

    refresh(): void {
        this.loadStats();
    }

    async loadStats(): Promise<void> {
        const client = getGrafoClient();
        if (!client) {
            this.stats = [new StatsItem('Not connected', 'Configure API', 'error')];
            this._onDidChangeTreeData.fire();
            return;
        }

        this.stats = [new StatsItem('Loading...', '', 'loading')];
        this._onDidChangeTreeData.fire();

        try {
            // Load graph statistics
            const graphStats = await client.getStatistics();
            const currentVersion = getGraphVersion();

            this.stats = [
                new StatsItem('Version', currentVersion || 'All Versions', 'version'),
                new StatsItem('---', '', 'separator'),
                new StatsItem('Projects', String(graphStats.totalProjects || 0), 'project'),
                new StatsItem('Nodes', String(graphStats.totalNodes || 0), 'node'),
                new StatsItem('Edges', String(graphStats.totalEdges || 0), 'edge'),
            ];

            // Try to load semantic stats separately
            try {
                const semanticStats = await client.getSemanticStats();
                if (semanticStats?.relationships) {
                    this.stats.push(
                        new StatsItem('---', '', 'separator'),
                        new StatsItem('Inherits', String(semanticStats.relationships.Inherits || 0), 'relation'),
                        new StatsItem('Implements', String(semanticStats.relationships.Implements || 0), 'relation'),
                        new StatsItem('Calls', String(semanticStats.relationships.Calls || 0), 'relation'),
                        new StatsItem('Uses', String(semanticStats.relationships.Uses || 0), 'relation'),
                    );
                }
            } catch {
                // Semantic stats failed, but graph stats succeeded
                this.stats.push(new StatsItem('Semantic stats unavailable', '', 'warning'));
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('Error loading stats:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.stats = [new StatsItem('Error', errorMsg.substring(0, 50), 'error')];
            this._onDidChangeTreeData.fire();
        }
    }

    getTreeItem(element: StatsItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<StatsItem[]> {
        return Promise.resolve(this.stats);
    }
}

class StatsItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly category: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        if (category !== 'separator' && value) {
            this.description = value;
        }

        switch (category) {
            case 'version':
                this.iconPath = new vscode.ThemeIcon('tag');
                break;
            case 'project':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'node':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
            case 'edge':
                this.iconPath = new vscode.ThemeIcon('git-compare');
                break;
            case 'relation':
                this.iconPath = new vscode.ThemeIcon('link');
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                break;
            case 'warning':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
                break;
            case 'loading':
                this.iconPath = new vscode.ThemeIcon('sync~spin');
                break;
        }
    }
}
