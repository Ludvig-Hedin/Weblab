import type { PostHog } from 'posthog-js/react';
import { makeAutoObservable } from 'mobx';

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
import { CopyManager } from './copy';
import { ElementsManager } from './element';
import { FontManager } from './font';
import { FrameEventManager } from './frame-events';
import { FramesManager } from './frames';
import { GroupManager } from './group';
import { IdeManager } from './ide';
import { ImageManager } from './image';
import { InsertManager } from './insert';
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
import { TextEditingManager } from './text';
import { ThemeManager } from './theme';

export class EditorEngine {
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

    readonly state: StateManager = new StateManager();
    readonly canvas: CanvasManager = new CanvasManager(this);
    readonly breakpoints: BreakpointsManager = new BreakpointsManager(this);
    readonly text: TextEditingManager = new TextEditingManager(this);
    readonly elements: ElementsManager = new ElementsManager(this);
    readonly overlay: OverlayManager = new OverlayManager(this);
    readonly insert: InsertManager = new InsertManager(this);
    readonly move: MoveManager = new MoveManager(this);
    readonly copy: CopyManager = new CopyManager(this);
    readonly group: GroupManager = new GroupManager(this);
    readonly ast: AstManager = new AstManager(this);
    readonly action: ActionManager = new ActionManager(this);
    readonly style: StyleManager = new StyleManager(this);
    readonly stylePreferences: StylePreferencesStore = new StylePreferencesStore(this);
    readonly code: CodeManager = new CodeManager(this);
    readonly chat: ChatManager = new ChatManager(this);
    readonly image: ImageManager = new ImageManager(this);
    readonly theme: ThemeManager = new ThemeManager(this);
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
        makeAutoObservable(this);
    }

    async init() {
        this.overlay.init();
        this.image.init();
        this.frameEvent.init();
        this.chat.init();
        this.style.init();
        this.stylePreferences.init();
        this.comment.init();
        this.presence.init();
    }

    async initBranches(branches: Branch[]) {
        await this.branches.initBranches(branches);
        await this.branches.init();
    }

    // CR-050: collaborator-driven canvas/frames updates are picked up by
    // 30s polling on `userCanvas.getWithFrames` in `useStartProject`, with
    // an idempotent `applyFrames` that preserves local view bindings and
    // prunes server-deleted frames. Real-time push (tRPC subscriptions on
    // the existing Fastify+ws server) is a future improvement.

    clear() {
        this.elements.clear();
        this.frames.clear();
        this.action.clear();
        this.overlay.clear();
        this.ast.clear();
        this.text.clean();
        this.insert.clear();
        this.move.clear();
        this.style.clear();
        this.stylePreferences.clear();
        this.copy.clear();
        this.group.clear();
        this.canvas.clear();
        this.breakpoints.clear();
        this.image.clear();
        this.theme.clear();
        this.font.clear();
        this.pages.clear();
        this.chat.clear();
        this.code.clear();
        this.branches.clear();
        this.frameEvent.clear();
        this.screenshot.clear();
        this.comment.clear();
        this.presence.clear();
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
            await frame.view.processDom();
        }
    }
}
