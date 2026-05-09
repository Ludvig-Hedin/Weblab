'use client';

import { v4 as uuidv4 } from 'uuid';

import type { Provider, ProviderTask, ProviderTerminal } from '@weblab/code-provider';

import type { ErrorManager } from '../error';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

// Dynamic imports to avoid SSR issues
let FitAddonClass: typeof FitAddon | null = null;
let TerminalClass: typeof Terminal | null = null;

export enum CLISessionType {
    TERMINAL = 'terminal',
    TASK = 'task',
}

export interface CLISession {
    id: string;
    name: string;
    type: CLISessionType;
    terminal: ProviderTerminal | null;
    // Task is readonly
    task: ProviderTask | null;
    xterm: Terminal | null;
    fitAddon: FitAddon | null;
}

export interface TaskSession extends CLISession {
    type: CLISessionType.TASK;
    task: ProviderTask;
}

export interface TerminalSession extends CLISession {
    type: CLISessionType.TERMINAL;
    terminal: ProviderTerminal;
}

export class CLISessionImpl implements CLISession {
    id: string;
    terminal: ProviderTerminal | null;
    task: ProviderTask | null;
    xterm: Terminal | null;
    fitAddon: FitAddon | null;
    private retryAbortController: AbortController | null = null;

    constructor(
        public readonly name: string,
        public readonly type: CLISessionType,
        private readonly provider: Provider,
        private readonly errorManager: ErrorManager,
    ) {
        this.id = uuidv4();
        this.terminal = null;
        this.task = null;
        // Initialize xterm and fitAddon lazily
        this.xterm = null;
        this.fitAddon = null;
    }

    private async ensureXTermLibraries() {
        if (!FitAddonClass || !TerminalClass) {
            try {
                const [fitAddonModule, xtermModule] = await Promise.all([
                    import('@xterm/addon-fit'),
                    import('@xterm/xterm'),
                ]);
                FitAddonClass = fitAddonModule.FitAddon;
                TerminalClass = xtermModule.Terminal;
            } catch (error) {
                console.error('Failed to load xterm libraries:', error);
                throw new Error('Failed to load terminal libraries');
            }
        }
    }

    async initTerminal() {
        try {
            await this.ensureXTermLibraries();

            // Initialize xterm and fitAddon
            this.fitAddon = new FitAddonClass!();
            this.xterm = this.createXTerm();
            this.xterm.loadAddon(this.fitAddon);

            const { terminal } = await this.provider.createTerminal({});
            if (!terminal) {
                console.error('Failed to create terminal');
                return;
            }
            this.terminal = terminal;
            terminal.onOutput((data: string) => {
                this.xterm?.write(data);
            });

            this.xterm.onData((data: string) => {
                terminal.write(data);
            });

            // Handle terminal resize
            this.xterm.onResize(({ cols, rows }: { cols: number; rows: number }) => {
                // Check if terminal has resize method
                if ('resize' in terminal && typeof terminal.resize === 'function') {
                    terminal.resize(cols, rows);
                }
            });

            await terminal.open();

            // Set initial terminal size and environment
            if (
                this.xterm.cols &&
                this.xterm.rows &&
                'resize' in terminal &&
                typeof terminal.resize === 'function'
            ) {
                terminal.resize(this.xterm.cols, this.xterm.rows);
            }
        } catch (error) {
            console.error('Failed to initialize terminal:', error);
            this.terminal = null;
        }
    }

    async initTask() {
        try {
            await this.ensureXTermLibraries();

            // Initialize xterm and fitAddon
            this.fitAddon = new FitAddonClass!();
            this.xterm = this.createXTerm();
            this.xterm.loadAddon(this.fitAddon);

            const task = await this.createDevTaskTerminal();
            if (!task) {
                // The template's `.codesandbox/tasks.json` doesn't define a `dev`
                // task — without this, the sandbox boots but the dev server
                // never starts, and the iframe sits at 502 forever. Fall back
                // to running the package.json `dev` script directly so the
                // user never gets stuck on a broken template.
                console.warn(
                    '[CLISession] No "dev" task registered in the sandbox — falling back to running the package.json dev script directly.',
                );
                await this.runFallbackDevServer();
                return;
            }
            this.task = task;

            let output: string;
            try {
                output = await task.open();
            } catch (err) {
                // Sandboxes resume from hibernation with no active process — the
                // task record exists but its shell is null, so task.open() throws
                // "Task is not running". Restart the dev server and poll until the
                // shell comes up (up to 30 s), then open it normally.
                if (err instanceof Error && err.message === 'Task is not running') {
                    console.log('[CLISession] Dev task not running — restarting dev server…');
                    await task.run();
                    // CR-123: always null the controller in finally so it is
                    // released promptly on both success and failure paths.
                    this.retryAbortController = new AbortController();
                    try {
                        output = await this.openTaskWithRetry(
                            task,
                            30_000,
                            this.retryAbortController.signal,
                        );
                    } finally {
                        this.retryAbortController = null;
                    }
                } else {
                    throw err;
                }
            }

            this.xterm.write(output);
            this.errorManager.processMessage(output);
            task.onOutput((data: string) => {
                this.xterm?.write(data);
                this.errorManager.processMessage(data);
            });
        } catch (error) {
            console.error('Failed to initialize task:', error);
            // Last-ditch fallback: a Provider/SDK-level failure here normally
            // means we couldn't even register a dev task. Try the same direct
            // script-runner so the user still gets a working preview.
            try {
                await this.runFallbackDevServer();
            } catch (fallbackError) {
                console.error(
                    '[CLISession] Fallback dev-server runner also failed:',
                    fallbackError,
                );
            }
        }
    }

