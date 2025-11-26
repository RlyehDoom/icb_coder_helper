import * as vscode from 'vscode';
import { initializeGrafoClient, disposeGrafoClient, getGrafoClient } from './api/grafoClient';
import { getConfig, onConfigChanged, isHoverEnabled, isCodeLensEnabled, isTreeViewEnabled, getGraphVersion } from './config';
import { GrafoConfig } from './types';
import { GrafoHoverProvider } from './providers/hoverProvider';
import { GrafoCodeLensProvider } from './providers/codeLensProvider';
import { RelationsTreeProvider, HierarchyTreeProvider, StatsTreeProvider } from './views/relationsTreeView';
import { logger } from './logger';

const FIRST_RUN_KEY = 'grafo.firstRunComplete';
const CONFIG_VERSION_KEY = 'grafo.configVersion';
const CURRENT_CONFIG_VERSION = 1;

let hoverDisposable: vscode.Disposable | undefined;
let codeLensDisposable: vscode.Disposable | undefined;
let codeLensProvider: GrafoCodeLensProvider | undefined;
let relationsProvider: RelationsTreeProvider;
let hierarchyProvider: HierarchyTreeProvider;
let statsProvider: StatsTreeProvider;
let mainStatusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    logger.info('='.repeat(60));
    logger.info('Grafo Code Explorer - Extension Activated');
    logger.info('='.repeat(60));

    // Check for first run or configuration update needed
    const isFirstRun = !context.globalState.get<boolean>(FIRST_RUN_KEY);
    const configVersion = context.globalState.get<number>(CONFIG_VERSION_KEY) || 0;

    logger.info(`First run: ${isFirstRun}, Config version: ${configVersion}`);

    if (isFirstRun || configVersion < CURRENT_CONFIG_VERSION) {
        logger.info('Prompting for initial configuration...');
        await promptForConfiguration(context);
    }

    // Initialize API client
    const config = getConfig();
    logger.info('Loading configuration:');
    logger.info(`  API URL: ${config.apiUrl}`);
    logger.info(`  Graph Version: ${config.graphVersion || '(all versions)'}`);
    logger.info(`  Hover Enabled: ${config.enableHover}`);
    logger.info(`  CodeLens Enabled: ${config.enableCodeLens}`);
    logger.info(`  TreeView Enabled: ${config.enableTreeView}`);

    initializeGrafoClient({
        baseUrl: config.apiUrl,
        version: config.graphVersion,
    });

    // Initialize tree view providers
    relationsProvider = new RelationsTreeProvider();
    hierarchyProvider = new HierarchyTreeProvider();
    statsProvider = new StatsTreeProvider();

    // Register tree views
    if (isTreeViewEnabled()) {
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('grafo.relationsView', relationsProvider),
            vscode.window.registerTreeDataProvider('grafo.hierarchyView', hierarchyProvider),
            vscode.window.registerTreeDataProvider('grafo.statsView', statsProvider)
        );

        // Load initial stats
        statsProvider.loadStats();

        // Auto-load hierarchy when active editor changes
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor && editor.document.languageId === 'csharp') {
                    autoLoadClassHierarchy(editor.document);
                }
            })
        );

        // Auto-load relations when selection changes (user clicks on something)
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection((event) => {
                if (event.textEditor.document.languageId === 'csharp' && event.selections.length > 0) {
                    // Debounce to avoid too many API calls
                    autoLoadRelationsDebounced(event.textEditor, relationsProvider, hierarchyProvider);
                }
            })
        );

        // Auto-load for current editor on startup
        if (vscode.window.activeTextEditor?.document.languageId === 'csharp') {
            autoLoadClassHierarchy(vscode.window.activeTextEditor.document);
        }
    }

    // Register providers based on configuration
    registerProviders(context);

    // Listen for configuration changes
    context.subscriptions.push(
        onConfigChanged((newConfig) => {
            logger.info('Configuration changed');
            logger.info(`  New API URL: ${newConfig.apiUrl}`);
            logger.info(`  New Version: ${newConfig.graphVersion || '(all versions)'}`);

            // Reinitialize API client with new config
            disposeGrafoClient();
            initializeGrafoClient({
                baseUrl: newConfig.apiUrl,
                version: newConfig.graphVersion,
            });

            // Re-register providers
            registerProviders(context);

            // Refresh views
            relationsProvider.refresh();
            statsProvider.refresh();

            // Update status bar text with new version
            updateStatusBarText(newConfig);

            // Check connection
            checkConnection(mainStatusBarItem);
        })
    );

    // Register commands
    registerCommands(context);

    // Status bar item
    mainStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBarText(config);
    mainStatusBarItem.command = 'grafo.checkConnection';
    mainStatusBarItem.show();
    context.subscriptions.push(mainStatusBarItem);

    // Check connection on startup
    checkConnection(mainStatusBarItem);
}

