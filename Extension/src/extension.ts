/**
 * Grafo Code Explorer Extension
 * 6 Widgets: Graph, Impact, Dependencies, ClassOverview, LayerMap, Implementations
 */
import * as vscode from 'vscode';
import { initClient, getClient } from './api/grafoClient';
import { GraphNode, CurrentContext } from './types';
import { logger } from './logger';
import {
    ImpactProvider,
    DependenciesProvider,
    ClassOverviewProvider,
    OverridableMethodsProvider,
    ImplementationsProvider
} from './views/treeProviders';
import { GraphViewProvider } from './views/graphViewProvider';
import { GrafoPanel } from './views/grafoPanel';

// Providers
let impactProvider: ImpactProvider;
let dependenciesProvider: DependenciesProvider;
let classOverviewProvider: ClassOverviewProvider;
let overridableMethodsProvider: OverridableMethodsProvider;
let implementationsProvider: ImplementationsProvider;
let graphViewProvider: GraphViewProvider;

// Status bar
let statusBar: vscode.StatusBarItem;

// Current context
let currentContext: CurrentContext | null = null;
let debounceTimer: NodeJS.Timeout | undefined;

/**
 * Prompt user to select version on first run.
 * Shows available versions from API or manual input.
 */
async function promptInitialVersionSelection(context: vscode.ExtensionContext, apiUrl: string): Promise<string | undefined> {
    // Show welcome message
    const action = await vscode.window.showInformationMessage(
        'Grafo Code Explorer: Please select a graph version to continue.',
        'Select Version',
        'Enter Manually'
    );

    if (!action) {
        return undefined;
    }

    let selectedVersion: string | undefined;

    if (action === 'Select Version') {
        // Try to fetch versions from API
        try {
            const axios = await import('axios');
            const response = await axios.default.get(`${apiUrl}/api/v1/versions`, { timeout: 5000 });
            const versions = response.data.versions as string[];
            const defaultVersion = response.data.default as string;

            if (versions && versions.length > 0) {
                const selected = await vscode.window.showQuickPick(
                    versions.map(v => ({
                        label: v,
                        description: v === defaultVersion ? '(default)' : ''
                    })),
                    {
                        placeHolder: 'Select a graph version',
                        title: 'Grafo: Initial Setup'
                    }
                );
                selectedVersion = selected?.label;
            }
        } catch (e) {
            logger.warn('Could not fetch versions from API, prompting manual input');
            // Fall through to manual input
        }
    }

    // Manual input if API failed or user chose manual
    if (!selectedVersion) {
        selectedVersion = await vscode.window.showInputBox({
            title: 'Grafo: Enter Graph Version',
            prompt: 'Enter the graph version (e.g., 7.10.2)',
            placeHolder: '7.10.2',
            validateInput: (value) => {
                if (!value || !value.match(/^\d+\.\d+(\.\d+)?$/)) {
                    return 'Please enter a valid version (e.g., 7.10.2)';
                }
                return null;
            }
        });
    }

    if (selectedVersion) {
        // Save to configuration
        const config = vscode.workspace.getConfiguration('grafo');
        await config.update('graphVersion', selectedVersion, vscode.ConfigurationTarget.Global);

        // Mark as initialized
        await context.globalState.update('grafo.initialized', true);

        logger.info(`Initial version configured: ${selectedVersion}`);
        vscode.window.showInformationMessage(`Grafo: Version ${selectedVersion} configured successfully.`);
    }

    return selectedVersion;
}

