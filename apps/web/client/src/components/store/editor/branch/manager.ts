import type { ConvexHttpClient } from 'convex/browser';
import { api as convexApi } from '@convex/_generated/api';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import { makeAutoObservable, reaction } from 'mobx';

import type { Branch, Frame, RouterType } from '@weblab/models';
import type { ParsedError } from '@weblab/utility';
import { CodeFileSystem } from '@weblab/file-system';
import { toast } from '@weblab/ui/sonner';

import type { EditorEngine } from '../engine';
import type { Id } from '@convex/_generated/dataModel';
import { fromConvexBranch } from '@/app/project/[id]/_adapters/convex-bootstrap';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';
import { ErrorManager } from '../error';
import { HistoryManager, type HistoryDisposalLease, type HistoryDisposalCheckpoint } from '../history';
import { SandboxManager } from '../sandbox';
import { affectsLocalTailwindStyleWriter, hasLocalTailwindStyleWriter } from '../style/local-style-writer';

// Shape returned by `api.branchActions.fork` / `api.branchActions.createBlank`
// after they run the internal `_insertBranchWithFrames` mutation. Both fields
// are flat Convex docs — see `convex/branches.ts`.
type ConvexBranchActionResult = {
    branch: Parameters<typeof fromConvexBranch>[0];
    frames: Array<{
        _id: string;
        canvasId: string;
        branchId?: string;
        url: string;
        x: number;
        y: number;
        width: number;
        height: number;
        groupId?: string;
        breakpointId?: string;
        breakpointName?: string;
        breakpointOrder?: number;
    }>;
};

export interface BranchData {
    branch: Branch;
    sandbox: SandboxManager;
    history: HistoryManager;
    error: ErrorManager;
    codeEditor: CodeFileSystem;
    localStyleWriter: 'tailwind' | 'none' | null;
}

export interface BranchDisposalPreparation {
    readonly branches: ReadonlyMap<string, BranchData>;
    readonly leases: ReadonlyMap<HistoryManager, HistoryDisposalLease>;
    getHistoryLease(branchId: string): HistoryDisposalLease | undefined;
}

export class BranchManager {
    private editorEngine: EditorEngine;
    private currentBranchId: string | null = null;
    private branchMap = new Map<string, BranchData>();
    private reactionDisposer: (() => void) | null = null;
    private convex: ConvexHttpClient = getConvexHttpClient();
    private disposalPreparation: BranchDisposalPreparation | null = null;
    private initializations = new Map<string, { branch: BranchData; promise: Promise<void> }>();

    constructor(editorEngine: EditorEngine) {
        this.editorEngine = editorEngine;
        makeAutoObservable<this, 'disposalPreparation' | 'initializations'>(this, { disposalPreparation: false, initializations: false });
    }

    async initBranches(branches: Branch[]): Promise<void> {
        const prev = this.currentBranchId;
        await this.clear();
        this.editorEngine.action.clear();
        for (const branch of branches) {
            this.createBranchData(branch);
        }
        // Preserve previous selection if still present; else default; else first; else null
        if (prev && this.branchMap.has(prev)) {
            this.currentBranchId = prev;
        } else {
            this.currentBranchId = branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? null;
        }
    }

    async init(): Promise<void> {
        // Branches are independent — initialise them in parallel rather than
        // serialising IndexedDB/ZenFS setup across N branches. Within a
        // single branch, codeEditor must come before sandbox (sandbox reads
        // the file-system codeEditor sets up).
        await Promise.all(
            Array.from(this.branchMap.values()).map((branchData) => {
                const initialization = (async () => {
                    await branchData.codeEditor.initialize();
                    await branchData.sandbox.init();
                    if (branchData.branch.runtime.type === 'local') {
                        await this.refreshStyleWriter(branchData.branch.id);
                        branchData.history.setSourceVersion(() =>
                            branchData.sandbox.getLocalSourceVersion(),
                            () => branchData.sandbox.getLocalExternalRevision(),
                            () => branchData.sandbox.getLocalOwnRevision(),
                        );
                    }
                    if (branchData.branch.runtime.type === 'cloud' && branchData.sandbox.cloudSource) {
                        const source = branchData.sandbox.cloudSource;
                        branchData.history.setSourceVersion(
                            () => source.getSourceVersion(),
                            () => source.getExternalRevision(),
                            () => source.getOwnRevision(),
                        );
                    }
                    await branchData.history.hydrate();
                })();
                this.initializations.set(branchData.branch.id, { branch: branchData, promise: initialization });
                return initialization;
            }),
        );
        this.setupActiveFrameReaction();
    }

