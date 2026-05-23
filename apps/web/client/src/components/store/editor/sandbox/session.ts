import { makeAutoObservable, runInAction } from 'mobx';

import type { Provider } from '@weblab/code-provider';
import type { Branch } from '@weblab/models';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { toast } from '@weblab/ui/sonner';

import type { ErrorManager } from '../error';
import type { CLISession, TerminalSession } from './terminal';
import { isOnline } from '@/services/offline/online-status';
import { api } from '@/trpc/client';
import { isSandboxGoneError, isShellStartupError } from './errors';
import { OfflineProvider } from './offline-provider';
import { CLISessionImpl, CLISessionType } from './terminal';
import { VercelBrowserProvider } from './vercel-browser-provider';

export class SessionManager {
    provider: Provider | null = null;
    isConnecting = false;
    connectionError: string | null = null;
    isOffline = false;
    /**
     * True once we've detected that the backing Vercel sandbox has been
     * reclaimed (HTTP 410 from the provider SDK). When set, `start()`
     * short-circuits and never assigns `provider`, so the
     * `SandboxManager.init()` reaction doesn't fan out the project-open
     * cascade (sync engine, git init, dev-task open) — each of which
     * would otherwise fire its own 410 and pile up in the error badge.
     * The existing `useSandboxLiveness` hook on the frame still detects
     * the 410 via the server-side `sandbox.checkAlive` probe and auto-
     * fires `sandbox.restore`, which forks a fresh sandbox from the
     * snapshot and resets this flag on the next `start()`.
     */
    sandboxGone = false;
    terminalSessions = new Map<string, CLISession>();
    activeTerminalSessionId = 'cli';
    // Tracks the sandbox ID returned by the last successful sandbox.start call.
    // Vercel may assign a new sandbox ID each session (and update the DB), so
    // this stays current even when the caller passes a stale branch.sandbox.id.
    private activeSandboxId: string | null = null;

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
            this.sandboxGone = false;
        });

        // Offline path: skip the CodeSandbox VM boot entirely. ZenFS is the
        // source of truth for files until reconnect; queued writes drain via
        // the replay controller once we're online and a real provider is
        // attached.
        //
        // Also short-circuit to the offline provider when the branch's
        // sandbox metadata is obviously synthetic — `sandboxId` empty / a
        // QA test marker, or the cloud `previewUrl` points at the placeholder
        // host `example.com`. Without this gate, QA/test projects created
        // directly via `api.projects.create` (no `createBlank` action, no
        // real CSB/Vercel sandbox) loop forever in `attemptConnection` until
        // the retry budget exhausts and the editor surfaces a hard error.
        // Mounting the OfflineProvider lets the canvas / layers / chat
        // surfaces render against ZenFS so the editor shell is testable
        // without provisioning a real sandbox.
        const previewUrlValue =
            (this.branch.runtime as { cloud?: { previewUrl?: string } })?.cloud?.previewUrl ?? '';
        const isSyntheticSandbox =
            !sandboxId ||
            sandboxId.startsWith('test-sandbox-') ||
            previewUrlValue.includes('example.com');
        if (this.branch.runtime.type !== 'local' && (!isOnline() || isSyntheticSandbox)) {
            const offline = new OfflineProvider();
            runInAction(() => {
                this.provider = offline;
                this.isOffline = true;
                this.isConnecting = false;
            });
            return;
        }

        const attemptConnection = async () => {
            const vercelSession =
                this.branch.runtime.type !== 'local' &&
                this.branch.runtime.cloud?.provider === 'vercel_sandbox'
                    ? await api.sandbox.start.mutate({ sandboxId })
                    : null;
            const activeSandboxId = vercelSession?.sandboxId ?? sandboxId;

            // Keep activeSandboxId current — Vercel may assign a new sandbox ID
            // and update the DB, making the original branch.sandbox.id stale.
            runInAction(() => {
                this.activeSandboxId = activeSandboxId;
            });

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
                    : this.branch.runtime.cloud?.provider === 'vercel_sandbox'
                      ? new VercelBrowserProvider({ sandboxId: activeSandboxId })
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

                // Sandbox has been reclaimed by Vercel (410 Gone). No
                // amount of retrying will bring it back — the snapshot
                // restore flow (driven by `useSandboxLiveness` →
                // `sandbox.restore`) is the only way out. Mark the
                // session and short-circuit so we don't waste the next
                // two retries (6s of additional spinner) and don't fan
                // out the provider-reaction cascade in SandboxManager.
                if (isSandboxGoneError(lastError)) {
                    console.warn(
                        '[SessionManager] Sandbox is gone (410). Waiting for restore flow to fork a fresh sandbox.',
                    );
                    runInAction(() => {
                        this.provider = null;
                        this.isConnecting = false;
                        this.sandboxGone = true;
                        this.connectionError = lastError?.message ?? null;
                    });
                    return;
                }

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
        if (this.sandboxGone) {
            // Sandbox is reclaimed — calling getTask would throw another
            // 410 and pile onto the issue badge. The restore CTA owns
            // recovery; bail silently.
            return false;
        }
        if (!this.provider) {
            console.error('No provider found in restartDevServer');
            return false;
        }
        try {
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
        } catch (error) {
            if (isSandboxGoneError(error)) {
                runInAction(() => {
                    this.sandboxGone = true;
                });
                console.debug(
                    'restartDevServer: sandbox is gone (410), suppressed:',
                    error instanceof Error ? error.message : String(error),
                );
                return false;
            }
            throw error;
        }
    }

    async readDevServerLogs(): Promise<string> {
        if (this.sandboxGone || !this.provider) {
            return 'Dev server not found';
        }
        try {
            const result = await this.provider.getTask({ args: { id: 'dev' } });
            if (result?.task) {
                return await result.task.open();
            }
            return 'Dev server not found';
        } catch (error) {
            if (isSandboxGoneError(error)) {
                runInAction(() => {
                    this.sandboxGone = true;
                });
                console.debug(
                    'readDevServerLogs: sandbox is gone (410), suppressed:',
                    error instanceof Error ? error.message : String(error),
                );
                return 'Dev server not found';
            }
            throw error;
        }
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
        // Prefer the internally-tracked sandbox ID (updated after every
        // successful start). Callers may pass a stale branch.sandbox.id or
        // even the project UUID; this guards against both.
        const effectiveId = this.activeSandboxId ?? sandboxId;
        try {
            // After a long idle period (e.g. tab put to sleep), the provider
            // can be torn down and `this.provider` becomes null. Previously
            // we returned early here, so `useStartProject`'s tab-reactivation
            // call no-op'd and the iframe stayed silently dead until the user
            // tried to edit. Fall through to `start()` so the session is
            // re-established transparently.
            if (!this.provider) {
                await this.start(effectiveId, userId);
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
            await this.restartProvider(effectiveId, userId);
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
        await this.start(this.activeSandboxId ?? sandboxId, userId);
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
        // Sandbox reclaimed: a ping would just produce another 410. Treat as
        // disconnected and let the restore flow re-establish.
        if (this.sandboxGone) return false;
        if (!this.provider) return false;
        try {
            await this.provider.runCommand({ args: { command: 'echo "ping"' } });
            return true;
        } catch (error) {
            if (isSandboxGoneError(error)) {
                runInAction(() => {
                    this.sandboxGone = true;
                });
                console.debug('ping: sandbox is gone (410), suppressed');
                return false;
            }
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
        // Top-of-method guard: once we know the sandbox is reclaimed,
        // every subsequent runCommand would throw an identical 410.
        // Return a synthetic safe-fallback so callers (git probe, dev
        // script lookup, etc.) drop into their existing failure paths
        // without each one hitting the network and re-triggering the
        // cascade. The restore CTA owns recovery.
        if (this.sandboxGone) {
            return {
                output: '',
                success: false,
                error: 'sandbox-gone',
            };
        }
        try {
            if (!this.provider) {
                throw new Error('No provider found in runCommand');
            }

            // Append error suppression if ignoreError is true
            const finalCommand = ignoreError ? `${command} 2>/dev/null || true` : command;

            streamCallback?.(finalCommand + '\n');
            const { output } = await this.provider.runCommand({
                args: { command: finalCommand },
            });
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
            //
            // 410 Gone errors get the same treatment: when the Vercel
            // sandbox has been reclaimed, every downstream call from
            // the project-open cascade (git init, dev task, sync engine
            // listFiles) throws the same 410. The restore-from-snapshot
            // CTA is the user-facing surface for this state; spamming
            // the console with 9+ identical "Status code 410" errors
            // just makes the editor look broken.
            if (isShellStartupError(message)) {
                console.debug('runCommand transient shell-startup error:', message);
            } else if (isSandboxGoneError(error)) {
                runInAction(() => {
                    this.sandboxGone = true;
                });
                console.debug('runCommand: sandbox is gone (410), suppressed:', message);
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
            this.activeSandboxId = null;
            this.sandboxGone = false;
        });
        this.terminalSessions.clear();
    }
}