export async function activate(context: vscode.ExtensionContext) {
    logger.separator('Extension Activation');
    logger.info('Grafo Code Explorer v0.2.0 activating...');

    // Get configuration
    const config = vscode.workspace.getConfiguration('grafo');
    const apiUrl = config.get<string>('apiUrl', 'http://localhost:8081');
    let version = config.get<string>('graphVersion', '');

    // Check if first run (version not configured)
    const isFirstRun = !context.globalState.get<boolean>('grafo.initialized');

    // Only prompt for version if not already configured in settings
    if (!version) {
        logger.info('No version configured - requesting version selection...');
        const selectedVersion = await promptInitialVersionSelection(context, apiUrl);
        if (selectedVersion) {
            version = selectedVersion;
        } else {
            // User cancelled - show warning and use default
            vscode.window.showWarningMessage('Grafo: No version selected. Please configure version in settings.');
            version = '6.5.0';
        }
    } else if (isFirstRun) {
        // Version already configured, just mark as initialized
        await context.globalState.update('grafo.initialized', true);
    }

    logger.info(`Config: API=${apiUrl}, Version=${version}`);

    // Initialize API client
    initClient(apiUrl, version);

    // Initialize providers
    impactProvider = new ImpactProvider();
    dependenciesProvider = new DependenciesProvider();
    classOverviewProvider = new ClassOverviewProvider();
    overridableMethodsProvider = new OverridableMethodsProvider();
    implementationsProvider = new ImplementationsProvider();
    graphViewProvider = new GraphViewProvider(context.extensionUri);

    // Register tree views
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('grafo.impactView', impactProvider),
        vscode.window.registerTreeDataProvider('grafo.dependenciesView', dependenciesProvider),
        vscode.window.registerTreeDataProvider('grafo.classOverviewView', classOverviewProvider),
        vscode.window.registerTreeDataProvider('grafo.overridableMethodsView', overridableMethodsProvider),
        vscode.window.registerTreeDataProvider('grafo.implementationsView', implementationsProvider)
    );

    // Register webview provider for graph
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(GraphViewProvider.viewType, graphViewProvider)
    );

    // Register commands
    registerCommands(context);

    // Status bar
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = `$(graph) Grafo [${version}]`;
    statusBar.tooltip = 'Click for Grafo options';
    statusBar.command = 'grafo.showMenu';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // Listen for editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(onEditorChange),
        vscode.window.onDidChangeTextEditorSelection(onSelectionChange)
    );

    // Check connection
    checkConnection();

    // Load for current editor
    if (vscode.window.activeTextEditor?.document.languageId === 'csharp') {
        onEditorChange(vscode.window.activeTextEditor);
    }

    logger.info('Extension activated successfully');
    logger.show(); // Show output on first activation
}

