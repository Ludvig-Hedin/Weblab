import type { PostHog } from 'posthog-js/react';
import { makeAutoObservable, runInAction } from 'mobx';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';

import type { CodeFileSystem } from '@weblab/file-system';
import type { FrameworkId } from '@weblab/framework';
import { type Branch } from '@weblab/models';

import { ActionManager } from './action';
import { ApiManager } from './api';
import { AstManager } from './ast';
import { BranchManager } from './branch';
import { BreakpointsManager } from './breakpoints';
import { CanvasManager } from './canvas';
import { ChatManager } from './chat';
import { CodeManager } from './code';
import { CommentManager } from './comment';
import { ComponentsManager } from './components';
import { CopyManager } from './copy';
import { CopyToFigmaManager } from './copy/figma';
import { ElementsManager } from './element';
import { FontManager } from './font';
import { FrameEventManager } from './frame-events';
import { FramesManager } from './frames';
import { GroupManager } from './group';
import { IdeManager } from './ide';
import { ImageManager } from './image';
import { InsertManager } from './insert';
import { InteractionsManager } from './interactions';
import { MoveManager } from './move';
import { OverlayManager } from './overlay';
import { PagesManager } from './pages';
import { PresenceManager } from './presence';
import { type SandboxManager } from './sandbox';
import { ScreenshotManager } from './screenshot';
import { SnapManager } from './snap';
import { StateManager } from './state';
import { StyleManager } from './style';
import { StylePreferencesStore } from './style/preferences';
import { PropertiesClipboardManager } from './style/properties-clipboard';
import { TextEditingManager } from './text';
import { ThemeManager } from './theme';
import { TokensManager } from './tokens';

export class EditorEngine {
    private clearPromise: Promise<void> | null = null;
    isClosing = false;
    readonly projectId: string;
    readonly posthog: PostHog;
    /**
     * Framework adapter id for this project, read once at engine
     * construction from the project's runtime metadata. Surfaced so UI
     * (chat header chip, error states) can show what stack the AI is
     * calibrated for. `null` for legacy projects created before
     * multi-framework support — readers should treat that as 'nextjs'.
     */
    readonly framework: FrameworkId | null;
    readonly branches: BranchManager = new BranchManager(this);

    get activeSandbox(): SandboxManager {
        return this.branches.activeSandbox;
    }

    get history() {
        return this.branches.activeHistory;
    }

    get fileSystem(): CodeFileSystem {
        return this.branches.activeCodeEditor;
    }

    readonly state: StateManager = new StateManager(() => this.canUseDesign);
    readonly canvas: CanvasManager = new CanvasManager(this);
    readonly breakpoints: BreakpointsManager = new BreakpointsManager(this);
    readonly text: TextEditingManager = new TextEditingManager(this);
    readonly elements: ElementsManager = new ElementsManager(this);
    readonly overlay: OverlayManager = new OverlayManager(this);
    readonly insert: InsertManager = new InsertManager(this);
    readonly move: MoveManager = new MoveManager(this);
    readonly copy: CopyManager = new CopyManager(this);
    readonly figma: CopyToFigmaManager = new CopyToFigmaManager(this);
    readonly group: GroupManager = new GroupManager(this);
    readonly ast: AstManager = new AstManager(this);
    readonly action: ActionManager = new ActionManager(this);
    readonly style: StyleManager = new StyleManager(this);
    readonly stylePreferences: StylePreferencesStore = new StylePreferencesStore(this);
    readonly propertiesClipboard: PropertiesClipboardManager = new PropertiesClipboardManager(this);
    readonly code: CodeManager = new CodeManager(this);
    readonly components: ComponentsManager = new ComponentsManager(this);
    readonly chat: ChatManager = new ChatManager(this);
    readonly interactions: InteractionsManager = new InteractionsManager(this);
    readonly image: ImageManager = new ImageManager(this);
    readonly theme: ThemeManager = new ThemeManager(this);
    readonly tokens: TokensManager = new TokensManager(this);
    readonly font: FontManager = new FontManager(this);
    readonly pages: PagesManager = new PagesManager(this);
    readonly frames: FramesManager = new FramesManager(this);
    readonly frameEvent: FrameEventManager = new FrameEventManager(this);
    readonly screenshot: ScreenshotManager = new ScreenshotManager(this);
    readonly snap: SnapManager = new SnapManager(this);
    readonly api: ApiManager = new ApiManager(this);
    readonly ide: IdeManager = new IdeManager(this);
    readonly comment: CommentManager = new CommentManager(this);
    readonly presence: PresenceManager = new PresenceManager(this);

