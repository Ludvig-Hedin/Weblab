import { makeAutoObservable, runInAction } from 'mobx';
import stripAnsi from 'strip-ansi';

import { APP_NAME, SUPPORT_EMAIL } from '@weblab/constants';

import type { SandboxManager } from '../sandbox';
import {
    escapeShellString,
    prepareCommitMessage,
    sanitizeCommitMessage,
    withSyncPaused,
} from '@/utils/git';
import { isSandboxGoneError, isShellStartupError } from '../sandbox/errors';

const MAX_DIFF_FILE_BYTES = 500_000;

export interface GitCommit {
    oid: string;
    message: string;
    displayName: string | null;
    author: { name: string; email: string };
    timestamp: number;
}

function containsNullByte(bytes: Uint8Array): boolean {
    // Cheap binary detection: scan the first ~8KB for a null byte.
    const limit = Math.min(bytes.byteLength, 8192);
    for (let i = 0; i < limit; i++) {
        if (bytes[i] === 0) return true;
    }
    return false;
}

export const WEBLAB_DISPLAY_NAME_NOTE_REF = 'refs/notes/weblab-display-name';

export interface GitStatus {
    files: string[];
}

export interface GitCommandResult {
    success: boolean;
    output: string;
    error: string | null;
}

export interface PullRequestResult {
    success: boolean;
    url?: string;
    number?: number;
    existing?: boolean;
    error?: string | null;
}

export type FileDiffStatus = 'added' | 'modified' | 'deleted';

export type FileDiffSkipReason = 'binary' | 'too-large';

export interface FileDiff {
    path: string;
    original: string;
    modified: string;
    status: FileDiffStatus;
    skipped?: FileDiffSkipReason;
}

export class GitManager {
    commits: GitCommit[] | null = null;
    isLoadingCommits = false;
    diffs: FileDiff[] = [];
    isLoadingDiffs = false;

    constructor(private sandbox: SandboxManager) {
        makeAutoObservable(this);
    }

    /**
     * Initialize git manager - auto-initializes repo if needed and preloads commits
     */
    async init(): Promise<void> {
        const isInitialized = await this.isRepoInitialized();
        if (!isInitialized) {
            await this.initRepo();
        }
        await this.listCommits();
    }

    /**
     * Check if git repository is initialized
     */
    async isRepoInitialized(): Promise<boolean> {
        try {
            return (await this.sandbox.fileExists('.git')) || false;
        } catch (error) {
            console.error('Error checking if repository is initialized:', error);
            return false;
        }
    }

    /**
     * Ensure git config is set with default values if not already configured
     *
     * The first calls in this method race with the sandbox container's
     * shell coming up. If the shell isn't ready yet, the provider
     * surfaces "failed to exec in podman container" / "Shell with id …
     * does not exist" errors. Those are transient — a short backoff is
     * enough — but they used to dump a noisy stack trace on every
     * fresh project. We retry the initial probe a few times, and only
     * log loudly if every attempt fails.
     */
    async ensureGitConfig(): Promise<boolean> {
        try {
            if (!this.sandbox.session) {
                console.error('No sandbox session available');
                return false;
            }

            const probe = await this.runGitConfigProbeWithRetry();
            if (!probe) {
                return false;
            }
            const { hasName, hasEmail } = probe;

            // If both are already set, no need to configure
            if (hasName && hasEmail) {
                return true;
            }

            // Set user.name if not configured
            if (!hasName) {
                const nameConfigResult = await this.runCommand(
                    `git config user.name ${escapeShellString(APP_NAME)}`,
                );
                if (!nameConfigResult.success) {
                    console.error('Failed to set git user.name:', nameConfigResult.error);
                }
            }

            // Set user.email if not configured
            if (!hasEmail) {
                const emailConfigResult = await this.runCommand(
                    `git config user.email "${SUPPORT_EMAIL}"`,
                );
                if (!emailConfigResult.success) {
                    console.error('Failed to set git user.email:', emailConfigResult.error);
                }
            }

            return true;
        } catch (error) {
            console.error('Failed to ensure git config:', error);
            return false;
        }
    }

