import * as vscode from 'vscode';
import { getGrafoClient, GrafoClient } from '../api/grafoClient';
import { GraphNode, GraphEdge, CodeContextResponse } from '../types';
import { getMaxRelatedItems } from '../config';
import { logger } from '../logger';

export class GrafoHoverProvider implements vscode.HoverProvider {
    private iconUri: vscode.Uri | undefined;

    constructor(extensionUri?: vscode.Uri) {
        if (extensionUri) {
            this.iconUri = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png');
        }
    }

    /**
     * Get the Git repository root path using VS Code's Git extension
     */
    private getGitRepositoryRoot(): string | undefined {
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

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | null> {
        const client = getGrafoClient();
        if (!client) {
            return null;
        }

        // Get the word at the current position
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return null;
        }

        const word = document.getText(wordRange);
        if (!word || word.length < 2) {
            return null;
        }

        // Try to determine context (method, class, etc.)
        const elementInfo = this.parseElementContext(document, position, word);
        if (!elementInfo) {
            return null;
        }

        try {
            // Handle Extended classes - they don't exist in graph, search for base class
            let searchWord = word;
            let searchNamespace = elementInfo.namespace;
            let searchClassName = elementInfo.className;

            // Check if we're in a class with inheritance
            const text = document.getText();

            // Match any class with inheritance (not just Extended classes)
            const classWithInheritanceMatch = text.match(/class\s+(\w+)\s*:\s*([^{\n]+)/);

            logger.debug(`Class with inheritance check: match=${!!classWithInheritanceMatch}`);
            if (classWithInheritanceMatch) {
                logger.debug(`Class match: [1]="${classWithInheritanceMatch[1]}", [2]="${classWithInheritanceMatch[2]}"`);

                // Check if word is a namespace segment (not a class/interface name)
                // A word is a namespace segment if it appears before a dot in the inheritance string
                const inheritance = classWithInheritanceMatch[2];
                const namespaceSegmentPattern = new RegExp(`\\b${word}\\s*\\.`);
                if (namespaceSegmentPattern.test(inheritance)) {
                    logger.debug(`"${word}" is a namespace segment - skipping hover`);
                    return null;
                }
            }

            if (classWithInheritanceMatch) {
                const currentClassName = classWithInheritanceMatch[1];
                const inheritance = classWithInheritanceMatch[2];
                const baseClassInfo = this.extractBaseClassInfo(inheritance, text);
                const isExtendedClass = currentClassName.endsWith('Extended');

                logger.debug(`Current class: ${currentClassName} (isExtended: ${isExtendedClass})`);
                logger.debug(`Inheritance string: "${inheritance}"`);
                logger.debug(`Base class info: name="${baseClassInfo?.name}", namespace="${baseClassInfo?.namespace}", fullName="${baseClassInfo?.fullName}"`);
                logger.debug(`Element info: type="${elementInfo.type}", className="${elementInfo.className}", isOverride="${elementInfo.isOverride}"`);

                if (baseClassInfo) {
                    // If searching for an Extended class itself, use base class
                    if (isExtendedClass && elementInfo.type === 'class' && word === currentClassName) {
                        logger.info(`Extended class detected: ${word} -> using base class: ${baseClassInfo.name}`);
                        searchWord = baseClassInfo.name;
                        if (baseClassInfo.namespace) {
                            logger.info(`Using namespace from inheritance: ${baseClassInfo.namespace}`);
                            searchNamespace = baseClassInfo.namespace;
                        } else {
                            const usings = this.findUsings(text);
                            logger.info(`Base class "${baseClassInfo.name}" has no namespace, resolving from ${usings.length} usings`);
                            searchNamespace = await this.resolveNamespaceFromUsings(client, baseClassInfo.name, usings);
                        }
                    }
                    // If hovering over the base class name in inheritance (e.g., "Communication" in ": Infocorp...Communication")
                    else if (elementInfo.type === 'class' && word === baseClassInfo.name) {
                        logger.info(`Hovering over base class in inheritance: ${word}`);
                        searchWord = baseClassInfo.name;
                        if (baseClassInfo.namespace) {
                            logger.info(`Using namespace from inheritance: ${baseClassInfo.namespace}`);
                            searchNamespace = baseClassInfo.namespace;
                        } else {
                            const usings = this.findUsings(text);
                            logger.info(`Base class "${baseClassInfo.name}" has no namespace, resolving from ${usings.length} usings`);
                            searchNamespace = await this.resolveNamespaceFromUsings(client, baseClassInfo.name, usings);
                        }
                    }
                    // If hovering over an override method, always use base class
                    else if (elementInfo.type === 'method' && elementInfo.isOverride) {
                        logger.info(`Override method "${word}" detected - using base class: ${baseClassInfo.name}`);
                        searchClassName = baseClassInfo.name;
                        if (baseClassInfo.namespace) {
                            logger.info(`Using namespace from inheritance: ${baseClassInfo.namespace}`);
                            searchNamespace = baseClassInfo.namespace;
                        } else {
                            const usings = this.findUsings(text);
                            logger.info(`Base class "${baseClassInfo.name}" has no namespace, resolving from ${usings.length} usings`);
                            searchNamespace = await this.resolveNamespaceFromUsings(client, baseClassInfo.name, usings);
                        }
                    }
                }
            }

            // For non-override methods, don't trigger hover at all
            if (elementInfo.type === 'method' && !elementInfo.isOverride) {
                logger.debug(`Non-override method "${word}" - skipping hover`);
                return null;
            }

            logger.info(`Final search params: word="${searchWord}", className="${searchClassName}", namespace="${searchNamespace}"`);


            // Query Grafo API for context
            // For both classes and interfaces, use className parameter (API treats them similarly)
            const context = await client.getCodeContext({
                methodName: elementInfo.type === 'method' ? searchWord : undefined,
                className: searchClassName || (elementInfo.type === 'class' || elementInfo.type === 'interface' ? searchWord : undefined),
                namespace: searchNamespace,
                includeRelated: true,
                maxRelated: getMaxRelatedItems(),
            });

            if (token.isCancellationRequested) {
                return null;
            }

            if (!context.found || !context.mainElement) {
                return null;
            }

            // Build hover content - pass the detected element type since API might return class for method queries
            const markdown = await this.buildHoverContent(context, elementInfo.type, searchWord, client);
            return new vscode.Hover(markdown, wordRange);
        } catch (error) {
            console.error('Grafo hover error:', error);
            return null;
        }
    }

    private parseElementContext(
        document: vscode.TextDocument,
        position: vscode.Position,
        word: string
    ): { type: 'method' | 'class' | 'interface'; className?: string; namespace?: string; isOverride?: boolean } | null {
        const line = document.lineAt(position.line).text;
        const linesBefore = this.getLinesBeforePosition(document, position, 50);

        // Check if this is an override method definition (only override methods trigger hover)
        const overrideMethodPattern = new RegExp(`(public|protected|internal)\\s+override\\s+.*${word}\\s*\\(`);

        if (overrideMethodPattern.test(line)) {
            // Try to find the class name
            const className = this.findClassName(linesBefore);
            const namespace = this.findNamespace(linesBefore);
            logger.debug(`Override method detected: ${word} in class ${className}`);
            return { type: 'method', className, namespace, isOverride: true };
        }

        // Check if this looks like a method call (e.g., obj.Method())
        const methodCallPattern = new RegExp(`\\.${word}\\s*\\(`);
        if (methodCallPattern.test(line)) {
            const className = this.findClassName(linesBefore);
            const namespace = this.findNamespace(linesBefore);
            return { type: 'method', className, namespace, isOverride: false };
        }

        // Check if this is a class definition
        const classDefPattern = new RegExp(`class\\s+${word}`);
        if (classDefPattern.test(line)) {
            const namespace = this.findNamespace(linesBefore);
            return { type: 'class', namespace };
        }

        // Check if this is an interface definition
        const interfaceDefPattern = new RegExp(`interface\\s+${word}`);
        if (interfaceDefPattern.test(line)) {
            const namespace = this.findNamespace(linesBefore);
            return { type: 'interface', namespace };
        }

        // Check if this is an interface reference in inheritance list (e.g., ": IInterface" or ", IInterface")
        // Interface names in C# convention start with 'I' followed by uppercase letter
        if (word.startsWith('I') && word.length > 1 && word[1] === word[1].toUpperCase() && word[1] !== word[1].toLowerCase()) {
            // Check if it appears after : or , in inheritance context
            const inheritancePattern = new RegExp(`[:\\,]\\s*([\\w\\.]+\\s*,\\s*)*${word}(\\s*,|\\s*\\{|\\s*$|\\s*where)`);
            if (inheritancePattern.test(line)) {
                // Try to extract namespace from fully qualified name in the line
                const fqnMatch = line.match(new RegExp(`([\\w\\.]+)\\.${word}`));
                const namespace = fqnMatch ? fqnMatch[1] : undefined; // Don't assume namespace
                return { type: 'interface', namespace };
            }
        }

        // Check if this is a base class reference in inheritance list (e.g., ": BaseClass")
        // Must be after ":" and before any interface (not starting with I+uppercase)
        const baseClassPattern = new RegExp(`class\\s+\\w+\\s*:\\s*(${word}|[\\w\\.]+\\.${word})\\s*[,{]?`);
        if (baseClassPattern.test(line) && !(word.startsWith('I') && word.length > 1 && word[1] === word[1].toUpperCase())) {
            // Try to extract namespace from fully qualified name in the line
            const fqnMatch = line.match(new RegExp(`([\\w\\.]+)\\.${word}`));
            const namespace = fqnMatch ? fqnMatch[1] : undefined; // Don't assume namespace
            return { type: 'class', namespace };
        }

        // Only trigger hover on class/interface definitions and method calls/definitions
        // Do NOT trigger on arbitrary type references or variable names
        return null;
    }

    private getLinesBeforePosition(document: vscode.TextDocument, position: vscode.Position, maxLines: number): string {
        const startLine = Math.max(0, position.line - maxLines);
        const range = new vscode.Range(startLine, 0, position.line, position.character);
        return document.getText(range);
    }

    private findClassName(text: string): string | undefined {
        // Look for class definition
        const classMatch = text.match(/class\s+(\w+)/);
        if (classMatch) {
            return classMatch[1];
        }
        return undefined;
    }

    private findNamespace(text: string): string | undefined {
        // Look for namespace declaration
        const namespaceMatch = text.match(/namespace\s+([\w.]+)/);
        if (namespaceMatch) {
            return namespaceMatch[1];
        }
        return undefined;
    }

    /**
     * Extract all using statements from the document
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
     * @param client The Grafo API client
     * @param className The class name to search for
     * @param usings The using statements from the current file
     * @returns The namespace that matches a using, or undefined if no match
     */
    private async resolveNamespaceFromUsings(
        client: GrafoClient,
        className: string,
        usings: string[]
    ): Promise<string | undefined> {
        try {
            // Search for all classes with this name
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
            logger.debug(`Exact matches: ${exactMatches.map(n => n.Namespace).join(', ')}`);

            if (exactMatches.length === 1) {
                // Only one match, use it directly
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

            // No exact using match, try partial match (using is prefix of namespace or vice versa)
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

            // Still no match - return the first one as fallback
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

    /**
     * Extract base class info from inheritance declaration
     */
    private extractBaseClassInfo(inheritance: string, documentText?: string): { name: string; fullName: string; namespace?: string } | null {
        const parts = inheritance.split(',').map(p => p.trim());

        for (const part of parts) {
            const simpleName = part.split('.').pop() || part;
            // Skip interfaces (start with I followed by uppercase)
            if (simpleName && !simpleName.match(/^I[A-Z]/)) {
                const dotIndex = part.lastIndexOf('.');
                let namespace = dotIndex > 0 ? part.substring(0, dotIndex) : undefined;

                // If no namespace in inheritance and we have document text, try to find from usings
                if (!namespace && documentText) {
                    const usings = this.findUsings(documentText);
                    // Don't try to guess - let the API search without namespace
                    // The user can refine if needed
                }

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

    private async buildHoverContent(
        context: CodeContextResponse,
        detectedType: 'method' | 'class' | 'interface',
        elementName: string,
        client: GrafoClient
    ): Promise<vscode.MarkdownString> {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;
        md.supportThemeIcons = true; // Enable $(icon-name) syntax

        const element = context.mainElement!;

        // ===== CONTAINER - 20% larger =====
        md.appendMarkdown(`<div style="font-size: 1.2em; min-width: 400px; padding: 8px;">\n\n`);

        // ===== HEADER =====
        md.appendMarkdown(`<div style="border-bottom: 1px solid var(--vscode-editorWidget-border); padding-bottom: 8px; margin-bottom: 12px;">\n\n`);
        if (this.iconUri) {
            md.appendMarkdown(`![icon](${this.iconUri.toString()}|height=20) **Grafo Extension**\n\n`);
        } else {
            md.appendMarkdown(`**$(graph) Grafo Extension**\n\n`);
        }
        md.appendMarkdown(`</div>\n\n`);

        // Use different layout for methods vs classes/interfaces
        // Use detectedType since API might return class even for method queries
        if (detectedType === 'method') {
            return this.buildMethodHoverContentAsync(md, context, elementName, client);
        }

        // ===== CONTENT =====
        // Element name with icon based on type
        const icon = this.getTypeIcon(element.Type);
        md.appendMarkdown(`### ${icon} ${element.Name}\n\n`);

        // Element details
        md.appendMarkdown(`**Type:** ${element.Type}\n\n`);

        if (element.Namespace) {
            md.appendMarkdown(`**Namespace:** \`${element.Namespace}\`\n\n`);
        }

        if (element.Project) {
            md.appendMarkdown(`**Project:** ${element.Project}\n\n`);
        }

        // Attributes for methods
        if (element.Attributes) {
            if (element.Attributes.returnType) {
                md.appendMarkdown(`**Returns:** \`${element.Attributes.returnType}\`\n\n`);
            }

            if (element.Attributes.parameters && element.Attributes.parameters.length > 0) {
                md.appendMarkdown(`**Parameters:**\n`);
                for (const param of element.Attributes.parameters) {
                    const optional = param.isOptional ? ' *(optional)*' : '';
                    const defaultVal = param.defaultValue ? ` = ${param.defaultValue}` : '';
                    md.appendMarkdown(`- \`${param.name}\`: ${param.type}${optional}${defaultVal}\n`);
                }
                md.appendMarkdown('\n');
            }

            if (element.Attributes.baseTypes && element.Attributes.baseTypes.length > 0) {
                md.appendMarkdown(`**Inherits:** ${element.Attributes.baseTypes.map(t => `\`${t}\``).join(', ')}\n\n`);
            }

            if (element.Attributes.interfaces && element.Attributes.interfaces.length > 0) {
                md.appendMarkdown(`**Implements:** ${element.Attributes.interfaces.map(t => `\`${t}\``).join(', ')}\n\n`);
            }
        }

        // Modifiers
        const modifiers: string[] = [];
        if (element.IsAbstract) modifiers.push('abstract');
        if (element.IsStatic) modifiers.push('static');
        if (element.IsSealed) modifiers.push('sealed');
        if (element.Accessibility) modifiers.push(element.Accessibility.toLowerCase());

        if (modifiers.length > 0) {
            md.appendMarkdown(`**Modifiers:** ${modifiers.join(', ')}\n\n`);
        }

        // Related elements summary
        if (context.relatedElements && context.relatedElements.length > 0) {
            md.appendMarkdown('---\n\n');
            md.appendMarkdown(`**Related Elements:** ${context.relatedElements.length}\n\n`);

            // Group by relationship type
            const groups = this.groupRelatedByType(context.relatedElements, context.edges, element.Id);

            for (const [relType, nodes] of Object.entries(groups)) {
                if (nodes.length > 0) {
                    const displayCount = Math.min(nodes.length, 5);
                    md.appendMarkdown(`*${relType}:* `);
                    md.appendMarkdown(nodes.slice(0, displayCount).map(n => `\`${n.Name}\``).join(', '));
                    if (nodes.length > displayCount) {
                        md.appendMarkdown(` *(+${nodes.length - displayCount} more)*`);
                    }
                    md.appendMarkdown('\n\n');
                }
            }
        }

        // Location link - use RelativePath from API concatenated with Git repo root
        if (element.Location?.RelativePath || element.Location?.AbsolutePath) {
            const line = element.Location.Line || 1;

            // Use relative path from API for display
            const displayPath = element.Location.RelativePath || element.Location.AbsolutePath;

            // For navigation, build absolute path from relative path + Git repo root
            let absolutePath: string | undefined;

            if (element.Location.RelativePath) {
                // Get the Git repository root
                const gitRoot = this.getGitRepositoryRoot();

                if (gitRoot) {
                    // Ensure proper path joining (handle leading slashes/backslashes)
                    const relativePath = element.Location.RelativePath.replace(/^[\\/]+/, '');
                    absolutePath = vscode.Uri.joinPath(vscode.Uri.file(gitRoot), relativePath).fsPath;
                } else {
                    // Fallback to workspace folder if Git root not available
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const relativePath = element.Location.RelativePath.replace(/^[\\/]+/, '');
                        absolutePath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), relativePath).fsPath;
                    }
                }
            }

            // Fallback to AbsolutePath if we couldn't build from relative
            if (!absolutePath && element.Location.AbsolutePath) {
                absolutePath = element.Location.AbsolutePath;
            }

            if (absolutePath) {
                // Build command URI with proper encoding
                // Use JSON.stringify for the arguments to avoid double-encoding
                const fileUri = vscode.Uri.file(absolutePath);
                const args = [fileUri.toString(), { selection: { startLineNumber: line, startColumn: 1 } }];
                const commandUri = `command:vscode.open?${encodeURIComponent(JSON.stringify(args))}`;
                md.appendMarkdown(`---\n\n[$(link-external) Go to definition](${commandUri} "${displayPath}:${line}")\n\n\`${displayPath}:${line}\``);
            } else {
                // Only relative path available and no Git root - just show it
                logger.warn(`Could not build absolute path for: ${displayPath}`);
                md.appendMarkdown(`---\n\n**Location:** \`${displayPath}:${line}\``);
            }
        }

        // ===== FOOTER =====
        md.appendMarkdown(`\n\n---\n\n`);
        md.appendMarkdown(`<div style="text-align: center; font-size: 10px; color: var(--vscode-descriptionForeground); opacity: 0.7;">\n\n`);
        md.appendMarkdown(`*Data obtained from Graph*\n\n`);
        md.appendMarkdown(`</div>\n\n`);

        // ===== CLOSE CONTAINER =====
        md.appendMarkdown(`</div>\n\n`);

        return md;
    }