    /** Source readiness precedes style/history attachment; preparation waits for all three. */
    async awaitBranchInitialization(branchId: string): Promise<BranchData> {
        const branch = this.getBranchDataById(branchId);
        const initialization = this.initializations.get(branchId);
        if (!branch || !initialization) throw new Error('The local branch has not started loading.');
        if (initialization.branch !== branch) throw new Error('The local branch changed while loading.');
        await initialization.promise;
        if (this.getBranchDataById(branchId) !== branch) throw new Error('The local branch changed while loading.');
        return branch;
    }

    private setupActiveFrameReaction(): void {
        this.reactionDisposer?.();
        this.reactionDisposer = reaction(
            () => {
                const selectedFrames = this.editorEngine.frames.selected;
                const activeFrame =
                    selectedFrames.length > 0
                        ? selectedFrames[0]
                        : this.editorEngine.frames.getAll()[0];
                return activeFrame?.frame?.branchId ?? null;
            },
            (activeBranchId) => {
                if (
                    activeBranchId &&
                    activeBranchId !== this.currentBranchId &&
                    this.branchMap.has(activeBranchId)
                ) {
                    this.currentBranchId = activeBranchId;
                }
            },
        );
    }

    /**
     * True only when a branch is selected AND its data is loaded. Use this
     * in any teardown/cleanup path before reaching for branch-scoped
     * managers (history, sandbox, etc.) — those getters throw, which is
     * fine in normal flow but causes uncaught errors during unmount when
     * branch init failed (e.g., sandbox unreachable on first load).
     */
    get hasActiveBranch(): boolean {
        return this.currentBranchId !== null && this.branchMap.has(this.currentBranchId);
    }

    get activeBranchData(): BranchData {
        if (!this.currentBranchId) {
            throw new Error(
                'No branch selected. This should not happen after proper initialization.',
            );
        }
        const branchData = this.branchMap.get(this.currentBranchId);
        if (!branchData) {
            throw new Error(
                `Branch not found for branch ${this.currentBranchId}. This should not happen after proper initialization.`,
            );
        }
        return branchData;
    }

    get activeBranch(): Branch {
        return this.activeBranchData.branch;
    }

    get activeSandbox(): SandboxManager {
        return this.activeBranchData.sandbox;
    }

    get activeHistory(): HistoryManager {
        return this.activeBranchData.history;
    }

    get activeError(): ErrorManager {
        return this.activeBranchData.error;
    }

    get activeCodeEditor(): CodeFileSystem {
        return this.activeBranchData.codeEditor;
    }

    async switchToBranch(branchId: string): Promise<void> {
        if (this.currentBranchId === branchId) {
            return;
        }
        this.currentBranchId = branchId;
        // Re-scan pages so the Pages panel reflects the switched-to branch's
        // route tree, not the previous branch's. Fire-and-forget: scanPages
        // guards re-entrancy (_isScanning) and now keeps the prior tree on error
        // (so an unconnected sandbox can't blank the panel).
        void this.editorEngine.pages.scanPages();
    }

    getBranchDataById(branchId: string): BranchData | null {
        return this.branchMap.get(branchId) ?? null;
    }

    /** Setup-file changes invalidate this capability through the local mirror. */
    getStyleWriterForBranch(branchId: string): 'tailwind' | 'none' | null {
        const data = this.branchMap.get(branchId);
        if (!data) return 'none';
        if (data.branch.runtime.type !== 'local') return null;
        return data.localStyleWriter;
    }

    async refreshStyleWriter(branchId: string): Promise<void> {
        const data = this.branchMap.get(branchId);
        if (!data || data.branch.runtime.type !== 'local') return;
        data.localStyleWriter = 'none';
        const revision = data.sandbox.getLocalExternalRevision();
        const ownRevision = data.sandbox.getLocalOwnRevision();
        const supported = this.editorEngine.framework === 'nextjs' &&
            await hasLocalTailwindStyleWriter((path) => data.codeEditor.readFile(path));
        if (supported && revision !== null && revision === data.sandbox.getLocalExternalRevision() &&
            ownRevision === data.sandbox.getLocalOwnRevision()) {
            data.localStyleWriter = 'tailwind';
        }
    }