async function promptForConfiguration(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('grafo');
    const currentUrl = config.get<string>('apiUrl', 'http://localhost:8081');

    // Show welcome message
    const result = await vscode.window.showInformationMessage(
        'Welcome to Grafo Code Explorer! Configure the API connection to get started.',
        'Configure Now',
        'Use Default'
    );

    if (result === 'Configure Now') {
        await configureApiUrl();
    }

    // Mark first run as complete
    await context.globalState.update(FIRST_RUN_KEY, true);
    await context.globalState.update(CONFIG_VERSION_KEY, CURRENT_CONFIG_VERSION);
}

async function configureApiUrl(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('grafo');
    const currentUrl = config.get<string>('apiUrl', 'http://localhost:8081');

    // Step 1: API URL
    const apiUrl = await vscode.window.showInputBox({
        prompt: 'Enter Grafo Query Service URL',
        placeHolder: 'http://localhost:8081',
        value: currentUrl,
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
        },
    });

    if (!apiUrl) {
        return false;
    }

    // Step 2: Graph Version (optional)
    const currentVersion = config.get<string>('graphVersion', '');
    const graphVersion = await vscode.window.showInputBox({
        prompt: 'Enter Graph Version (optional - leave empty for all versions)',
        placeHolder: 'e.g., 7.10.2',
        value: currentVersion,
    });

    // Save configuration
    await config.update('apiUrl', apiUrl, vscode.ConfigurationTarget.Global);
    if (graphVersion !== undefined) {
        await config.update('graphVersion', graphVersion, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage(`Grafo configured: ${apiUrl}`);
    return true;
}

function registerProviders(context: vscode.ExtensionContext) {
    const csharpSelector: vscode.DocumentSelector = { language: 'csharp', scheme: 'file' };

    // Dispose existing providers
    hoverDisposable?.dispose();
    codeLensDisposable?.dispose();

    // Register hover provider
    if (isHoverEnabled()) {
        hoverDisposable = vscode.languages.registerHoverProvider(
            csharpSelector,
            new GrafoHoverProvider(context.extensionUri)
        );
        context.subscriptions.push(hoverDisposable);
    }

    // Register CodeLens provider
    if (isCodeLensEnabled()) {
        codeLensProvider = new GrafoCodeLensProvider();
        codeLensDisposable = vscode.languages.registerCodeLensProvider(
            csharpSelector,
            codeLensProvider
        );
        context.subscriptions.push(codeLensDisposable);
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Configure API URL command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.configureApi', async () => {
            const configured = await configureApiUrl();
            if (configured) {
                // Refresh connection
                vscode.commands.executeCommand('grafo.checkConnection');
            }
        })
    );

    // Show Relations command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showRelations', async (element?: {
            name: string;
            type: 'method' | 'class' | 'interface';
            className?: string;
            namespace?: string;
        }) => {
            if (element && element.name) {
                // Handle Extended classes - search for base class instead
                let searchName = element.name;
                if (element.type === 'class' && element.name.endsWith('Extended')) {
                    const text = vscode.window.activeTextEditor?.document.getText() || '';
                    const classMatch = text.match(/class\s+\w+Extended\s*:\s*([^{\n]+)/);
                    if (classMatch) {
                        const baseClass = extractBaseClassName(classMatch[1]);
                        if (baseClass) {
                            logger.info(`Extended class detected: ${element.name} -> searching for: ${baseClass}`);
                            searchName = baseClass;
                        }
                    }
                }

                logger.info(`Show relations for element: ${searchName} (${element.type})`);
                await relationsProvider.loadElement(
                    searchName,
                    element.type,
                    element.className,
                    element.namespace
                );
            } else {
                // Try to get element from current cursor position
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document.languageId !== 'csharp') {
                    vscode.window.showWarningMessage('Please open a C# file and place cursor on a class or method');
                    return;
                }

                const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
                if (!wordRange) {
                    vscode.window.showWarningMessage('Please place cursor on a class or method name');
                    return;
                }

                let word = editor.document.getText(wordRange);
                if (!word || word.length < 2) {
                    vscode.window.showWarningMessage('Please place cursor on a valid identifier');
                    return;
                }

                // Determine if it's likely a class or method based on context
                const line = editor.document.lineAt(editor.selection.active.line).text;
                const isMethod = /\.\s*\w+\s*\(/.test(line) || /\b(public|private|protected|internal)\s+.*\w+\s*\(/.test(line);

                // Handle Extended classes - search for base class instead
                if (!isMethod && word.endsWith('Extended')) {
                    const text = editor.document.getText();
                    const classMatch = text.match(/class\s+\w+Extended\s*:\s*([^{\n]+)/);
                    if (classMatch) {
                        const baseClass = extractBaseClassName(classMatch[1]);
                        if (baseClass) {
                            logger.info(`Extended class detected: ${word} -> searching for: ${baseClass}`);
                            word = baseClass;
                        }
                    }
                }

                logger.info(`Show relations for word at cursor: ${word}`);
                await relationsProvider.loadElement(word, isMethod ? 'method' : 'class');
            }

            // Focus the relations view
            vscode.commands.executeCommand('grafo.relationsView.focus');
        })
    );

    // Find Implementations command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.findImplementations', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csharp') {
                vscode.window.showWarningMessage('Please open a C# file first');
                return;
            }

            const word = editor.document.getText(
                editor.document.getWordRangeAtPosition(editor.selection.active)
            );

            if (!word) {
                vscode.window.showWarningMessage('Please place cursor on an interface or class name');
                return;
            }

            const client = getGrafoClient();
            if (!client) {
                vscode.window.showErrorMessage('Grafo: Not connected to API. Run "Grafo: Configure API" first.');
                return;
            }

            try {
                // Determine if it's an interface (starts with I followed by uppercase) or class
                const isInterface = word.startsWith('I') && word.length > 1 &&
                                    word[1] === word[1].toUpperCase() &&
                                    word[1] !== word[1].toLowerCase();

                const nodeType = isInterface ? 'Interface' : 'Class';
                logger.info(`Finding implementations for "${word}" as ${nodeType}`);

                const results = await client.searchNodes({
                    query: word,
                    nodeType: nodeType,
                    limit: 1,
                });

                if (results.length === 0) {
                    vscode.window.showInformationMessage(`No ${nodeType.toLowerCase()} found for "${word}"`);
                    return;
                }

                // Handle both Id and id (API might return lowercase)
                const elementId = results[0].Id || (results[0] as any).id;
                if (!elementId) {
                    logger.error(`${nodeType} node has no ID`, results[0]);
                    vscode.window.showErrorMessage(`Grafo: ${nodeType} found but has no ID`);
                    return;
                }

                const implementations = await client.getInterfaceImplementations(elementId);

                if (!implementations.found || implementations.implementationCount === 0) {
                    vscode.window.showInformationMessage(`No implementations found for "${word}"`);
                    return;
                }

                // Show quick pick with implementations
                const items = implementations.implementations.map(impl => ({
                    label: impl.name,
                    description: impl.namespace,
                    detail: impl.isAbstract ? 'abstract' : undefined,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `${implementations.implementationCount} implementations found`,
                });

                if (selected) {
                    // Search and open the selected implementation
                    const searchResults = await client.searchNodes({
                        query: selected.label,
                        nodeType: 'Class',
                        namespace: selected.description,
                        limit: 1,
                    });

                    if (searchResults.length > 0 && searchResults[0].Location?.AbsolutePath) {
                        const uri = vscode.Uri.file(searchResults[0].Location.AbsolutePath);
                        const line = searchResults[0].Location.Line || 1;
                        await vscode.window.showTextDocument(uri, {
                            selection: new vscode.Range(line - 1, 0, line - 1, 0),
                        });
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Grafo: Error finding implementations - ${error}`);
            }
        })
    );

    // Show Inheritance Hierarchy command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showInheritanceHierarchy', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csharp') {
                vscode.window.showWarningMessage('Please open a C# file first');
                return;
            }

            const word = editor.document.getText(
                editor.document.getWordRangeAtPosition(editor.selection.active)
            );

            if (!word) {
                vscode.window.showWarningMessage('Please place cursor on a class name');
                return;
            }

            const client = getGrafoClient();
            if (!client) {
                vscode.window.showErrorMessage('Grafo: Not connected to API. Run "Grafo: Configure API" first.');
                return;
            }

            try {
                // Handle Extended classes
                let searchWord = word;
                if (word.endsWith('Extended')) {
                    const text = editor.document.getText();
                    const classMatch = text.match(new RegExp(`class\\s+${word}\\s*:\\s*([^{\\n]+)`));
                    if (classMatch) {
                        const baseClassInfo = extractBaseClassInfo(classMatch[1]);
                        if (baseClassInfo) {
                            logger.info(`Extended class detected: ${word} -> searching for: ${baseClassInfo.fullName}`);
                            searchWord = baseClassInfo.namespace
                                ? `${baseClassInfo.namespace}.${baseClassInfo.name}`
                                : baseClassInfo.name;
                        }
                    }
                }

                await hierarchyProvider.loadClass(searchWord);
            } catch (error) {
                vscode.window.showErrorMessage(`Grafo: Error loading hierarchy - ${error}`);
            }
        })
    );

    // Show Callers command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showCallers', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csharp') {
                vscode.window.showWarningMessage('Please open a C# file first');
                return;
            }

            const word = editor.document.getText(
                editor.document.getWordRangeAtPosition(editor.selection.active)
            );

            if (word) {
                await relationsProvider.loadElement(word, 'method');
                vscode.commands.executeCommand('grafo.relationsView.focus');
            }
        })
    );

    // Show Callees command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showCallees', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'csharp') {
                vscode.window.showWarningMessage('Please open a C# file first');
                return;
            }

            const word = editor.document.getText(
                editor.document.getWordRangeAtPosition(editor.selection.active)
            );

            if (word) {
                await relationsProvider.loadElement(word, 'method');
                vscode.commands.executeCommand('grafo.relationsView.focus');
            }
        })
    );

    // Search Code command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.searchCode', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Enter search query',
                placeHolder: 'e.g., UserService, GetById, IRepository',
            });

            if (!query) {
                return;
            }

            const client = getGrafoClient();
            if (!client) {
                vscode.window.showErrorMessage('Grafo: Not connected to API. Run "Grafo: Configure API" first.');
                return;
            }

            try {
                const results = await client.searchNodes({
                    query,
                    limit: 50,
                });

                if (results.length === 0) {
                    vscode.window.showInformationMessage(`No results found for "${query}"`);
                    return;
                }

                const items = results.map(node => ({
                    label: `$(${getNodeIcon(node.Type)}) ${node.Name}`,
                    description: node.Type,
                    detail: node.Namespace ? `${node.Namespace} | ${node.Project}` : node.Project,
                    node,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `${results.length} results found`,
                    matchOnDescription: true,
                    matchOnDetail: true,
                });

                if (selected?.node.Location?.AbsolutePath) {
                    const uri = vscode.Uri.file(selected.node.Location.AbsolutePath);
                    const line = selected.node.Location.Line || 1;
                    await vscode.window.showTextDocument(uri, {
                        selection: new vscode.Range(line - 1, 0, line - 1, 0),
                    });
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Grafo: Search error - ${error}`);
            }
        })
    );

    // Refresh Relations command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.refreshRelations', () => {
            relationsProvider.refresh();
            codeLensProvider?.refresh();
            statsProvider.refresh();
        })
    );

    // Check Connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.checkConnection', async () => {
            await checkConnection(mainStatusBarItem);
        })
    );

    // Show Output command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.showOutput', () => {
            logger.show();
        })
    );

    // Clear Output command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.clearOutput', () => {
            logger.clear();
            logger.info('Output cleared');
        })
    );

    // Reload Window command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.reloadWindow', () => {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        })
    );

    // Select Version command
    context.subscriptions.push(
        vscode.commands.registerCommand('grafo.selectVersion', async () => {
            const client = getGrafoClient();
            const config = vscode.workspace.getConfiguration('grafo');
            const currentVersion = config.get<string>('graphVersion', '');

            // Try to get available versions from the API
            let versionOptions: vscode.QuickPickItem[] = [
                {
                    label: '$(globe) All Versions',
                    description: 'Query all graph versions',
                    detail: currentVersion === '' ? '$(check) Currently selected' : undefined,
                },
            ];

            // If connected, try to get available projects/versions
            if (client) {
                try {
                    const stats = await client.getStatistics();
                    if (stats.versions && Array.isArray(stats.versions)) {
                        for (const version of stats.versions) {
                            versionOptions.push({
                                label: `$(tag) ${version}`,
                                description: `Version ${version}`,
                                detail: currentVersion === version ? '$(check) Currently selected' : undefined,
                            });
                        }
                    }
                } catch {
                    // API doesn't provide versions, that's ok
                }
            }

            // Add option to enter custom version
            versionOptions.push({
                label: '$(edit) Enter Custom Version...',
                description: 'Manually enter a version string',
            });

            const selected = await vscode.window.showQuickPick(versionOptions, {
                placeHolder: `Current version: ${currentVersion || 'all'}`,
                title: 'Select Graph Version',
            });

            if (!selected) {
                return;
            }

            let newVersion: string;

            if (selected.label === '$(globe) All Versions') {
                newVersion = '';
            } else if (selected.label === '$(edit) Enter Custom Version...') {
                const inputVersion = await vscode.window.showInputBox({
                    prompt: 'Enter graph version',
                    placeHolder: 'e.g., 7.10.2, v1.0, latest',
                    value: currentVersion,
                });

                if (inputVersion === undefined) {
                    return;
                }
                newVersion = inputVersion;
            } else {
                // Extract version from label (remove icon)
                newVersion = selected.label.replace('$(tag) ', '');
            }

            // Save the new version
            await config.update('graphVersion', newVersion, vscode.ConfigurationTarget.Global);

            logger.info(`Graph version changed to: ${newVersion || '(all versions)'}`);
            vscode.window.showInformationMessage(
                `Graph version set to: ${newVersion || 'all versions'}`
            );
        })
    );
}

