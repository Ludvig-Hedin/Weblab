import { makeAutoObservable, runInAction } from 'mobx';

import type { Provider } from '@weblab/code-provider';
import type { Branch } from '@weblab/models';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { toast } from '@weblab/ui/sonner';

import type { ErrorManager } from '../error';
import type { CLISession, TerminalSession } from './terminal';
import { isOnline } from '@/services/offline/online-status';
import { api } from '@/trpc/client';
import { isShellStartupError } from './errors';
import { OfflineProvider } from './offline-provider';
import { CLISessionImpl, CLISessionType } from './terminal';

export class SessionManager {
    provider: Provider | null = null;
    isConnecting = false;
    connectionError: string | null = null;
    isOffline = false;
    terminalSessions = new Map<string, CLISession>();
    activeTerminalSessionId = 'cli';

    constructor(
        private readonly branch: Branch,
        private readonly errorManager: ErrorManager,
    ) {
        makeAutoObservable(this);
    }

    async start(sandboxId: string, userId?: string): Promise<void> {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000;

        if (this.isConnecting || this.provider) {
            return;
        }

        runInAction(() => {
            this.isConnecting = true;
            this.connectionError = null;
        });

        // Offline path: skip the CodeSandbox VM boot entirely. ZenFS is the
        // source of truth for files until reconnect; queued writes drain via
        // the replay controller once we're online and a real provider is
        // attached.
        if (this.branch.runtime.type !== 'local' && !isOnline()) {
            const offline = new OfflineProvider();
            runInAction(() => {
                this.provider = offline;
                this.isOffline = true;
                this.isConnecting = false;
            });
            return;
        }

        const attemptConnection = async () => {
            const provider =
                this.branch.runtime.type === 'local'
                    ? await createCodeProviderClient(CodeProvider.NodeFs, {
                          providerOptions: {
                              nodefs: {
                                  rootPath: this.branch.runtime.local?.rootPath,
                                  devCommand: this.branch.runtime.local?.devCommand,
                                  port: this.branch.runtime.local?.port,
                              },
                          },
                      })
                    : await createCodeProviderClient(CodeProvider.CodeSandbox, {
                          providerOptions: {
                              codesandbox: {
                                  sandboxId,
                                  userId,
                                  initClient: true,
                                  getSession: async (sandboxId, _userId) => {
                                      return api.sandbox.start.mutate({ sandboxId });
                                  },
                              },
                          },
                      });

            runInAction(() => {
                this.provider = provider;
                this.isOffline = false;
            });
            await this.createTerminalSessions(provider);
        };

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                await attemptConnection();
                runInAction(() => {
                    this.isConnecting = false;
                });
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(
                    `Failed to start sandbox session (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
                    error,
                );

                runInAction(() => {
                    this.provider = null;
                });

                if (attempt < MAX_RETRIES) {
                    console.log(`Retrying sandbox connection in ${RETRY_DELAY_MS}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }

        runInAction(() => {
            this.isConnecting = false;
            this.connectionError = lastError?.message ?? 'Failed to start sandbox session';
        });
        throw lastError ?? new Error('Failed to start sandbox session');
    }

    async restartDevServer(): Promise<boolean> {
        if (!this.provider) {
            console.error('No provider found in restartDevServer');
            return false;
        }
        const { task } = await this.provider.getTask({
            args: {
                id: 'dev',
            },
        });
        if (task) {
            await task.restart();
            return true;
        }
        return false;
    }

    async readDevServerLogs(): Promise<string> {
        const result = await this.provider?.getTask({ args: { id: 'dev' } });
        if (result) {
            return await result.task.open();
        }
        return 'Dev server not found';
    }

    getTerminalSession(id: string) {
        return this.terminalSessions.get(id) as TerminalSession | undefined;
    }

    async createTerminalSessions(provider: Provider) {
        const task = new CLISessionImpl('server', CLISessionType.TASK, provider, this.errorManager);
        this.terminalSessions.set(task.id, task);
        const terminal = new CLISessionImpl(
            'terminal',
            CLISessionType.TERMINAL,
            provider,
            this.errorManager,
        );

        this.terminalSessions.set(terminal.id, terminal);
        this.activeTerminalSessionId = task.id;

        // Initialize the sessions after creation
        try {
            await Promise.all([task.initTask(), terminal.initTerminal()]);
        } catch (error) {
            console.error('Failed to initialize terminal sessions:', error);
        }
    }

    async disposeTerminal(id: string) {
        const terminal = this.terminalSessions.get(id) as TerminalSession | undefined;
        if (terminal) {
            if (terminal.type === CLISessionType.TERMINAL) {
                await terminal.terminal?.kill();
                if (terminal.xterm) {
                    terminal.xterm.dispose();
                }
            }
            this.terminalSessions.delete(id);
        }
    }