    invalidateStyleWriterForSourceChange(branchId: string, path: string): void {
        if (!affectsLocalTailwindStyleWriter(path)) return;
        const data = this.branchMap.get(branchId);
        if (data?.branch.runtime.type !== 'local') return;
        // Weblab's own text/style saves to app/layout.tsx land here too. Re-check
        // the setup instead of leaving visual styling off for the session.
        data.localStyleWriter = 'none';
        void this.refreshStyleWriter(branchId).catch((error: unknown) => {
            console.error('[BranchManager] Could not re-check local style support:', error);
        });
    }

    getBranchById(branchId: string): Branch | null {
        return this.getBranchDataById(branchId)?.branch ?? null;
    }

    getSandboxById(branchId: string): SandboxManager | null {
        return this.getBranchDataById(branchId)?.sandbox ?? null;
    }

    private createBranchData(branch: Branch, routerType?: RouterType): BranchData {
        const codeEditorApi = new CodeFileSystem(this.editorEngine.projectId, branch.id, {
            routerType,
            localProject: branch.runtime.type === 'local',
            durableCloud: branch.runtime.type === 'cloud' && isCloudEditorRuntime(branch.runtime),
        });
        const errorManager = new ErrorManager(branch);
        const sandboxManager = new SandboxManager(
            branch,
            this.editorEngine,
            errorManager,
            codeEditorApi,
        );
        const historyManager = new HistoryManager(this.editorEngine, branch.id);

        const branchData: BranchData = {
            branch,
            sandbox: sandboxManager,
            history: historyManager,
            error: errorManager,
            codeEditor: codeEditorApi,
            localStyleWriter: branch.runtime.type === 'local' ? 'none' : null,
        };

        this.branchMap.set(branch.id, branchData);

        return branchData;
    }

    get allBranches(): Branch[] {
        return Array.from(this.branchMap.values()).map(({ branch }) => branch);
    }

    async listBranches(): Promise<Branch[]> {
        return [];
    }

    async forkBranch(branchId: string): Promise<void> {
        if (!branchId) {
            throw new Error('No active branch to fork');
        }

        const branch = this.getBranchById(branchId);
        if (!branch) {
            throw new Error('Branch not found');
        }

        // Keyed loading toast: outcome paths reuse the id so the loading toast
        // is replaced (error) or dismissed (success) instead of a global
        // `toast.dismiss()` wiping every toast — including the error itself.
        const toastId = toast.loading(`Forking branch "${branch.name}"...`);
        try {
            // Call the fork API
            const result = (await this.convex.action(convexApi.branchActions.fork, {
                branchId: branchId as Id<'branches'>,
            })) as ConvexBranchActionResult;

            // Convex returns flat docs — normalize the branch so editor code
            // gets the nested `sandbox`/`git`/`runtime` shape it expects.
            const newBranch = fromConvexBranch(result.branch);

            // Add the new branch to the local branch map
            const branchData = this.createBranchData(newBranch);
            await branchData.codeEditor.initialize();
            await branchData.sandbox.init();

            // Add the created frames to the frame manager. applyFrames is
            // declared to accept `Frame[]` — the rest of the editor casts the
            // bootstrap Convex docs the same way (see
            // _hooks/use-start-project.tsx), so the runtime shape mismatch is
            // already absorbed by the receiving code.
            if (result.frames && result.frames.length > 0) {
                this.editorEngine.frames.applyFrames(result.frames as unknown as Frame[]);
            }

            // Switch to the new branch
            await this.switchToBranch(newBranch.id);

            // Callers surface their own success toast — just clear the loader.
            toast.dismiss(toastId);
        } catch (error) {
            console.error('Failed to fork branch:', error);
            toast.error('Failed to fork branch', { id: toastId });
            throw error;
        }
    }