async function checkConnection(statusBarItem: vscode.StatusBarItem): Promise<void> {
    const client = getGrafoClient();
    const config = getConfig();

    logger.info('Checking connection...');

    if (!client) {
        logger.error('API client not configured');
        statusBarItem.text = '$(error) Grafo: Not configured';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

        const action = await vscode.window.showErrorMessage(
            'Grafo: API not configured',
            'Configure Now'
        );
        if (action === 'Configure Now') {
            vscode.commands.executeCommand('grafo.configureApi');
        }
        return;
    }

    statusBarItem.text = '$(sync~spin) Grafo: Connecting...';
    logger.info(`Connecting to: ${config.apiUrl}`);

    try {
        const health = await client.checkHealth();
        if (health.status === 'healthy') {
            logger.info(`Connection successful: ${health.service} v${health.version}`);
            statusBarItem.text = '$(check) Grafo: Connected';
            statusBarItem.tooltip = `Connected to ${config.apiUrl}\nVersion: ${config.graphVersion || 'all'}\nService: ${health.service} v${health.version}\n\nClick to check connection`;
            statusBarItem.backgroundColor = undefined;
            vscode.window.showInformationMessage(
                `Grafo: Connected to ${health.service} v${health.version}`
            );
        } else {
            logger.warn(`Service degraded: MongoDB=${health.mongodb}`);
            statusBarItem.text = '$(warning) Grafo: Degraded';
            statusBarItem.tooltip = `Service degraded - MongoDB: ${health.mongodb}`;
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            vscode.window.showWarningMessage(`Grafo: Service is degraded - MongoDB: ${health.mongodb}`);
        }
    } catch (error) {
        logger.error(`Connection failed to ${config.apiUrl}`, error);
        statusBarItem.text = '$(error) Grafo: Disconnected';
        statusBarItem.tooltip = `Cannot connect to ${config.apiUrl}\n\nClick to retry`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

        const action = await vscode.window.showErrorMessage(
            `Grafo: Cannot connect to API at ${config.apiUrl}`,
            'Configure API',
            'Retry',
            'Show Logs'
        );

        if (action === 'Configure API') {
            vscode.commands.executeCommand('grafo.configureApi');
        } else if (action === 'Retry') {
            checkConnection(statusBarItem);
        } else if (action === 'Show Logs') {
            logger.show();
        }
    }
}