    constructor(projectId: string, posthog: PostHog, framework: FrameworkId | null = null) {
        this.projectId = projectId;
        this.posthog = posthog;
        this.framework = framework;
        makeAutoObservable<this, 'clearPromise'>(this, { clearPromise: false });
    }

    async init() {
        if (this.isClosing) throw new Error('The previous editor has not finished closing.');
        this.overlay.init();
        this.image.init();
        this.frameEvent.init();
        this.chat.init();
        this.style.init();
        this.stylePreferences.init();
        this.comment.init();
        this.presence.init();
    }

    /** Cloud roles come from the server; local working preferences cannot widen them. */
    get canUseDesign(): boolean {
        if (!this.branches.hasActiveBranch || !isCloudEditorRuntime(this.branches.activeBranch.runtime)) return true;
        const source = this.activeSandbox.cloudSource;
        return source?.canDesign === true && !source.isContentMode;
    }

    async initBranches(branches: Branch[]) {
        if (this.isClosing) throw new Error('The previous editor has not finished closing.');
        await this.branches.initBranches(branches);
        await this.branches.init();
        if (this.branches.hasActiveBranch && isCloudEditorRuntime(this.branches.activeBranch.runtime)) {
            await this.pages.scanPages();
        }
        await this.interactions.init();
        this.components.init();
    }

    // CR-050: collaborator-driven canvas/frames updates are picked up by
    // 30s polling on `userCanvas.getWithFrames` in `useStartProject`, with
    // an idempotent `applyFrames` that preserves local view bindings and
    // prunes server-deleted frames. Real-time push (tRPC subscriptions on
    // the existing Fastify+ws server) is a future improvement.

    clear(): Promise<void> {
        if (!this.clearPromise) {
            this.isClosing = true;
            let disposalStarted = false;
            const operation = this.clearAsync(() => { disposalStarted = true; }).catch((error: unknown) => {
                if (!disposalStarted && this.clearPromise === operation) {
                    this.clearPromise = null;
                    runInAction(() => { this.isClosing = false; });
                }
                throw error;
            });
            this.clearPromise = operation;
        }
        return this.clearPromise;
    }

    private async clearAsync(onDisposalStarted: () => void): Promise<void> {
        const preparation = this.branches.beginDisposalPreparation();
        let disposalStarted = false;
        try {
            await this.text.finalizeForDisposal(preparation.leases);
            // Rebases must finish while their captured branch is still alive.
            await this.action.flushAndWaitForPendingRebases(preparation);
            // History disposal persists pending edits and waits for code writes.
            // Keep the beforeunload guard attached until both have finished.
            await this.branches.clear(() => {
                disposalStarted = true;
                onDisposalStarted();
            }, preparation);
        } catch (error) {
            if (!disposalStarted) this.branches.cancelDisposalPreparation(preparation);
            throw error;
        } finally {
            if (disposalStarted) this.clearDisposedManagers();
        }
    }

    private clearDisposedManagers(): void {
        this.elements.clear();
        this.frames.clear();
        this.action.clear();
        this.overlay.clear();
        this.ast.clear();
        this.insert.clear();
        this.move.clear();
        this.style.clear();
        this.stylePreferences.clear();
        this.propertiesClipboard.clear();
        this.copy.clear();
        this.group.clear();
        this.canvas.clear();
        this.breakpoints.clear();
        this.image.clear();
        this.theme.clear();
        this.tokens.clear();
        this.font.clear();
        this.pages.clear();
        this.chat.clear();
        this.interactions.clear();
        this.code.clear();
        this.components.clear();
        this.frameEvent.clear();
        this.screenshot.clear();
        this.comment.clear();
        this.presence.clear();
        this.screenshot.clear();
        this.state.clear();
        this.snap.hideSnapLines();
    }

    clearUI() {
        this.overlay.clearUI();
        this.elements.clear();
        this.frames.deselectAll();
        this.snap.hideSnapLines();
    }

    async refreshLayers() {
        for (const frame of this.frames.getAll()) {
            if (!frame.view) {
                console.error('No frame view found');
                continue;
            }
            // Guard per-frame: a frame still in its cold-boot handshake carries
            // the safe-fallback bridge (processDom resolves null) or, on an
            // in-place reload, can reject — either way one booting/broken frame
            // must not abort the refresh for its already-connected siblings.
            try {
                if (typeof frame.view.processDom !== 'function') continue;
                await frame.view.processDom();
            } catch (error) {
                console.warn('processDom failed for frame; skipping', frame.frame.id, error);
            }
        }
    }
}