    async createBlankSandbox(branchName?: string): Promise<void> {
        // Keyed loading toast — see forkBranch for why the id matters.
        const toastId = toast.loading('Creating blank sandbox...');
        try {
            // Get current active frame for positioning
            const activeFrames = this.editorEngine.frames.selected;
            const activeFrame =
                activeFrames.length > 0 ? activeFrames[0] : this.editorEngine.frames.getAll()[0];

            let framePosition;
            if (activeFrame) {
                const frame = activeFrame.frame;
                framePosition = {
                    x: frame.position.x,
                    y: frame.position.y,
                    width: frame.dimension.width,
                    height: frame.dimension.height,
                };
            }

            // Get current project ID from existing branches
            const currentBranches = Array.from(this.branchMap.values());
            if (currentBranches.length === 0) {
                throw new Error('No project context available');
            }
            const projectId = currentBranches[0]!.branch.projectId;

            // Call the createBlank API
            const result = (await this.convex.action(convexApi.branchActions.createBlank, {
                projectId: projectId as Id<'projects'>,
                branchName,
                framePosition,
            })) as ConvexBranchActionResult;

            const routerConfig = await this.activeSandbox.getRouterConfig();

            const newBranch = fromConvexBranch(result.branch);

            // Add the new branch to the local branch map
            const branchData = this.createBranchData(newBranch, routerConfig?.type);
            await branchData.codeEditor.initialize();
            await branchData.sandbox.init();

            // Add the created frames to the frame manager. See `forkBranch`
            // for why this cast is safe.
            if (result.frames && result.frames.length > 0) {
                this.editorEngine.frames.applyFrames(result.frames as unknown as Frame[]);
            }

            // Switch to the new branch
            await this.switchToBranch(newBranch.id);

            // Callers surface their own success toast — just clear the loader.
            toast.dismiss(toastId);
        } catch (error) {
            console.error('Failed to create blank sandbox:', error);
            // Surface the real reason when the action classified it (e.g. a
            // Vercel 402 billing block arrives as a ConvexError with a
            // structured `{ message }` payload). A plain Error from a Convex
            // action is redacted to "Server Error" in prod, so prefer `data`.
            const structured = (error as { data?: unknown } | null)?.data;
            const description =
                structured &&
                typeof structured === 'object' &&
                typeof (structured as { message?: unknown }).message === 'string'
                    ? (structured as { message: string }).message
                    : error instanceof Error
                      ? error.message
                      : undefined;
            toast.error('Failed to create blank sandbox', {
                id: toastId,
                ...(description ? { description } : {}),
            });
            throw error;
        }
    }

    async updateBranch(branchId: string, updates: Partial<Branch>): Promise<void> {
        const branchData = this.branchMap.get(branchId);
        if (!branchData) {
            throw new Error('Branch not found');
        }

        try {
            // Flatten the nested model shape (`git: { branch, commitSha,
            // repoUrl }`, `runtime: { type, ... }`) into the flat Convex
            // mutation contract. Only forward fields the caller actually set.
            const args: {
                branchId: Id<'branches'>;
                name?: string;
                description?: string | null;
                isDefault?: boolean;
                gitBranch?: string | null;
                gitCommitSha?: string | null;
                gitRepoUrl?: string | null;
                runtimeType?: 'cloud' | 'local' | 'hybrid';
                runtimeMetadata?: unknown;
            } = { branchId: branchId as Id<'branches'> };
            if (updates.name !== undefined) args.name = updates.name;
            if (updates.description !== undefined) args.description = updates.description;
            if (updates.isDefault !== undefined) args.isDefault = updates.isDefault;
            if (updates.git !== undefined) {
                args.gitBranch = updates.git?.branch ?? null;
                args.gitCommitSha = updates.git?.commitSha ?? null;
                args.gitRepoUrl = updates.git?.repoUrl ?? null;
            }
            if (updates.runtime !== undefined) {
                args.runtimeType = updates.runtime.type;
                args.runtimeMetadata = updates.runtime;
            }
            await this.convex.mutation(convexApi.branches.update, args);

            // Update local branch state
            Object.assign(branchData.branch, updates);
        } catch (error) {
            console.error('Failed to update branch:', error);
            throw error;
        }
    }

    async removeBranch(branchId: string): Promise<void> {
        const branchData = this.branchMap.get(branchId);
        if (branchData) {
            // Remove all frames associated with this branch. Await them so the
            // Convex `frames.remove` mutations complete BEFORE we tear down the
            // branch's code editor / sandbox below — otherwise the deletes race
            // branch teardown (and any error is swallowed inside `delete`).
            const framesToRemove = this.editorEngine.frames
                .getAll()
                .filter((frameState) => frameState.frame.branchId === branchId);

            await Promise.all(
                framesToRemove.map((frameState) =>
                    this.editorEngine.frames.delete(frameState.frame.id),
                ),
            );

            // Clean up the sandbox, history, error manager, and code editor
            branchData.sandbox.clear();
            branchData.history.clear();
            branchData.error.clear();

            // Clean up the entire branch directory
            await branchData.codeEditor.cleanup();
            // Remove from the map
            this.branchMap.delete(branchId);

            // If this was the current branch, switch to default or first available
            if (this.currentBranchId === branchId) {
                const remainingBranches = Array.from(this.branchMap.values()).map(
                    ({ branch }) => branch,
                );
                this.currentBranchId =
                    remainingBranches.find((b) => b.isDefault)?.id ??
                    remainingBranches[0]?.id ??
                    null;
            }
        }
    }

