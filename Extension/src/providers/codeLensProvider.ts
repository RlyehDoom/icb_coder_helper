import * as vscode from 'vscode';
import { getGrafoClient } from '../api/grafoClient';
import { getMaxRelatedItems } from '../config';

interface ElementLocation {
    name: string;
    type: 'class' | 'interface' | 'method';
    className?: string;
    namespace?: string;
    range: vscode.Range;
}

export class GrafoCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private cache: Map<string, { lenses: vscode.CodeLens[]; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    refresh(): void {
        this.cache.clear();
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const cacheKey = document.uri.toString();
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.lenses;
        }

        const elements = this.findElements(document);
        const lenses: vscode.CodeLens[] = [];

        for (const element of elements) {
            if (token.isCancellationRequested) {
                return lenses;
            }

            // Add a placeholder CodeLens that will be resolved later
            const lens = new vscode.CodeLens(element.range, {
                title: '$(loading~spin) Loading...',
                command: '',
            });

            // Store element info for resolution
            (lens as CodeLensWithData).elementData = element;
            lenses.push(lens);
        }

        this.cache.set(cacheKey, { lenses, timestamp: Date.now() });
        return lenses;
    }

    async resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens | null> {
        const lens = codeLens as CodeLensWithData;
        const element = lens.elementData;

        if (!element) {
            return null;
        }

        const client = getGrafoClient();
        if (!client) {
            lens.command = {
                title: '$(warning) Grafo: Not connected',
                command: 'grafo.checkConnection',
            };
            return lens;
        }

        try {
            const context = await client.getCodeContext({
                methodName: element.type === 'method' ? element.name : undefined,
                className: element.className || (element.type !== 'method' ? element.name : undefined),
                namespace: element.namespace,
                includeRelated: true,
                maxRelated: getMaxRelatedItems(),
            });

            if (token.isCancellationRequested) {
                return null;
            }

            if (!context.found) {
                lens.command = {
                    title: '$(question) Not indexed',
                    command: '',
                    tooltip: 'This element was not found in the Grafo index',
                };
                return lens;
            }

            // Count relationships by type
            const counts = this.countRelationships(context.edges, context.mainElement?.Id);
            const parts: string[] = [];

            if (counts.calledBy > 0) {
                parts.push(`$(arrow-left) ${counts.calledBy} callers`);
            }
            if (counts.calls > 0) {
                parts.push(`$(arrow-right) ${counts.calls} calls`);
            }
            if (counts.implementations > 0) {
                parts.push(`$(symbol-class) ${counts.implementations} impl`);
            }
            if (counts.inherits > 0) {
                parts.push(`$(type-hierarchy) ${counts.inherits} inherits`);
            }

            if (parts.length === 0) {
                lens.command = {
                    title: '$(check) No relations',
                    command: '',
                    tooltip: 'No relationships found for this element',
                };
            } else {
                lens.command = {
                    title: parts.join(' | '),
                    command: 'grafo.showRelations',
                    arguments: [element],
                    tooltip: 'Click to show all relations',
                };
            }

            return lens;
        } catch (error) {
            console.error('Grafo CodeLens error:', error);
            lens.command = {
                title: '$(error) Error loading',
                command: '',
                tooltip: String(error),
            };
            return lens;
        }
    }

    private findElements(document: vscode.TextDocument): ElementLocation[] {
        const elements: ElementLocation[] = [];
        const text = document.getText();

        let currentNamespace: string | undefined;
        let currentClassName: string | undefined;

        // Regex patterns
        const namespacePattern = /namespace\s+([\w.]+)/g;
        const classPattern = /(?:public|private|protected|internal)?\s*(?:abstract|sealed|static)?\s*(?:partial\s+)?class\s+(\w+)/g;
        const interfacePattern = /(?:public|private|protected|internal)?\s*(?:partial\s+)?interface\s+(\w+)/g;
        const methodPattern = /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:virtual\s+)?(?:override\s+)?(?:abstract\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\(/g;

        // Find namespace
        const namespaceMatch = namespacePattern.exec(text);
        if (namespaceMatch) {
            currentNamespace = namespaceMatch[1];
        }

        // Find classes
        let match;
        while ((match = classPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            currentClassName = match[1];
            elements.push({
                name: match[1],
                type: 'class',
                namespace: currentNamespace,
                range: new vscode.Range(pos, pos),
            });
        }

        // Find interfaces
        while ((match = interfacePattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            elements.push({
                name: match[1],
                type: 'interface',
                namespace: currentNamespace,
                range: new vscode.Range(pos, pos),
            });
        }

        // Find methods
        while ((match = methodPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            // Skip constructors and common patterns
            const methodName = match[1];
            if (this.isValidMethodName(methodName)) {
                elements.push({
                    name: methodName,
                    type: 'method',
                    className: currentClassName,
                    namespace: currentNamespace,
                    range: new vscode.Range(pos, pos),
                });
            }
        }

        return elements;
    }

    private isValidMethodName(name: string): boolean {
        // Skip common non-method patterns
        const skipPatterns = ['if', 'for', 'while', 'switch', 'catch', 'using', 'lock', 'return', 'new', 'throw'];
        return !skipPatterns.includes(name.toLowerCase());
    }

    private countRelationships(
        edges: Array<{ Source: string; Target: string; Relationship: string }>,
        mainId?: string
    ): { calledBy: number; calls: number; implementations: number; inherits: number } {
        const counts = { calledBy: 0, calls: 0, implementations: 0, inherits: 0 };

        if (!mainId || !edges) {
            return counts;
        }

        for (const edge of edges) {
            const isSource = edge.Source === mainId;

            switch (edge.Relationship) {
                case 'Calls':
                    if (isSource) {
                        counts.calls++;
                    } else {
                        counts.calledBy++;
                    }
                    break;
                case 'Implements':
                    if (!isSource) {
                        counts.implementations++;
                    }
                    break;
                case 'Inherits':
                    counts.inherits++;
                    break;
            }
        }

        return counts;
    }
}

interface CodeLensWithData extends vscode.CodeLens {
    elementData?: ElementLocation;
}