    /**
     * Read user.name and user.email from git config, retrying briefly if
     * the sandbox shell is still initializing. Returns null if every
     * attempt failed for a non-shell-startup reason.
     */
    private async runGitConfigProbeWithRetry(): Promise<{
        hasName: boolean;
        hasEmail: boolean;
    } | null> {
        const MAX_ATTEMPTS = 4;
        // 0ms, 500ms, 1s, 2s — total worst-case wait ~3.5s, which covers
        // the typical CodeSandbox shell-warm-up window.
        const BACKOFF_MS = [0, 500, 1000, 2000];

        let lastError: string | null = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const delay = BACKOFF_MS[attempt] ?? 0;
            if (delay > 0) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }

            // ignoreError stays false so we can tell apart two distinct
            // failure modes via the .error string:
            //   - "shell not up yet"  → retry
            //   - "config key not set" → exit 1 from git itself, treated
            //     as a successful probe with `hasName/hasEmail = false`.
            const nameResult = await this.runCommand('git config user.name');
            const emailResult = await this.runCommand('git config user.email');

            const shellNotReady =
                isShellStartupError(nameResult.error) || isShellStartupError(emailResult.error);

            if (!shellNotReady) {
                const hasName = nameResult.success && Boolean(nameResult.output.trim());
                const hasEmail = emailResult.success && Boolean(emailResult.output.trim());
                return { hasName, hasEmail };
            }