    beginDisposalPreparation(): BranchDisposalPreparation {
        if (this.disposalPreparation) throw new Error('The branches are already closing.');
        const branches = new Map(this.branchMap);
        const leases = new Map<HistoryManager, HistoryDisposalLease>();
        const preparation: BranchDisposalPreparation = { branches, leases,
            getHistoryLease: (id) => {
                const history = branches.get(id)?.history;
                return history ? leases.get(history) : undefined;
            } };
        try {
            for (const branch of branches.values()) leases.set(branch.history, branch.history.beginDisposalPreparation());
            this.disposalPreparation = preparation;
            this.editorEngine.action.beginDisposalPreparation(preparation);
            return preparation;
        } catch (error) {
            for (const [history, lease] of leases) history.cancelDisposalPreparation(lease);
            this.disposalPreparation = null;
            throw error;
        }
    }

    cancelDisposalPreparation(preparation: BranchDisposalPreparation): void {
        if (this.disposalPreparation !== preparation) throw new Error('The branch preparation owner changed.');
        this.editorEngine.action.cancelDisposalPreparation(preparation);
        for (const [history, lease] of preparation.leases) history.cancelDisposalPreparation(lease);
        this.disposalPreparation = null;
    }

    async clear(onDisposalStarted?: () => void, owner?: BranchDisposalPreparation): Promise<void> {
        const preparation = owner ?? this.beginDisposalPreparation();
        if (this.disposalPreparation !== preparation) throw new Error('The branch preparation owner changed.');
        let disposalStarted = false;
        try {
            await this.editorEngine.text.finalizeForDisposal(preparation.leases);
            const checkpoints = new Map<HistoryManager, HistoryDisposalCheckpoint>();
            for (const [history, lease] of preparation.leases) await history.commitForDisposal(lease);
            // Committing a gesture can schedule a fresh responsive source rebase.
            await this.editorEngine.action.flushAndWaitForPendingRebases(preparation);
            for (const [history, lease] of preparation.leases) {
                checkpoints.set(history, await history.flushForDisposal(lease));
            }
            if (this.branchMap.size !== preparation.branches.size ||
                [...preparation.branches].some(([id, branch]) => this.branchMap.get(id) !== branch)) {
                throw new Error('The source branches changed while saving. Keep this editor open.');
            }
            // No await may separate validation of every branch from release.
            for (const [history, lease] of preparation.leases) history.assertDisposalCheckpoint(lease, checkpoints.get(history)!);
            disposalStarted = true;
            onDisposalStarted?.();
            this.reactionDisposer?.();
            this.reactionDisposer = null;
            for (const [history, lease] of preparation.leases) history.releaseAfterDisposalFlush(lease, checkpoints.get(history)!);
            for (const branch of preparation.branches.values()) {
                branch.sandbox.clear();
                branch.error.clear();
            }
            for (const branch of preparation.branches.values()) await branch.codeEditor.cleanup();
            this.branchMap.clear();
            this.initializations.clear();
            this.currentBranchId = null;
            this.disposalPreparation = null;
        } catch (error) {
            if (!disposalStarted && !owner) this.cancelDisposalPreparation(preparation);
            throw error;
        }
    }

    // Helper methods for error management
    getAllErrors(): ParsedError[] {
        const allErrors: ParsedError[] = [];
        for (const branchData of this.branchMap.values()) {
            const branchErrors = branchData.error.errors.map((error) => ({
                ...error,
                branchId: branchData.branch.id,
                branchName: branchData.branch.name,
            }));
            allErrors.push(...branchErrors);
        }
        return allErrors;
    }

    getTotalErrorCount(): number {
        return Array.from(this.branchMap.values()).reduce(
            (total, branchData) => total + branchData.error.errors.length,
            0,
        );
    }

    getErrorsForBranch(branchId: string): ParsedError[] {
        const branchData = this.getBranchDataById(branchId);
        return branchData?.error.errors ?? [];
    }
}
