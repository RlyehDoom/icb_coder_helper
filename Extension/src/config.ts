import * as vscode from 'vscode';
import { GrafoConfig } from './types';

const CONFIG_SECTION = 'grafo';

export function getConfig(): GrafoConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    return {
        apiUrl: config.get<string>('apiUrl', 'http://localhost:8081'),
        graphVersion: config.get<string>('graphVersion', ''),
        enableHover: config.get<boolean>('enableHover', true),
        enableCodeLens: config.get<boolean>('enableCodeLens', true),
        enableTreeView: config.get<boolean>('enableTreeView', true),
        maxRelatedItems: config.get<number>('maxRelatedItems', 20),
    };
}

export function onConfigChanged(callback: (config: GrafoConfig) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
            callback(getConfig());
        }
    });
}

export function getApiUrl(): string {
    return getConfig().apiUrl;
}

export function getGraphVersion(): string {
    return getConfig().graphVersion;
}

export function isHoverEnabled(): boolean {
    return getConfig().enableHover;
}

export function isCodeLensEnabled(): boolean {
    return getConfig().enableCodeLens;
}

export function isTreeViewEnabled(): boolean {
    return getConfig().enableTreeView;
}

export function getMaxRelatedItems(): number {
    return getConfig().maxRelatedItems;
}