function registerCommands(context: vscode.ExtensionContext) {
    // Refresh all views
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.refreshAll', () => {
            impactProvider.refresh();
            dependenciesProvider.refresh();
            classOverviewProvider.refresh();
            overridableMethodsProvider.refresh();
            implementationsProvider.refresh();
            if (vscode.window.activeTextEditor) {
                onEditorChange(vscode.window.activeTextEditor);
            }
        })
    );

    // Check connection
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.checkConnection', checkConnection)
    );

    // Status bar menu
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showMenu', async () => {
            const client = getClient();
            const currentVersion = client?.getVersion() || 'Not configured';

            const options = [
                { label: '$(versions) Select Version', description: `Current: ${currentVersion}`, action: 'selectVersion' },
                { label: '$(plug) Check Connection', description: 'Test API connectivity', action: 'checkConnection' },
                { label: '$(gear) Configure API URL', description: 'Change API endpoint', action: 'configureApiUrl' },
                { label: '$(refresh) Refresh All Views', description: 'Reload all widgets', action: 'refreshAll' },
                { label: '$(debug-restart) Reload Window', description: 'Restart VS Code window', action: 'reloadWindow' }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Grafo Code Explorer',
                title: `Grafo [${currentVersion}]`
            });

            if (selected) {
                switch (selected.action) {
                    case 'selectVersion':
                        vscode.commands.executeCommand('grafo.selectVersion');
                        break;
                    case 'checkConnection':
                        vscode.commands.executeCommand('grafo.checkConnection');
                        break;
                    case 'configureApiUrl':
                        vscode.commands.executeCommand('grafo.configureApiUrl');
                        break;
                    case 'refreshAll':
                        vscode.commands.executeCommand('grafo.refreshAll');
                        break;
                    case 'reloadWindow':
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                        break;
                }
            }
        })
    );

    // Configure API URL
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.configureApiUrl', configureApiUrl)
    );

    // Select version
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.selectVersion', async () => {
            const client = getClient();
            if (!client) return;

            try {
                const versions = await client.getVersions();
                const selected = await vscode.window.showQuickPick(
                    versions.versions.map(v => ({ label: v, description: v === versions.default ? 'default' : '' })),
                    { placeHolder: 'Select graph version' }
                );

                if (selected) {
                    const config = vscode.workspace.getConfiguration('grafo');
                    await config.update('graphVersion', selected.label, vscode.ConfigurationTarget.Global);
                    client.setVersion(selected.label);
                    statusBar.text = `$(graph) Grafo [${selected.label}]`;
                    vscode.commands.executeCommand('grafo.refreshAll');
                }
            } catch (e) {
                vscode.window.showErrorMessage('Failed to get versions');
            }
        })
    );

    // Navigate to node (opens file in background without losing focus, always in left column)
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.navigateToNode', async (node: GraphNode, preserveFocus: boolean = true) => {
            if (!node.source?.file) return;

            // Try to find file in workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) return;

            for (const folder of workspaceFolders) {
                const filePath = vscode.Uri.joinPath(folder.uri, node.source.file);
                try {
                    await vscode.workspace.fs.stat(filePath);
                    const doc = await vscode.workspace.openTextDocument(filePath);
                    const line = node.source.range?.start || 1;

                    // Find the first editor group (leftmost column)
                    const firstGroup = vscode.window.tabGroups.all.find(g => g.viewColumn === vscode.ViewColumn.One);
                    const targetColumn = firstGroup ? vscode.ViewColumn.One : vscode.ViewColumn.Active;

                    await vscode.window.showTextDocument(doc, {
                        viewColumn: targetColumn,
                        preserveFocus: preserveFocus,
                        preview: false,
                        selection: new vscode.Range(line - 1, 0, line - 1, 0)
                    });
                    return;
                } catch {
                    // File not found in this folder, try next
                }
            }

            vscode.window.showWarningMessage(`File not found: ${node.source.file}`);
        })
    );

    // Show graph
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showGraph', () => {
            vscode.commands.executeCommand('grafo.graphView.focus');
        })
    );

    // Show output console
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showOutput', () => {
            logger.show();
        })
    );

    // Clear output
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.clearOutput', () => {
            logger.clear();
            logger.info('Output cleared');
        })
    );

    // Go to line (for overridable methods)
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.goToLine', (lineNumber: number) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && lineNumber > 0) {
                const position = new vscode.Position(lineNumber - 1, 0);
                const range = new vscode.Range(position, position);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        })
    );

    // Open panel (undock to side)
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.openPanel', () => {
            const panel = GrafoPanel.createOrShow(context.extensionUri);
            // Sync from sidebar graph context (not from current file)
            const sidebarNode = graphViewProvider.currentNode;
            if (sidebarNode) {
                panel.loadForClass(sidebarNode);
            }
            logger.info('Panel opened in side view');
        })
    );

    // Dock panel (close panel, focus sidebar)
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.dockPanel', () => {
            if (GrafoPanel.currentPanel) {
                GrafoPanel.currentPanel.dispose();
            }
            // Focus the sidebar
            vscode.commands.executeCommand('grafo.graphView.focus');
            logger.info('Panel docked to sidebar');
        })
    );
}

async function configureApiUrl() {
    const config = vscode.workspace.getConfiguration('grafo');
    const currentUrl = config.get<string>('apiUrl', 'http://localhost:8081');

    const url = await vscode.window.showInputBox({
        title: 'Grafo API URL',
        prompt: 'Enter the Grafo Query Service API URL',
        value: currentUrl,
        placeHolder: 'http://localhost:8081',
        validateInput: (value) => {
            if (!value) {
                return 'URL is required';
            }
            try {
                new URL(value);
                return null;
            } catch {
                return 'Please enter a valid URL (e.g., http://localhost:8081)';
            }
        }
    });

    if (url && url !== currentUrl) {
        await config.update('apiUrl', url, vscode.ConfigurationTarget.Global);

        // Reinitialize client with new URL
        const version = config.get<string>('graphVersion', '6.5.0');
        initClient(url, version);

        logger.info(`API URL updated to: ${url}`);
        vscode.window.showInformationMessage(`Grafo: API URL updated to ${url}`);

        // Test connection with new URL
        await checkConnection();
    }
}