    /**
     * Build hover content specifically for methods - focused on relations with links
     */
    private async buildMethodHoverContentAsync(
        md: vscode.MarkdownString,
        context: CodeContextResponse,
        methodName: string,
        client: GrafoClient
    ): Promise<vscode.MarkdownString> {
        const classElement = context.mainElement!;
        const relatedElements = context.relatedElements || [];
        const edges = context.edges || [];

        // Try to find the actual method node by searching
        let methodElement: GraphNode | undefined;
        let methodEdges = edges;

        try {
            // Search for the method directly
            const methodResults = await client.searchNodes({
                query: methodName,
                nodeType: 'Method',
                namespace: classElement.Namespace,
                limit: 10,
            });

            // Find the method that belongs to this class
            methodElement = methodResults.find(m =>
                m.Name === methodName &&
                (m.Namespace === classElement.Namespace ||
                 m.FullName?.includes(classElement.Name))
            );

            if (methodElement) {
                logger.info(`Found method node: ${methodElement.Name} in ${methodElement.Namespace}`);

                // Get method-specific context if we found the method
                const methodId = methodElement.Id || (methodElement as any)._id;
                if (methodId) {
                    try {
                        const methodContext = await client.getCodeContext({
                            className: methodElement.FullName || `${classElement.Name}.${methodName}`,
                            includeRelated: true,
                            maxRelated: 20,
                        });
                        if (methodContext.edges && methodContext.edges.length > 0) {
                            methodEdges = methodContext.edges;
                            logger.info(`Got method-specific edges: ${methodEdges.length}`);
                        }
                    } catch (e) {
                        logger.debug(`Could not get method-specific context: ${e}`);
                    }
                }
            }
        } catch (e) {
            logger.debug(`Could not search for method: ${e}`);
        }

        // ===== METHOD INFO =====
        md.appendMarkdown(`### $(symbol-method) ${methodName}\n\n`);

        // Show the class this method belongs to
        md.appendMarkdown(`**Class:** \`${classElement.Name}\`\n\n`);

        if (classElement.Namespace) {
            md.appendMarkdown(`**Namespace:** \`${classElement.Namespace}\`\n\n`);
        }

        // Show method return type if we found the method
        if (methodElement?.Attributes?.returnType) {
            md.appendMarkdown(`**Returns:** \`${methodElement.Attributes.returnType}\`\n\n`);
        }

        // ===== RELATIONS SUMMARY =====
        // Use method ID if available, otherwise use class ID
        const mainId = methodElement
            ? (methodElement.Id || (methodElement as any)._id)
            : (classElement.Id || (classElement as any)._id);

        logger.debug(`Method hover - mainId: ${mainId}, edges: ${methodEdges.length}`);

        // Use methodEdges count
        const totalEdges = methodEdges.length;
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**$(references) Relations:** ${totalEdges}\n\n`);

        if (totalEdges === 0) {
            md.appendMarkdown(`*No relations found for this method*\n\n`);
        } else {
            // Group by relationship type first, then by namespace
            const relationshipGroups = this.groupByRelationshipType(relatedElements, methodEdges, mainId);

            for (const [relType, items] of Object.entries(relationshipGroups)) {
                if (items.length === 0) continue;

                md.appendMarkdown(`**${relType}** (${items.length})\n\n`);

                // Group items by namespace
                const byNamespace = new Map<string, typeof items>();
                for (const item of items) {
                    const ns = item.node.Namespace || 'Global';
                    if (!byNamespace.has(ns)) {
                        byNamespace.set(ns, []);
                    }
                    byNamespace.get(ns)!.push(item);
                }

                // Show each namespace group (without <details> since VS Code doesn't support it well)
                for (const [namespace, nsItems] of byNamespace) {
                    md.appendMarkdown(`*${namespace}*\n\n`);

                    for (const item of nsItems) {
                        const node = item.node;
                        const icon = this.getTypeIcon(node.Type);

                        // Build navigation link if location available
                        if (node.Location?.RelativePath) {
                            const line = node.Location.Line || 1;
                            const absolutePath = this.buildAbsolutePath(node.Location.RelativePath);

                            if (absolutePath) {
                                const fileUri = vscode.Uri.file(absolutePath);
                                const args = [fileUri.toString(), { selection: { startLineNumber: line, startColumn: 1 } }];
                                const commandUri = `command:vscode.open?${encodeURIComponent(JSON.stringify(args))}`;
                                md.appendMarkdown(`- ${icon} [${node.Name}](${commandUri} "Go to ${node.Location.RelativePath}:${line}") \`:${line}\`\n`);
                            } else {
                                md.appendMarkdown(`- ${icon} ${node.Name} \`${node.Location.RelativePath}:${line}\`\n`);
                            }
                        } else {
                            // Create search command for nodes without location
                            const displayName = node.FullName || node.Name;
                            const searchArgs = [node.Name];
                            const searchCommandUri = `command:grafo.searchCode?${encodeURIComponent(JSON.stringify(searchArgs))}`;
                            md.appendMarkdown(`- ${icon} [${displayName}](${searchCommandUri} "Search for ${displayName}")\n`);
                        }
                    }
                    md.appendMarkdown(`\n`);
                }
            }
        }

        // ===== METHOD LOCATION =====
        // Use method's location if available, otherwise use class location
        const locationElement = methodElement || classElement;
        if (locationElement.Location?.RelativePath) {
            const line = locationElement.Location.Line || 1;
            const absolutePath = this.buildAbsolutePath(locationElement.Location.RelativePath);

            md.appendMarkdown(`---\n\n`);

            if (absolutePath) {
                const fileUri = vscode.Uri.file(absolutePath);
                const args = [fileUri.toString(), { selection: { startLineNumber: line, startColumn: 1 } }];
                const commandUri = `command:vscode.open?${encodeURIComponent(JSON.stringify(args))}`;
                md.appendMarkdown(`[$(link-external) Go to definition](${commandUri} "${locationElement.Location.RelativePath}:${line}")\n\n`);
            }
        }

        // ===== FOOTER =====
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`<div style="text-align: center; font-size: 10px; color: var(--vscode-descriptionForeground); opacity: 0.7;">\n\n`);
        md.appendMarkdown(`*Data obtained from Graph*\n\n`);
        md.appendMarkdown(`</div>\n\n`);

        // ===== CLOSE CONTAINER =====
        md.appendMarkdown(`</div>\n\n`);

        return md;
    }

    /**
     * Build absolute path from relative path using Git root or workspace
     */
    private buildAbsolutePath(relativePath: string): string | undefined {
        const gitRoot = this.getGitRepositoryRoot();
        if (gitRoot) {
            const cleanPath = relativePath.replace(/^[\\/]+/, '');
            return vscode.Uri.joinPath(vscode.Uri.file(gitRoot), cleanPath).fsPath;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            const cleanPath = relativePath.replace(/^[\\/]+/, '');
            return vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), cleanPath).fsPath;
        }

        return undefined;
    }

    /**
     * Group related elements by relationship type
     */
    private groupByRelationshipType(
        nodes: GraphNode[],
        edges: GraphEdge[],
        mainId: string
    ): Record<string, Array<{ node: GraphNode; edge: GraphEdge }>> {
        const groups: Record<string, Array<{ node: GraphNode; edge: GraphEdge }>> = {
            'Called By': [],
            'Calls': [],
            'Uses': [],
            'Used By': [],
            'Contains': [],
        };

        const nodeMap = new Map(nodes.map(n => [n.Id || (n as any)._id, n]));

        logger.debug(`groupByRelationshipType - mainId: ${mainId}`);
        logger.debug(`groupByRelationshipType - nodes: ${nodes.length}, edges: ${edges.length}`);

        for (const edge of edges) {
            // Handle both Source/Target and source/target (API might return lowercase)
            const edgeSource = edge.Source || (edge as any).source;
            const edgeTarget = edge.Target || (edge as any).target;
            const edgeRelationship = edge.Relationship || (edge as any).relationship || (edge as any).type;

            const isSource = edgeSource === mainId;
            const otherId = isSource ? edgeTarget : edgeSource;

            logger.debug(`Edge: ${edgeRelationship} - Source: ${edgeSource}, Target: ${edgeTarget}, isSource: ${isSource}, otherId: ${otherId}`);

            // Skip self-references
            if (otherId === mainId) {
                logger.debug(`Skipping self-reference`);
                continue;
            }

            // Get node from relatedElements or create from edge ID
            let otherNode = nodeMap.get(otherId);
            if (!otherNode) {
                otherNode = this.createNodeFromEdgeId(otherId);
                logger.debug(`Created node from ID: ${otherId} -> ${otherNode?.Name} (${otherNode?.FullName})`);
            }

            if (!otherNode) continue;

            const item = { node: otherNode, edge };

            switch (edgeRelationship) {
                case 'Calls':
                    if (isSource) {
                        groups['Calls'].push(item);
                    } else {
                        groups['Called By'].push(item);
                    }
                    break;
                case 'Uses':
                    if (isSource) {
                        groups['Uses'].push(item);
                    } else {
                        groups['Used By'].push(item);
                    }
                    break;
                case 'Inherits':
                    // For methods, inheritance edges might point to parent class methods
                    if (!isSource) {
                        groups['Called By'].push(item);
                    }
                    break;
                case 'Contains':
                    // Class contains method - show what methods are in the class
                    if (isSource) {
                        groups['Contains'].push(item);
                    }
                    break;
            }
        }

        logger.debug(`Groups: Called By=${groups['Called By'].length}, Calls=${groups['Calls'].length}, Uses=${groups['Uses'].length}, Used By=${groups['Used By'].length}, Contains=${groups['Contains'].length}`);

        // Remove empty groups
        return Object.fromEntries(
            Object.entries(groups).filter(([, items]) => items.length > 0)
        );
    }

    /**
     * Create a minimal node from an edge ID
     */
    private createNodeFromEdgeId(nodeId: string): GraphNode | undefined {
        if (!nodeId) return undefined;

        // Parse node ID format: "type:Namespace.ClassName.MethodName" or "component:Namespace.ClassName"
        let fullName = nodeId;
        let nodeType: 'Class' | 'Interface' | 'Method' = 'Class';

        if (nodeId.includes(':')) {
            const [prefix, rest] = nodeId.split(':', 2);
            fullName = rest || nodeId;

            // Determine type from prefix
            const prefixLower = prefix.toLowerCase();
            if (prefixLower === 'interface' || fullName.match(/^I[A-Z]/)) {
                nodeType = 'Interface';
            } else if (prefixLower === 'method' || prefixLower === 'member') {
                nodeType = 'Method';
            }
        }

        // Extract name and namespace from full name
        const parts = fullName.split('.');
        const name = parts[parts.length - 1] || fullName;
        const namespace = parts.length > 1 ? parts.slice(0, -1).join('.') : '';

        return {
            Id: nodeId,
            Name: name,
            FullName: fullName,
            Type: nodeType,
            Project: '',
            Namespace: namespace,
            Accessibility: 'Public',
            IsAbstract: false,
            IsStatic: false,
            IsSealed: false,
        };
    }

    /**
     * Group relations by namespace
     */
    private groupRelationsByNamespace(
        nodes: GraphNode[],
        edges: GraphEdge[],
        mainId: string
    ): Map<string, GraphNode[]> {
        const groups = new Map<string, GraphNode[]>();
        const nodeMap = new Map(nodes.map(n => [n.Id, n]));

        for (const edge of edges) {
            const isSource = edge.Source === mainId;
            const otherId = isSource ? edge.Target : edge.Source;
            const otherNode = nodeMap.get(otherId);

            if (!otherNode) continue;

            const namespace = otherNode.Namespace || 'Global';
            if (!groups.has(namespace)) {
                groups.set(namespace, []);
            }
            groups.get(namespace)!.push(otherNode);
        }

        return groups;
    }

    private getTypeIcon(type: string): string {
        switch (type) {
            case 'Class': return '$(symbol-class)';
            case 'Interface': return '$(symbol-interface)';
            case 'Method': return '$(symbol-method)';
            case 'Property': return '$(symbol-property)';
            case 'Field': return '$(symbol-field)';
            case 'Enum': return '$(symbol-enum)';
            case 'Struct': return '$(symbol-struct)';
            default: return '$(symbol-misc)';
        }
    }

    private groupRelatedByType(
        nodes: GraphNode[],
        edges: GraphEdge[],
        mainId: string
    ): Record<string, GraphNode[]> {
        const groups: Record<string, GraphNode[]> = {
            'Inherits From': [],
            'Inherited By': [],
            'Implements': [],
            'Implemented By': [],
            'Calls': [],
            'Called By': [],
            'Uses': [],
            'Used By': [],
            'Contains': [],
            'Contained In': [],
        };

        const nodeMap = new Map(nodes.map(n => [n.Id, n]));

        for (const edge of edges) {
            const isSource = edge.Source === mainId;
            const otherId = isSource ? edge.Target : edge.Source;
            const otherNode = nodeMap.get(otherId);

            if (!otherNode) continue;

            switch (edge.Relationship) {
                case 'Inherits':
                    if (isSource) {
                        groups['Inherits From'].push(otherNode);
                    } else {
                        groups['Inherited By'].push(otherNode);
                    }
                    break;
                case 'Implements':
                    if (isSource) {
                        groups['Implements'].push(otherNode);
                    } else {
                        groups['Implemented By'].push(otherNode);
                    }
                    break;
                case 'Calls':
                    if (isSource) {
                        groups['Calls'].push(otherNode);
                    } else {
                        groups['Called By'].push(otherNode);
                    }
                    break;
                case 'Uses':
                    if (isSource) {
                        groups['Uses'].push(otherNode);
                    } else {
                        groups['Used By'].push(otherNode);
                    }
                    break;
                case 'Contains':
                    if (isSource) {
                        groups['Contains'].push(otherNode);
                    } else {
                        groups['Contained In'].push(otherNode);
                    }
                    break;
            }
        }

        // Remove empty groups
        return Object.fromEntries(
            Object.entries(groups).filter(([, nodes]) => nodes.length > 0)
        );
    }
}