    /**
     * Run the package.json `dev` script directly in the background when the
     * sandbox's registered tasks aren't usable. Recovers projects that were
     * forked from a template with a missing or malformed
     * `.codesandbox/tasks.json` — without this, `getTask('dev')` rejects and
     * the dev server is never started, so the preview iframe stays at 502.
     */
    private async runFallbackDevServer(): Promise<void> {
        // Read package.json to figure out which command actually runs the
        // dev server. Most templates use `bun dev`, but some use
        // `npm run dev` / `pnpm dev`. Default to `bun dev` because every
        // CodeSandbox image we use ships bun.
        let devCommand = 'bun dev';
        try {
            const { output } = await this.provider.runCommand({
                args: { command: 'cat package.json 2>/dev/null || echo "{}"' },
            });
            const pkg = JSON.parse(output) as { scripts?: Record<string, string> };
            if (pkg.scripts?.dev) {
                devCommand = 'bun run dev';
            } else if (pkg.scripts?.start) {
                devCommand = 'bun run start';
            }
        } catch {
            // Couldn't parse package.json — stick with the default. Worst
            // case `bun dev` fails and the user sees a clear shell error in
            // the terminal panel rather than a silent 502.
        }

        // Always run install first; a freshly-forked sandbox may not have
        // node_modules even though the template suggested it would.
        const fullCommand = `bun install && ${devCommand}`;
        try {
            const { command } = await this.provider.runBackgroundCommand({
                args: { command: fullCommand },
            });
            // Stream output to the terminal panel so the user can see the
            // boot logs (and any failures) instead of a blank screen.
            command.onOutput((data: string) => {
                this.xterm?.write(data);
                this.errorManager.processMessage(data);
            });
        } catch (error) {
            console.error('[CLISession] Failed to run fallback dev command:', fullCommand, error);
            throw error;
        }
    }

    /**
     * Poll task.open() until the dev-server shell becomes available or the
     * deadline is reached. Called after task.run() when the sandbox was
     * hibernated — the shell reference is populated asynchronously once the
     * process starts, so we need to wait.
     */
    private async openTaskWithRetry(
        task: ProviderTask,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<string> {
        const POLL_INTERVAL_MS = 1_500;
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            if (signal?.aborted) {
                throw new DOMException('Retry aborted', 'AbortError');
            }
            try {
                return await task.open();
            } catch (err) {
                if (err instanceof Error && err.message === 'Task is not running') {
                    await new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(resolve, POLL_INTERVAL_MS);
                        signal?.addEventListener(
                            'abort',
                            () => {
                                clearTimeout(timer);
                                reject(new DOMException('Retry aborted', 'AbortError'));
                            },
                            { once: true },
                        );
                    });
                } else {
                    throw err;
                }
            }
        }

        throw new Error(
            `Dev server did not start within ${timeoutMs / 1000}s — check the terminal for errors`,
        );
    }

    createXTerm(): Terminal {
        const terminal = new TerminalClass!({
            cursorBlink: true,
            fontSize: 12,
            fontFamily: 'monospace',
            convertEol: false,
            allowTransparency: true,
            disableStdin: false,
            allowProposedApi: true,
            macOptionIsMeta: true,
            altClickMovesCursor: false,
            windowsMode: false,
            scrollback: 1000,
            screenReaderMode: false,
            fastScrollModifier: 'alt',
            fastScrollSensitivity: 5,
        });

        // Override write method to handle Claude Code's redrawing patterns
        const originalWrite = terminal.write.bind(terminal);
        terminal.write = (data: string | Uint8Array, callback?: () => void) => {
            if (typeof data === 'string') {
                // Detect Claude Code's redraw pattern: multiple line clears with cursor movement
                const lineUpPattern = /(\x1b\[2K\x1b\[1A)+\x1b\[2K\x1b\[G/;
                if (lineUpPattern.test(data)) {
                    // Count how many lines are being cleared
                    const matches = data.match(/\x1b\[1A/g);
                    const lineCount = matches ? matches.length : 0;

                    // Clear the number of lines being redrawn plus some buffer
                    for (let i = 0; i <= lineCount + 2; i++) {
                        terminal.write('\x1b[2K\x1b[1A\x1b[2K');
                    }
                    terminal.write('\x1b[G'); // Go to beginning of line

                    // Extract just the content after the clearing commands
                    const contentMatch = /\x1b\[G(.+)$/s.exec(data);
                    if (contentMatch?.[1]) {
                        return originalWrite(contentMatch[1], callback);
                    }
                }
            }
            return originalWrite(data, callback);
        };

        return terminal;
    }

    async createDevTaskTerminal() {
        try {
            const { task } = await this.provider.getTask({
                args: {
                    id: 'dev',
                },
            });
            return task ?? null;
        } catch (error) {
            // The CodeSandbox SDK throws "Task dev not found" when the
            // template's `.codesandbox/tasks.json` doesn't register a `dev`
            // task. Returning null here lets the caller fall back to running
            // the package.json dev script directly instead of bubbling the
            // exception up and bricking the sandbox.
            console.warn('[CLISession] Could not look up "dev" task on the sandbox:', error);
            return null;
        }
    }

    dispose() {
        this.retryAbortController?.abort();
        this.retryAbortController = null;
        if (this.xterm) {
            this.xterm.dispose();
        }
        if (this.terminal) {
            try {
                this.terminal.kill();
            } catch (error) {
                console.warn('Failed to kill terminal during disposal:', error);
            }
        }
    }
}