async function checkConnection() {
    const client = getClient();
    if (!client) {
        statusBar.text = '$(error) Grafo: Not configured';
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        return;
    }

    statusBar.text = '$(sync~spin) Grafo: Connecting...';

    try {
        const health = await client.checkHealth();
        if (health.status === 'healthy') {
            const config = vscode.workspace.getConfiguration('grafo');
            const version = config.get<string>('graphVersion', '6.5.0');
            statusBar.text = `$(check) Grafo [${version}]`;
            statusBar.backgroundColor = undefined;
            vscode.window.showInformationMessage(`Grafo: Connected (${health.service})`);
        } else {
            statusBar.text = '$(warning) Grafo: Degraded';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    } catch (e) {
        statusBar.text = '$(error) Grafo: Disconnected';
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

        const config = vscode.workspace.getConfiguration('grafo');
        const apiUrl = config.get<string>('apiUrl', 'http://localhost:8081');

        const action = await vscode.window.showErrorMessage(
            `Grafo: Cannot connect to API at ${apiUrl}`,
            'Configure URL',
            'Retry'
        );

        if (action === 'Configure URL') {
            vscode.commands.executeCommand('grafo.configureApiUrl');
        } else if (action === 'Retry') {
            checkConnection();
        }
    }
}

function onEditorChange(editor: vscode.TextEditor | undefined) {
    // If no editor or not a C# file, keep current state (don't clear)
    // This prevents clearing when clicking on output console, terminal, etc.
    if (!editor || editor.document.languageId !== 'csharp') {
        return;
    }

    // Only reload if it's a different file
    if (currentContext?.filePath === editor.document.uri.fsPath) {
        return;
    }

    loadContextFromDocument(editor.document);
}

function onSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    if (event.textEditor.document.languageId !== 'csharp') return;

    // Debounce
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        loadContextFromSelection(event.textEditor);
    }, 300);
}

