import * as vscode from 'vscode';

class Logger {
    private outputChannel: vscode.OutputChannel;
    private static instance: Logger;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Grafo Code Explorer');
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private getTimestamp(): string {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour12: false });
    }

    info(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('INFO', message, args);
        this.outputChannel.appendLine(formattedMessage);
        console.log(formattedMessage);
    }

    warn(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('WARN', message, args);
        this.outputChannel.appendLine(formattedMessage);
        console.warn(formattedMessage);
    }

    error(message: string, error?: unknown, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('ERROR', message, args);
        this.outputChannel.appendLine(formattedMessage);
        if (error) {
            if (error instanceof Error) {
                this.outputChannel.appendLine(`  Stack: ${error.stack}`);
            } else {
                this.outputChannel.appendLine(`  Details: ${JSON.stringify(error)}`);
            }
        }
        console.error(formattedMessage, error);
    }

    debug(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('DEBUG', message, args);
        this.outputChannel.appendLine(formattedMessage);
        console.debug(formattedMessage);
    }

    api(method: string, url: string, status?: number, duration?: number): void {
        const statusText = status ? ` [${status}]` : '';
        const durationText = duration ? ` (${duration}ms)` : '';
        const message = `${method} ${url}${statusText}${durationText}`;
        const formattedMessage = this.formatMessage('API', message, []);
        this.outputChannel.appendLine(formattedMessage);
    }

    private formatMessage(level: string, message: string, args: unknown[]): string {
        const timestamp = this.getTimestamp();
        let formattedMessage = `[${timestamp}] [${level}] ${message}`;

        if (args.length > 0) {
            const argsStr = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            formattedMessage += ` ${argsStr}`;
        }

        return formattedMessage;
    }

    show(): void {
        this.outputChannel.show();
    }

    clear(): void {
        this.outputChannel.clear();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

export const logger = Logger.getInstance();