function updateStatusBarText(config: GrafoConfig): void {
    const versionText = config.graphVersion ? `v${config.graphVersion}` : 'all';
    mainStatusBarItem.text = `$(graph) Grafo [${versionText}]`;
    mainStatusBarItem.tooltip = `Grafo Code Explorer\nVersion: ${config.graphVersion || 'all versions'}\nClick to check connection`;
}

async function autoLoadClassHierarchy(document: vscode.TextDocument): Promise<void> {
    const client = getGrafoClient();
    if (!client) {
        return;
    }

    const text = document.getText();

    // Find class definition with inheritance
    // Pattern: class ClassName : BaseClass or class ClassName : IInterface, BaseClass
    const classMatch = text.match(/class\s+(\w+)\s*(?::\s*([^{\n]+))?/);

    if (!classMatch) {
        hierarchyProvider.clear();
        return;
    }

    let className = classMatch[1];
    const inheritance = classMatch[2];
    let searchNamespace: string | undefined;

    // If class name ends with "Extended", it's a Tailored customization
    // Search for the base class instead (the one it inherits from)
    if (className.endsWith('Extended') && inheritance) {
        const baseClassInfo = extractBaseClassInfo(inheritance);
        if (baseClassInfo) {
            logger.info(`Detected Tailored Extended class: ${className} -> searching for base: ${baseClassInfo.fullName}`);
            className = baseClassInfo.name;
            searchNamespace = baseClassInfo.namespace;
        }
    }

    if (!inheritance && !className.endsWith('Extended')) {
        // Class without inheritance, clear the view
        hierarchyProvider.clear();
        return;
    }

    logger.info(`Auto-loading hierarchy for class: ${className}${searchNamespace ? ` in namespace ${searchNamespace}` : ''}`);

    try {
        // Pass namespace:className format to loadClass, which will use getCodeContext
        const classId = searchNamespace ? `${searchNamespace}.${className}` : className;
        await hierarchyProvider.loadClass(classId);
    } catch (error) {
        logger.debug(`Error auto-loading hierarchy: ${error}`);
    }
}

/**
 * Extract the base class info from inheritance declaration
 * Handles: "BaseClass", "IInterface, BaseClass", "Namespace.BaseClass"
 * Returns both the simple name and the full qualified name if available
 */
function extractBaseClassInfo(inheritance: string): { name: string; fullName: string; namespace?: string } | null {
    // Split by comma to handle multiple inheritance (interfaces + class)
    const parts = inheritance.split(',').map(p => p.trim());

    for (const part of parts) {
        // Skip interfaces (start with I followed by uppercase)
        const simpleName = part.split('.').pop() || part; // Get last part after dot
        if (simpleName && !simpleName.match(/^I[A-Z]/)) {
            // Extract namespace if the part has dots
            const dotIndex = part.lastIndexOf('.');
            const namespace = dotIndex > 0 ? part.substring(0, dotIndex) : undefined;

            return {
                name: simpleName,
                fullName: part,
                namespace: namespace,
            };
        }
    }

    // If all parts look like interfaces, return the first one anyway
    if (parts.length > 0) {
        const part = parts[0].trim();
        const simpleName = part.split('.').pop() || part;
        const dotIndex = part.lastIndexOf('.');
        const namespace = dotIndex > 0 ? part.substring(0, dotIndex) : undefined;

        return {
            name: simpleName,
            fullName: part,
            namespace: namespace,
        };
    }

    return null;
}

// Legacy function for backward compatibility
function extractBaseClassName(inheritance: string): string | null {
    const info = extractBaseClassInfo(inheritance);
    return info?.name || null;
}

function getNodeIcon(type: string): string {
    switch (type) {
        case 'Class': return 'symbol-class';
        case 'Interface': return 'symbol-interface';
        case 'Method': return 'symbol-method';
        case 'Property': return 'symbol-property';
        case 'Field': return 'symbol-field';
        case 'Enum': return 'symbol-enum';
        case 'Struct': return 'symbol-struct';
        default: return 'symbol-misc';
    }
}

// Debounce timer for auto-load relations
let autoLoadRelationsTimer: NodeJS.Timeout | undefined;
let lastAutoLoadWord: string | undefined;

/**
 * Auto-load relations when user clicks on a class, method, or interface
 * Uses debouncing to avoid too many API calls
 */
function autoLoadRelationsDebounced(
    editor: vscode.TextEditor,
    relationsProvider: RelationsTreeProvider,
    hierarchyProvider: HierarchyTreeProvider
): void {
    // Clear any pending timer
    if (autoLoadRelationsTimer) {
        clearTimeout(autoLoadRelationsTimer);
    }

    // Set a small delay to debounce rapid selection changes
    autoLoadRelationsTimer = setTimeout(async () => {
        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position);

        if (!wordRange) {
            return;
        }

        const word = editor.document.getText(wordRange);
        if (!word || word.length < 2) {
            return;
        }

        // Skip if same word as last time (user clicked on same identifier)
        if (word === lastAutoLoadWord) {
            return;
        }

        const line = editor.document.lineAt(position.line).text;
        const text = editor.document.getText();

        // Determine element type from context
        let elementType: 'class' | 'method' | 'interface' | null = null;
        let className: string | undefined;
        let namespace: string | undefined;

        // Check for override method
        const overrideMethodPattern = new RegExp(`(public|protected|internal)\\s+override\\s+.*${word}\\s*\\(`);
        if (overrideMethodPattern.test(line)) {
            elementType = 'method';
            // Find class and namespace
            const linesBefore = getLinesBeforePosition(editor.document, position, 50);
            className = findClassName(linesBefore);
            namespace = findNamespace(linesBefore);
            logger.info(`Auto-load: Override method "${word}" in class "${className}"`);
        }

        // Check for class definition
        if (!elementType) {
            const classDefPattern = new RegExp(`class\\s+${word}`);
            if (classDefPattern.test(line)) {
                elementType = 'class';
                namespace = findNamespace(text);
                logger.info(`Auto-load: Class definition "${word}"`);
            }
        }

        // Check for interface definition
        if (!elementType) {
            const interfaceDefPattern = new RegExp(`interface\\s+${word}`);
            if (interfaceDefPattern.test(line)) {
                elementType = 'interface';
                namespace = findNamespace(text);
                logger.info(`Auto-load: Interface definition "${word}"`);
            }
        }

        // Check for interface reference in inheritance (e.g., ": IInterface")
        if (!elementType && word.startsWith('I') && word.length > 1 && word[1] === word[1].toUpperCase()) {
            const inheritancePattern = new RegExp(`[:\\,]\\s*([\\w\\.]+\\s*,\\s*)*${word}(\\s*,|\\s*\\{|\\s*$|\\s*where)`);
            if (inheritancePattern.test(line)) {
                elementType = 'interface';
                logger.info(`Auto-load: Interface reference "${word}"`);
            }
        }

        // Check for base class in inheritance (e.g., ": BaseClass")
        if (!elementType) {
            const baseClassPattern = new RegExp(`class\\s+\\w+\\s*:\\s*(${word}|[\\w\\.]+\\.${word})\\s*[,{]?`);
            if (baseClassPattern.test(line) && !(word.startsWith('I') && word.length > 1 && word[1] === word[1].toUpperCase())) {
                elementType = 'class';
                // Try to extract namespace from fully qualified name
                const fqnMatch = line.match(new RegExp(`([\\w\\.]+)\\.${word}`));
                namespace = fqnMatch ? fqnMatch[1] : undefined;
                logger.info(`Auto-load: Base class reference "${word}"`);
            }
        }

        // If no element type detected, don't auto-load
        if (!elementType) {
            return;
        }

        lastAutoLoadWord = word;

        // Load relations
        try {
            await relationsProvider.loadElement(word, elementType, className, namespace);

            // Also load hierarchy for classes
            if (elementType === 'class') {
                const classId = namespace ? `${namespace}.${word}` : word;
                await hierarchyProvider.loadClass(classId);
            }
        } catch (error) {
            logger.debug(`Auto-load error: ${error}`);
        }
    }, 300); // 300ms debounce
}

function getLinesBeforePosition(document: vscode.TextDocument, position: vscode.Position, maxLines: number): string {
    const startLine = Math.max(0, position.line - maxLines);
    const range = new vscode.Range(startLine, 0, position.line, position.character);
    return document.getText(range);
}

function findClassName(text: string): string | undefined {
    const classMatch = text.match(/class\s+(\w+)/);
    return classMatch?.[1];
}

function findNamespace(text: string): string | undefined {
    const namespaceMatch = text.match(/namespace\s+([\w.]+)/);
    return namespaceMatch?.[1];
}

export function deactivate() {
    disposeGrafoClient();
    hoverDisposable?.dispose();
    codeLensDisposable?.dispose();
}