async function loadContextFromDocument(document: vscode.TextDocument) {
    const text = document.getText();
    const fileName = document.uri.fsPath.split(/[\\/]/).pop() || '';

    logger.separator(`File: ${fileName}`);

    // Extract all using statements for namespace resolution
    const usingStatements: string[] = [];
    const usingMatches = text.matchAll(/using\s+([\w.]+);/g);
    for (const match of usingMatches) {
        usingStatements.push(match[1]);
    }
    logger.debug(`Found ${usingStatements.length} using statements`);

    // Extract class info
    const classMatch = text.match(/class\s+(\w+)(?:\s*:\s*([^{\n]+))?/);
    if (!classMatch) {
        logger.debug('No class found in file');
        clearAllProviders();
        return;
    }

    const className = classMatch[1];
    const inheritance = classMatch[2];

    // Check if it's an Extended class (ICBanking pattern)
    let targetClassName = className;
    let baseClassFullName: string | undefined;
    let isExtendedClass = false;

    if (className.endsWith('Extended') && inheritance) {
        isExtendedClass = true;
        const baseClass = extractBaseClass(inheritance);
        if (baseClass) {
            targetClassName = baseClass.simpleName;

            if (baseClass.fullName.includes('.')) {
                // Already fully qualified (e.g., Infocorp.Framework.BusinessComponents.Common)
                baseClassFullName = baseClass.fullName;
            }
            // If simple name, we'll resolve using 'using' statements during search

            logger.info(`Extended class detected: ${className} → base: ${baseClass.fullName}`);
        }
    } else {
        logger.context('Class', className);
    }

    // Extract namespace
    const namespaceMatch = text.match(/namespace\s+([\w.]+)/);
    const namespace = namespaceMatch?.[1];
    if (namespace) {
        logger.context('Namespace', namespace);
    }

    // Find the class in the graph
    const client = getClient();
    if (!client) return;

    try {
        let node: GraphNode | null = null;

        if (baseClassFullName) {
            // Direct fully qualified name (e.g., Infocorp.Framework.BusinessComponents.Common)
            logger.debug(`Searching for class: ${baseClassFullName}`);
            node = await client.findByName(baseClassFullName, 'class');
        } else if (isExtendedClass && usingStatements.length > 0) {
            // Simple name with using statements - search all and filter by namespace
            logger.debug(`Searching for class: ${targetClassName} (will filter by using statements)`);
            const results = await client.searchNodes(targetClassName, 'class', undefined, 30);

            // Find the one whose namespace matches a using statement
            for (const candidate of results) {
                if (candidate.name === targetClassName && candidate.namespace) {
                    // Check if namespace matches any using statement
                    const matchingUsing = usingStatements.find(ns =>
                        candidate.namespace === ns ||
                        candidate.namespace?.startsWith(ns + '.')
                    );
                    if (matchingUsing) {
                        logger.debug(`Found match: ${candidate.namespace}.${candidate.name} (using: ${matchingUsing})`);
                        node = candidate;
                        break;
                    }
                }
            }

            if (!node && results.length > 0) {
                logger.debug(`No namespace match, using first result`);
                node = results[0];
            }
        } else {
            // Simple class name without Extended pattern
            logger.debug(`Searching for class: ${targetClassName}`);
            node = await client.findByName(targetClassName, 'class');
        }
        if (node) {
            logger.info(`Found in graph: ${node.id}`);
            logger.widget('ClassOverview', 'Loading', node.name);
            logger.widget('OverridableMethods', 'Loading', node.name);
            logger.widget('Graph', 'Loading', node.name);

            currentContext = {
                filePath: document.uri.fsPath,
                className: targetClassName,
                namespace,
                baseClass: isExtendedClass ? targetClassName : undefined,
                isExtendedClass,
                node
            };

            // Load widgets
            classOverviewProvider.loadForClass(node);
            overridableMethodsProvider.loadForClass(node, document);
            graphViewProvider.loadForNode(node);

            // Sync to panel if open and not locked
            if (GrafoPanel.currentPanel && !GrafoPanel.currentPanel.isLocked) {
                GrafoPanel.currentPanel.loadForClass(node);
            }

            if (node.kind === 'interface') {
                logger.widget('Implementations', 'Loading', node.name);
                implementationsProvider.loadForInterface(node);
            }
        } else {
            logger.warn(`Class not found in graph: ${targetClassName}`);
        }
    } catch (e: any) {
        logger.error('Error loading context', e);
    }
}

async function loadContextFromSelection(editor: vscode.TextEditor) {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line).text;

    // Check if cursor is on a method
    const methodMatch = line.match(/(?:public|private|protected|internal)\s+(?:static\s+)?(?:override\s+)?(?:virtual\s+)?(?:async\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/);

    if (methodMatch) {
        const methodName = methodMatch[1];
        logger.separator(`Method: ${methodName}`);

        const client = getClient();
        if (!client) return;

        try {
            const node = await client.findByName(methodName, 'method', currentContext?.className);
            if (node) {
                logger.info(`Found method: ${node.id}`);
                logger.widget('Impact', 'Loading', methodName);
                logger.widget('Dependencies', 'Loading', methodName);
                logger.widget('Graph', 'Loading', methodName);

                impactProvider.loadForNode(node);
                dependenciesProvider.loadForNode(node);
                graphViewProvider.loadForNode(node);

                // Sync to panel if open and not locked
                if (GrafoPanel.currentPanel && !GrafoPanel.currentPanel.isLocked) {
                    GrafoPanel.currentPanel.loadForNode(node);
                }
            } else {
                logger.warn(`Method not found in graph: ${methodName}`);
            }
        } catch (e: any) {
            logger.error('Error loading method context', e);
        }
        return;
    }

    // Check if cursor is on an interface reference
    const wordRange = editor.document.getWordRangeAtPosition(position);
    if (wordRange) {
        const word = editor.document.getText(wordRange);
        if (word.startsWith('I') && word.length > 1 && word[1] === word[1].toUpperCase()) {
            logger.debug(`Interface detected: ${word}`);

            const client = getClient();
            if (!client) return;

            try {
                const node = await client.findByName(word, 'interface');
                if (node) {
                    logger.widget('Implementations', 'Loading', word);
                    implementationsProvider.loadForInterface(node);
                }
            } catch (e) {
                // Ignore
            }
        }
    }
}

function extractBaseClass(inheritance: string): { fullName: string; simpleName: string } | null {
    const parts = inheritance.split(',').map(p => p.trim());

    for (const part of parts) {
        const simpleName = part.split('.').pop() || part;
        // Skip interfaces (start with I followed by uppercase)
        if (simpleName && !simpleName.match(/^I[A-Z]/)) {
            return {
                fullName: part,      // e.g., "Infocorp.Framework.BusinessComponents.Common"
                simpleName: simpleName // e.g., "Common"
            };
        }
    }

    return null;
}

function clearAllProviders() {
    currentContext = null;
    impactProvider.clear();
    dependenciesProvider.clear();
    classOverviewProvider.clear();
    overridableMethodsProvider.clear();
    implementationsProvider.clear();
    graphViewProvider.clear();
    if (GrafoPanel.currentPanel) {
        GrafoPanel.currentPanel.clear();
    }
}

export function deactivate() {
    console.log('Grafo Code Explorer deactivated');
}
