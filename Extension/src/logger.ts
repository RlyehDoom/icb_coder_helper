/**
 * Grafo Logger - Output Channel for debugging
 */
import * as vscode from 'vscode';

class GrafoLogger {
    private channel: vscode.OutputChannel;
    private startTime: number = Date.now();

    constructor() {
        this.channel = vscode.window.createOutputChannel('Grafo Explorer');
    }

    private timestamp(): string {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour12: false }) + '.' +
               String(now.getMilliseconds()).padStart(3, '0');
    }

    private elapsed(): string {
        return `+${Date.now() - this.startTime}ms`;
    }

    show() {
        this.channel.show();
    }

    clear() {
        this.channel.clear();
        this.startTime = Date.now();
    }

    // General logging
    info(message: string) {
        this.channel.appendLine(`[${this.timestamp()}] INFO  ${message}`);
    }

    warn(message: string) {
        this.channel.appendLine(`[${this.timestamp()}] WARN  ${message}`);
    }

    error(message: string, error?: any) {
        this.channel.appendLine(`[${this.timestamp()}] ERROR ${message}`);
        if (error) {
            this.channel.appendLine(`         ${error.message || error}`);
        }
    }

    debug(message: string) {
        this.channel.appendLine(`[${this.timestamp()}] DEBUG ${message}`);
    }

    // API specific logging
    apiRequest(method: string, url: string) {
        this.startTime = Date.now();
        this.channel.appendLine(`[${this.timestamp()}] ► API ${method} ${url}`);
    }

    apiResponse(status: number, duration: number, resultInfo?: string) {
        const statusIcon = status >= 200 && status < 300 ? '✓' : '✗';
        let line = `[${this.timestamp()}] ◄ ${statusIcon} ${status} (${duration}ms)`;
        if (resultInfo) {
            line += ` - ${resultInfo}`;
        }
        this.channel.appendLine(line);
    }

    apiError(error: any) {
        this.channel.appendLine(`[${this.timestamp()}] ◄ ✗ ERROR: ${error.message || error}`);
    }

    // Widget logging
    widget(name: string, action: string, details?: string) {
        let line = `[${this.timestamp()}] [${name}] ${action}`;
        if (details) {
            line += ` - ${details}`;
        }
        this.channel.appendLine(line);
    }

    // Context logging
    context(type: string, value: string) {
        this.channel.appendLine(`[${this.timestamp()}] CONTEXT ${type}: ${value}`);
    }

    // Separator for clarity
    separator(title?: string) {
        if (title) {
            this.channel.appendLine(`\n${'─'.repeat(20)} ${title} ${'─'.repeat(20)}`);
        } else {
            this.channel.appendLine('─'.repeat(50));
        }
    }
}

export const logger = new GrafoLogger();