    async hibernate(sandboxId: string) {
        await api.sandbox.hibernate.mutate({ sandboxId });
    }

    async reconnect(sandboxId: string, userId?: string) {
        try {
            // After a long idle period (e.g. tab put to sleep), the provider
            // can be torn down and `this.provider` becomes null. Previously
            // we returned early here, so `useStartProject`'s tab-reactivation
            // call no-op'd and the iframe stayed silently dead until the user
            // tried to edit. Fall through to `start()` so the session is
            // re-established transparently.
            if (!this.provider) {
                await this.start(sandboxId, userId);
                return;
            }

            // Check if the session is still connected
            const isConnected = await this.ping();
            if (isConnected) {
                return;
            }

            // Attempt soft reconnect
            await this.provider?.reconnect();

            const isConnected2 = await this.ping();
            if (isConnected2) {
                return;
            }
            await this.restartProvider(sandboxId, userId);
        } catch (error) {
            console.error('Failed to reconnect to sandbox', error);
            runInAction(() => {
                this.isConnecting = false;
            });
            toast.error('Sandbox reconnect failed', {
                description:
                    error instanceof Error
                        ? error.message
                        : 'Your sandbox connection was lost and could not be restored. Try reloading the project.',
            });
        }
    }

    async restartProvider(sandboxId: string, userId?: string) {
        if (!this.provider) {
            return;
        }
        await this.provider.destroy();
        runInAction(() => {
            this.provider = null;
        });
        await this.start(sandboxId, userId);
    }

    /**
     * Drop the offline-shim provider and re-run the cloud connection path.
     * Called by the replay controller when the network comes back so that
     * queued writes can be drained against a live CodeSandbox session.
     */
    async swapToOnline(sandboxId: string, userId?: string) {
        if (!this.isOffline) return;
        if (this.provider) {
            try {
                await this.provider.destroy();
            } catch (err) {
                console.warn('[SessionManager] swapToOnline: provider destroy failed', err);
            }
        }
        runInAction(() => {
            this.provider = null;
            this.isOffline = false;
            this.isConnecting = false;
            this.connectionError = null;
        });
        try {
            await this.start(sandboxId, userId);
        } catch (err) {
            // CR-124: start() failed after all retries — revert to offline so
            // the UI never shows "online" with no live provider underneath.
            // Re-attach an OfflineProvider so the invariant
            // `isOffline === true ⇒ provider !== null` holds; otherwise
            // `useStartProject`'s readiness gate (which keys off
            // `session.provider`) drops the editor back into its loading
            // shell instead of returning to the offline experience.
            runInAction(() => {
                this.provider = new OfflineProvider();
                this.isOffline = true;
                this.isConnecting = false;
            });
            throw err;
        }
    }

    async ping() {
        if (!this.provider) return false;
        try {
            await this.provider.runCommand({ args: { command: 'echo "ping"' } });
            return true;
        } catch (error) {
            console.error('Failed to connect to sandbox', error);
            return false;
        }
    }

    async runCommand(
        command: string,
        streamCallback?: (output: string) => void,
        ignoreError = false,
    ): Promise<{
        output: string;
        success: boolean;
        error: string | null;
    }> {
        try {
            if (!this.provider) {
                throw new Error('No provider found in runCommand');
            }

            // Append error suppression if ignoreError is true
            const finalCommand = ignoreError ? `${command} 2>/dev/null || true` : command;

            streamCallback?.(finalCommand + '\n');
            const { output } = await this.provider.runCommand({ args: { command: finalCommand } });
            streamCallback?.(output);
            return {
                output,
                success: true,
                error: null,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            // Shell-not-ready errors are expected during sandbox
            // cold-boot — the caller (e.g. GitManager.ensureGitConfig)
            // already retries past them. Logging at error-level here
            // misled users into thinking the sandbox was broken every
            // time they opened a fresh project. Real failures keep the
            // error log so genuine issues stay visible.
            if (isShellStartupError(message)) {
                console.debug('runCommand transient shell-startup error:', message);
            } else {
                console.error('Error running command:', error);
            }
            return {
                output: '',
                success: false,
                error: message,
            };
        }
    }

    async clear() {
        // probably need to be moved in `Provider.destroy()`
        this.terminalSessions.forEach((terminal) => {
            if (terminal.type === CLISessionType.TERMINAL) {
                void terminal.terminal?.kill();
                if (terminal.xterm) {
                    terminal.xterm.dispose();
                }
            }
        });
        if (this.provider) {
            await this.provider.destroy();
        }
        runInAction(() => {
            this.provider = null;
            this.isConnecting = false;
            this.connectionError = null;
        });
        this.terminalSessions.clear();
    }
}