            lastError = nameResult.error || emailResult.error || lastError;
        }

        console.warn(
            'Sandbox shell did not become ready in time for git config probe — skipping git setup for now.',
            lastError,
        );
        return null;
    }

    /**
     * Initialize git repository
     */
    async initRepo(): Promise<boolean> {
        try {
            const isInitialized = await this.isRepoInitialized();
            if (isInitialized) {
                console.log('Repository already initialized');
                return true;
            }

            if (!this.sandbox.session) {
                console.error('No sandbox session available');
                return false;
            }

            console.log('Initializing git repository...');

            // Initialize git repository
            const initResult = await this.runCommand('git init');
            if (!initResult.success) {
                // Quietly drop the noisy 410 — the Restore CTA owns
                // recovery once the sandbox has been reclaimed; logging
                // here just duplicates the same warning across every
                // git command in the project-open cascade.
                if (isSandboxGoneError(initResult.error)) {
                    return false;
                }
                console.error('Failed to initialize git repository:', initResult.error);
                return false;
            }

            // Configure git user (required for commits)
            await this.ensureGitConfig();

            // Set default branch to main
            await this.runCommand('git branch -M main');

            console.log('Git repository initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize git repository:', error);
            return false;
        }
    }

    /**
     * Get repository status
     */
    async getStatus(): Promise<GitStatus | null> {
        try {
            const status = await this.sandbox.session.provider?.gitStatus({});
            if (!status) {
                console.error('Failed to get git status');
                return null;
            }

            return {
                files: Object.keys(status.changedFiles || {}),
            };
        } catch (error) {
            console.error('Failed to get git status:', error);
            return null;
        }
    }

    /**
     * Stage all files
     */
    async stageAll(): Promise<GitCommandResult> {
        return this.runCommand('git add .');
    }

    /**
     * Create a commit (low-level) - auto-refreshes commits after successful commit
     */
    async commit(message: string): Promise<GitCommandResult> {
        const sanitizedMessage = sanitizeCommitMessage(message);
        const escapedMessage = prepareCommitMessage(sanitizedMessage);
        const result = await this.runCommand(
            `git commit --allow-empty --no-verify -m ${escapedMessage}`,
        );
        if (result.success) {
            await this.listCommits();
        }
        return result;
    }

    async stageTracked(): Promise<GitCommandResult> {
        return this.runCommand('git add -u');
    }

    async getStagedFileCount(): Promise<number> {
        try {
            const result = await this.runCommand('git diff --cached --name-only', true);
            if (!result.success || !result.output?.trim()) {
                return 0;
            }
            return result.output
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean).length;
        } catch {
            return 0;
        }
    }

    async hasStagedChanges(): Promise<boolean> {
        return (await this.getStagedFileCount()) > 0;
    }

    async getDiffStat(): Promise<{ added: number; removed: number } | null> {
        try {
            const result = await this.runCommand('git diff HEAD --numstat', true);
            if (!result.success || !result.output?.trim()) {
                return null;
            }
            let added = 0;
            let removed = 0;
            for (const line of result.output.trim().split('\n')) {
                const parts = line.trim().split('\t');
                const a = parseInt(parts[0] ?? '0', 10);
                const r = parseInt(parts[1] ?? '0', 10);
                if (!isNaN(a)) added += a;
                if (!isNaN(r)) removed += r;
            }
            return { added, removed };
        } catch {
            return null;
        }
    }

    /**
     * Build a file-by-file diff of the working tree against HEAD.
     * Each entry has the original content (HEAD) and the current working-tree
     * content, suitable for feeding to a side-by-side diff renderer.
     */
    async getDiffs(): Promise<FileDiff[]> {
        this.isLoadingDiffs = true;
        try {
            const status = await this.getStatus();
            if (!status) {
                this.diffs = [];
                return [];
            }

            const results = await Promise.all(status.files.map((path) => this.buildFileDiff(path)));
            const diffs = results.filter((d): d is FileDiff => d !== null);
            this.diffs = diffs;
            return diffs;
        } finally {
            this.isLoadingDiffs = false;
        }
    }

    private async buildFileDiff(path: string): Promise<FileDiff | null> {
        try {
            const escaped = escapeShellString(path);
            const headResult = await this.runCommand(`git show HEAD:${escaped}`, true);
            const existedInHead = headResult.success;
            let original = '';
            let isOriginalTooLarge = false;
            if (existedInHead) {
                if (headResult.output.length > MAX_DIFF_FILE_BYTES) {
                    isOriginalTooLarge = true;
                } else {
                    original = headResult.output;
                }
            }

            let modifiedRaw: string | Uint8Array | null = null;
            let modifiedExists = true;
            try {
                modifiedRaw = await this.sandbox.readFile(path);
            } catch {
                modifiedExists = false;
            }

            let modified = '';
            let isBinary = false;
            let isTooLarge = false;
            if (modifiedExists && modifiedRaw !== null) {
                if (typeof modifiedRaw === 'string') {
                    if (modifiedRaw.length > MAX_DIFF_FILE_BYTES) {
                        isTooLarge = true;
                    } else {
                        modified = modifiedRaw;
                    }
                } else {
                    if (modifiedRaw.byteLength > MAX_DIFF_FILE_BYTES) {
                        isTooLarge = true;
                    } else if (containsNullByte(modifiedRaw)) {
                        isBinary = true;
                    } else {
                        modified = new TextDecoder('utf-8', { fatal: false }).decode(modifiedRaw);
                    }
                }
            }

            const status: FileDiffStatus =
                !existedInHead && modifiedExists
                    ? 'added'
                    : existedInHead && !modifiedExists
                      ? 'deleted'
                      : 'modified';

            const skipped: FileDiffSkipReason | undefined = isBinary
                ? 'binary'
                : isTooLarge || isOriginalTooLarge
                  ? 'too-large'
                  : undefined;

            return {
                path,
                original: skipped ? '' : original,
                modified: skipped ? '' : modified,
                status,
                skipped,
            };
        } catch (error) {
            console.warn('Failed to build diff for', path, error);
            return null;
        }
    }

    async push(): Promise<GitCommandResult> {
        return this.runCommand('git push');
    }

    async pushBranch(branchName: string, setUpstream = false): Promise<GitCommandResult> {
        const escapedBranch = escapeShellString(branchName);
        const command = setUpstream
            ? `git push --set-upstream origin ${escapedBranch}`
            : `git push origin ${escapedBranch}`;
        return this.runCommand(command);
    }

    /**
     * Create a commit (high-level) - handles full flow: stage, config, commit
     */
    async createCommit(message = `New ${APP_NAME} backup`): Promise<GitCommandResult> {
        const status = await this.getStatus();

        // Stage all files
        const addResult = await this.stageAll();
        if (!addResult.success) {
            return addResult;
        }

        // Ensure git config
        await this.ensureGitConfig();

        // Create the commit
        return await this.commit(message);
    }

    /**
     * List commits with formatted output - stores results in this.commits
     */
    async listCommits(maxRetries = 2): Promise<GitCommit[]> {
        this.isLoadingCommits = true;
        let lastError: Error | null = null;

        try {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    // Use a more robust format with unique separators and handle multiline messages
                    const result = await this.runCommand(
                        'git --no-pager log --pretty=format:"COMMIT_START%n%H%n%an <%ae>%n%ad%n%B%nCOMMIT_END" --date=iso',
                    );

                    if (result.success && result.output) {
                        const parsedCommits = this.parseGitLog(result.output);

                        // Enhance commits with display names from notes
                        if (parsedCommits.length > 0) {
                            const enhancedCommits = await Promise.all(
                                parsedCommits.map(async (commit) => {
                                    const displayName = await this.getCommitNote(commit.oid);
                                    return {
                                        ...commit,
                                        displayName: displayName || commit.message,
                                    };
                                }),
                            );
                            this.commits = enhancedCommits;
                            return enhancedCommits;
                        }

                        this.commits = parsedCommits;
                        return parsedCommits;
                    }

                    // If git command failed but didn't throw, treat as error for retry logic
                    lastError = new Error(`Git command failed: ${result.error || 'Unknown error'}`);

                    if (attempt < maxRetries) {
                        // Wait before retry with exponential backoff
                        await new Promise((resolve) =>
                            setTimeout(resolve, Math.pow(2, attempt) * 100),
                        );
                        continue;
                    }

                    this.commits = [];
                    return [];
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(
                        `Attempt ${attempt + 1} failed to list commits:`,
                        lastError.message,
                    );

                    if (attempt < maxRetries) {
                        // Wait before retry with exponential backoff
                        await new Promise((resolve) =>
                            setTimeout(resolve, Math.pow(2, attempt) * 100),
                        );
                        continue;
                    }

                    console.error('All attempts failed to list commits', lastError);
                    this.commits = [];
                    return [];
                }
            }

            this.commits = [];
            return [];
        } finally {
            this.isLoadingCommits = false;
        }
    }

    /**
     * Checkout/restore to a specific commit - auto-refreshes commits after restore
     */
    async restoreToCommit(commitOid: string): Promise<GitCommandResult> {
        const result = await withSyncPaused(this.sandbox.syncEngine, () => {
            return this.runCommand(`git restore --source ${commitOid} .`);
        });

        if (result.success) {
            await this.listCommits();
        }

        return result;
    }

    /**
     * Add a display name note to a commit - updates commit in local cache
     */
    async addCommitNote(commitOid: string, displayName: string): Promise<GitCommandResult> {
        const sanitizedDisplayName = sanitizeCommitMessage(displayName);
        const escapedDisplayName = prepareCommitMessage(sanitizedDisplayName);
        const result = await this.runCommand(
            `git --no-pager notes --ref=${WEBLAB_DISPLAY_NAME_NOTE_REF} add -f -m ${escapedDisplayName} ${commitOid}`,
        );

        if (result.success && this.commits) {
            // Update the commit in local cache instead of re-fetching all commits.
            // Wrap the observable mutation in runInAction so MobX strict mode
            // doesn't warn and downstream reactions fire reliably.
            const commits = this.commits;
            const commitIndex = commits.findIndex((commit) => commit.oid === commitOid);
            if (commitIndex !== -1) {
                runInAction(() => {
                    commits[commitIndex]!.displayName = sanitizedDisplayName;
                });
            }
        }

        return result;
    }

    /**
     * Get display name from commit notes
     */
    async getCommitNote(commitOid: string): Promise<string | null> {
        try {
            const result = await this.runCommand(
                `git --no-pager notes --ref=${WEBLAB_DISPLAY_NAME_NOTE_REF} show ${commitOid}`,
                true,
            );
            if (result.success && result.output) {
                const cleanOutput = this.formatGitLogOutput(result.output);
                return cleanOutput || null;
            }
            return null;
        } catch (error) {
            console.warn('Failed to get commit note', error);
            return null;
        }
    }

    /**
     * Run a git command through the sandbox session
     */
    private runCommand(command: string, ignoreError = false): Promise<GitCommandResult> {
        return this.sandbox.session.runCommand(command, undefined, ignoreError);
    }

    /**
     * Parse git log output into GitCommit objects
     */
    private parseGitLog(rawOutput: string): GitCommit[] {
        const cleanOutput = this.formatGitLogOutput(rawOutput);

        if (!cleanOutput) {
            return [];
        }

        const commits: GitCommit[] = [];

        // Split by COMMIT_START and COMMIT_END markers
        const commitBlocks = cleanOutput.split('COMMIT_START').filter((block) => block.trim());

        for (const block of commitBlocks) {
            // Remove COMMIT_END if present
            const cleanBlock = block.replace(/COMMIT_END\s*$/, '').trim();
            if (!cleanBlock) continue;

            // Split the block into lines
            const lines = cleanBlock.split('\n');

            if (lines.length < 4) continue; // Need at least hash, author, date, and message

            const hash = lines[0]?.trim();
            const authorLine = lines[1]?.trim();
            const dateLine = lines[2]?.trim();

            // Everything from line 3 onwards is the commit message (including empty lines)
            const messageLines = lines.slice(3);
            // Join all message lines and trim only leading/trailing whitespace
            const message = messageLines.join('\n').trim();

            if (!hash || !authorLine || !dateLine) continue;

            // Parse author name and email
            const authorMatch = /^(.+?)\s*<(.+?)>$/.exec(authorLine);
            const authorName = authorMatch?.[1]?.trim() || authorLine;
            const authorEmail = authorMatch?.[2]?.trim() || '';

            // Parse date to timestamp
            let timestamp: number;
            try {
                timestamp = Math.floor(new Date(dateLine).getTime() / 1000);
                // Validate timestamp
                if (isNaN(timestamp) || timestamp < 0) {
                    timestamp = Math.floor(Date.now() / 1000);
                }
            } catch (error) {
                console.warn('Failed to parse commit date:', dateLine, error);
                timestamp = Math.floor(Date.now() / 1000);
            }

            // Use the first line of the message as display name, or the full message if it's short
            const displayMessage = message.split('\n')[0] || 'No message';

            commits.push({
                oid: hash,
                message: message || 'No message',
                author: {
                    name: authorName,
                    email: authorEmail,
                },
                timestamp: timestamp,
                displayName: displayMessage,
            });
        }

        return commits;
    }

    private formatGitLogOutput(input: string): string {
        // Use strip-ansi library for robust ANSI escape sequence removal
        let cleanOutput = stripAnsi(input);

        // Remove any remaining control characters except newline and tab
        cleanOutput = cleanOutput.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        // Remove null bytes
        cleanOutput = cleanOutput.replace(/\0/g, '');

        return cleanOutput.trim();
    }
}
