/**
 * Grafo Code Explorer Extension
 * 6 Widgets: Graph, Impact, Dependencies, ClassOverview, LayerMap, Implementations
 */
import * as vscode from 'vscode';
import { initClient, getClient } from './api/grafoClient';
import { GraphNode, CurrentContext } from './types';
import { logger } from './logger';
import { initCacheService, getCacheService, CacheService } from './services/cacheService';
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

// Cache service
let cacheService: CacheService;

// Status bar
let statusBar: vscode.StatusBarItem;

// Current context
let currentContext: CurrentContext | null = null;
let currentElementId: string | null = null; // Track current method/class being displayed
let debounceTimer: NodeJS.Timeout | undefined;

// Cache cleanup interval
let cacheCleanupInterval: NodeJS.Timeout | undefined;

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

    // Initialize cache service
    cacheService = initCacheService(context.globalState);
    logger.info('Cache service initialized');

    // Initialize API client with cache
    initClient(apiUrl, version, cacheService);

    // Start cache cleanup interval (every 5 minutes)
    cacheCleanupInterval = setInterval(() => {
        cacheService.cleanup();
    }, 5 * 60 * 1000);

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

    // Register panel serializer for restoring GrafoPanel on reload
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer(GrafoPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: unknown) {
                // Restore the panel
                GrafoPanel.revive(webviewPanel, context.extensionUri);
            }
        })
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

    // Listen for Home mode changes to reset tracking
    context.subscriptions.push(
        graphViewProvider.onHomeModeChanged((isHomeMode) => {
            if (!isHomeMode) {
                // Exiting Home mode - reset tracking to force refresh on next selection
                currentElementId = null;
                logger.debug('Home mode exited - reset currentElementId');
            }
        })
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

            // Get cache stats
            const cache = getCacheService();
            const cacheStats = cache ? cache.getStats() : null;
            const cacheInfo = cacheStats ? `${cacheStats.size} entries, ${cacheStats.hitRate} hit rate` : 'N/A';
            const cacheEnabled = cache?.isEnabled ?? true;
            const cacheIcon = cacheEnabled ? '$(debug-pause)' : '$(debug-start)';
            const cacheStatus = cacheEnabled ? 'ON' : 'OFF';

            // Debug mode status
            const debugStatus = logger.debugEnabled ? 'ON' : 'OFF';
            const debugIcon = logger.debugEnabled ? '$(debug-stop)' : '$(debug-start)';

            const options = [
                { label: '$(versions) Select Version', description: `Current: ${currentVersion}`, action: 'selectVersion' },
                { label: '$(plug) Check Connection', description: 'Test API connectivity', action: 'checkConnection' },
                { label: '$(gear) Configure API URL', description: 'Change API endpoint', action: 'configureApiUrl' },
                { label: '$(refresh) Refresh All Views', description: 'Reload all widgets', action: 'refreshAll' },
                { label: '$(database) Cache Stats', description: cacheInfo, action: 'cacheStats' },
                { label: `${cacheIcon} Toggle Cache`, description: `Currently: ${cacheStatus}`, action: 'toggleCache' },
                { label: '$(trash) Clear Cache', description: 'Clear all cached data', action: 'clearCache' },
                { label: `${debugIcon} Debug Logs`, description: `Currently: ${debugStatus}`, action: 'toggleDebug' },
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
                    case 'cacheStats':
                        vscode.commands.executeCommand('grafo.cacheStats');
                        break;
                    case 'toggleCache':
                        vscode.commands.executeCommand('grafo.toggleCache');
                        break;
                    case 'clearCache':
                        vscode.commands.executeCommand('grafo.clearCache');
                        break;
                    case 'toggleDebug':
                        vscode.commands.executeCommand('grafo.toggleDebug');
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

    // Toggle cache
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.toggleCache', async () => {
            if (cacheService) {
                const enabled = await cacheService.toggle();
                vscode.window.showInformationMessage(`Grafo cache ${enabled ? 'enabled' : 'disabled'}`);
                logger.info(`Cache toggled: ${enabled ? 'enabled' : 'disabled'}`);
            }
        })
    );

    // Clear cache
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.clearCache', async () => {
            if (cacheService) {
                await cacheService.clearAll();
                vscode.window.showInformationMessage('Grafo cache cleared');
                logger.info('Cache cleared by user');
            }
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

    // Cache stats command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.cacheStats', () => {
            const cache = getCacheService();
            if (!cache) {
                vscode.window.showWarningMessage('Cache service not initialized');
                return;
            }

            const stats = cache.getStats();
            cache.logStats();

            vscode.window.showInformationMessage(
                `Cache: ${stats.hits} hits, ${stats.misses} misses (${stats.hitRate}), ${stats.size} entries in memory`,
                'Clear Cache'
            ).then(action => {
                if (action === 'Clear Cache') {
                    vscode.commands.executeCommand('grafo.clearCache');
                }
            });
        })
    );


    // Toggle debug logs command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.toggleDebug', () => {
            const enabled = logger.toggleDebug();
            vscode.window.showInformationMessage(`Debug logs ${enabled ? 'enabled' : 'disabled'}`);
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
    let baseClassName: string | undefined;
    let baseClassFullName: string | undefined;
    let isExtendedClass = false;

    if (className.endsWith('Extended') && inheritance) {
        isExtendedClass = true;
        const baseClass = extractBaseClass(inheritance);
        if (baseClass) {
            baseClassName = baseClass.simpleName;
            if (baseClass.fullName.includes('.')) {
                baseClassFullName = baseClass.fullName;
            }
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

        // ALWAYS try to find the actual class first (e.g., GeolocationExtended)
        // Pass namespace to filter when there are multiple classes with the same name
        logger.debug(`Searching for current class: ${className} in namespace: ${namespace || '(none)'}`);
        node = await client.findByName(className, 'class', { namespace });

        // If not found and it's an Extended class, try the base class
        if (!node && isExtendedClass && baseClassName) {
            logger.debug(`Class ${className} not found, trying base class: ${baseClassName}`);

            if (baseClassFullName) {
                // Direct fully qualified name
                node = await client.findByName(baseClassFullName, 'class');
            } else if (usingStatements.length > 0) {
                // Simple name with using statements - search all and filter by namespace
                const results = await client.searchNodes(baseClassName, 'class', undefined, 30);

                // Find the one whose namespace matches a using statement
                for (const candidate of results) {
                    if (candidate.name === baseClassName && candidate.namespace) {
                        const matchingUsing = usingStatements.find(ns =>
                            candidate.namespace === ns ||
                            candidate.namespace?.startsWith(ns + '.')
                        );
                        if (matchingUsing) {
                            logger.debug(`Found base match: ${candidate.namespace}.${candidate.name}`);
                            node = candidate;
                            break;
                        }
                    }
                }

                if (!node && results.length > 0) {
                    node = results[0];
                }
            } else {
                node = await client.findByName(baseClassName, 'class');
            }
        }
        if (node) {
            logger.info(`Found in graph: ${node.id}`);
            logger.widget('ClassOverview', 'Loading', node.name);
            logger.widget('OverridableMethods', 'Loading', node.name);
            logger.widget('Graph', 'Loading', node.name);

            currentContext = {
                filePath: document.uri.fsPath,
                className: className,  // Always use actual class name (e.g., GeolocationExtended)
                namespace,
                baseClass: isExtendedClass ? baseClassName : undefined,  // Base class name (e.g., Geolocation)
                isExtendedClass,
                node
            };

            // Track current element
            currentElementId = node.id;

            // Load widgets
            classOverviewProvider.loadForClass(node);
            overridableMethodsProvider.loadForClass(node, document);
            graphViewProvider.loadForNode(node);

            // Sync to panel if open and not locked/home mode
            if (GrafoPanel.currentPanel && !GrafoPanel.currentPanel.isLocked) {
                GrafoPanel.currentPanel.loadForClass(node);
            }

            if (node.kind === 'interface') {
                logger.widget('Implementations', 'Loading', node.name);
                implementationsProvider.loadForInterface(node);
            }
        } else {
            logger.warn(`Class not found in graph: ${className}`);
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

        const client = getClient();
        if (!client) return;

        try {
            // First try to find method in current class (e.g., GeolocationExtended)
            // Pass className and namespace to filter correctly
            let node = await client.findByName(methodName, 'method', {
                className: currentContext?.className,
                namespace: currentContext?.namespace
            });

            // If not found and we have a base class, try the base class
            if (!node && currentContext?.baseClass) {
                logger.debug(`Method not found in ${currentContext.className}, trying base class ${currentContext.baseClass}`);
                node = await client.findByName(methodName, 'method', { className: currentContext.baseClass });
            }

            if (node) {
                // Only update if it's a different element
                if (currentElementId === node.id) {
                    return;
                }

                logger.separator(`Method: ${methodName}`);
                logger.info(`Found method: ${node.id}`);
                logger.widget('Impact', 'Loading', methodName);
                logger.widget('Dependencies', 'Loading', methodName);
                logger.widget('Graph', 'Loading', methodName);

                currentElementId = node.id;

                impactProvider.loadForNode(node);
                dependenciesProvider.loadForNode(node);
                graphViewProvider.loadForNode(node);

                // Sync to panel if open and not locked/home mode
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

    // Check if cursor is on a class declaration
    const classMatch = line.match(/(?:public|private|protected|internal)\s+(?:static\s+)?(?:partial\s+)?(?:abstract\s+)?(?:sealed\s+)?class\s+(\w+)(?:\s*:\s*([^{]+))?/);
    if (classMatch) {
        const className = classMatch[1];
        const inheritance = classMatch[2]?.trim();

        const client = getClient();
        if (!client) return;

        try {
            // First try to find the current class with namespace for accuracy
            let node = await client.findByName(className, 'class', { namespace: currentContext?.namespace });
            let targetName = className;

            // If not found and has inheritance, try base class or first interface
            if (!node && inheritance) {
                const baseInfo = extractBaseClass(inheritance);
                if (baseInfo) {
                    logger.debug(`Class ${className} not found, trying base: ${baseInfo.simpleName}`);
                    node = await client.findByName(baseInfo.simpleName, 'class');
                    if (node) {
                        targetName = baseInfo.simpleName;
                    }
                }

                // If still not found, try first interface
                if (!node) {
                    const interfaceMatch = inheritance.match(/I[A-Z]\w+/);
                    if (interfaceMatch) {
                        logger.debug(`Trying interface: ${interfaceMatch[0]}`);
                        node = await client.findByName(interfaceMatch[0], 'interface');
                        if (node) {
                            targetName = interfaceMatch[0];
                        }
                    }
                }
            }

            if (node) {
                // Only update if it's a different element
                if (currentElementId === node.id) {
                    return;
                }

                logger.separator(`Class: ${className}`);
                logger.info(`Found ${node.kind}: ${node.id}`);
                logger.widget('Graph', 'Loading', targetName);

                currentElementId = node.id;

                // Update current context
                currentContext = {
                    ...currentContext!,
                    className: className,
                    node
                };

                // Load widgets
                classOverviewProvider.loadForClass(node);
                graphViewProvider.loadForNode(node);

                // Sync to panel if open and not locked/home mode
                if (GrafoPanel.currentPanel && !GrafoPanel.currentPanel.isLocked) {
                    GrafoPanel.currentPanel.loadForClass(node);
                }
            } else {
                logger.warn(`Class not found in graph: ${className}`);
            }
        } catch (e: any) {
            logger.error('Error loading class context', e);
        }
        return;
    }

    // Not on a method or class declaration - check if we should show class context
    // This handles when cursor is in class body (not on method signature)
    if (currentContext?.node && currentElementId !== currentContext.node.id) {
        logger.separator(`Class (body): ${currentContext.className}`);
        logger.info(`Returning to class context: ${currentContext.node.id}`);
        logger.widget('Graph', 'Loading', currentContext.className);

        currentElementId = currentContext.node.id;

        // Load class widgets
        classOverviewProvider.loadForClass(currentContext.node);
        graphViewProvider.loadForNode(currentContext.node);

        // Sync to panel if open and not locked/home mode
        if (GrafoPanel.currentPanel && !GrafoPanel.currentPanel.isLocked) {
            GrafoPanel.currentPanel.loadForClass(currentContext.node);
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
    currentElementId = null;
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
    // Clear cache cleanup interval
    if (cacheCleanupInterval) {
        clearInterval(cacheCleanupInterval);
    }
    console.log('Grafo Code Explorer deactivated');
}
