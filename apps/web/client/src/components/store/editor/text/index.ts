import { makeAutoObservable } from 'mobx';

import type { CloudTextApproval, DomElement, EditTextAction, EditTextResult, ElementPosition, TextSlotEdit } from '@weblab/models';
import type { CodeFileSystem } from '@weblab/file-system';
import { readContentTextTarget } from '@weblab/parser/src/code-edit/content-target';
import { toast } from '@weblab/ui/sonner';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';

import type { EditorEngine } from '../engine';
import type { HistoryManager, HistoryDisposalLease } from '../history';
import type { IFrameView } from '@/app/project/[id]/_components/canvas/frame/view';
import { adaptRectToCanvas } from '../overlay/utils';
import { canEditJsxChildrenAsRichText, canEditJsxChildrenAsText, isHtmlSourcePath } from './editable';
import { registerEditingFontFaces } from './fonts';
import { cloudTextRenderer, matchesCloudTextElement, type CloudSource } from '../sandbox/cloud-source';

interface CloudTextSession {
    pin: CloudTextApproval;
    source: CloudSource;
    codeEditor: CodeFileSystem;
    history: HistoryManager;
    revision: number;
    externalRevision: string;
    value: string;
}

interface TextEditSessionSnapshot {
    history: HistoryManager | null;
    targetDomEl: DomElement;
    originalContent: string | null;
    commitOverride: ((newContent: string) => Promise<void>) | null;
    cloudText: CloudTextSession | null;
}

interface DisposalTextSession {
    session: TextEditSessionSnapshot;
    view: IFrameView;
    result: { domEl: DomElement; newContent: string; textSlots?: TextSlotEdit[] } | null;
    pushed: boolean;
    overrideSaved: boolean;
    overrideAcknowledged: boolean;
    overrideExternalRevision: string | null | undefined;
    stopError: Error | null;
}

export interface RejectedTextNavigationLease {
    assertCurrent(): void;
    release(): void;
}

export class TextEditingManager {
    private targetDomEl: DomElement | null = null;
    private sessionHistory: HistoryManager | null = null;
    private originalContent: string | null = null;
    private cloudTextSession: CloudTextSession | null = null;
    private latestInput: string | null = null;
    private pendingWorkSourceBranchId: string | null = null;
    isFinalizing = false;
    private shouldNotStartEditing = false;
    private pendingSessionOperations = new Set<Promise<void>>();
    private disposalSession: DisposalTextSession | null = null;
    private disposalPromise: Promise<void> | null = null;
    private rejectedNavigation: RejectedTextNavigationLease | null = null;
    /**
     * When set, the inline editor commits its final content through this
     * callback instead of writing the element's text to source. Used for
     * per-instance component-prop editing (Webflow's inline-bound-value edit):
     * the same contenteditable overlay, but the result becomes a JSX attribute
     * at the instance usage site rather than a master text edit.
     */
    private commitOverride: ((newContent: string) => Promise<void>) | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable<this, 'pendingSessionOperations' | 'disposalSession' | 'disposalPromise' | 'rejectedNavigation' | 'cloudTextSession'>(this, {
            pendingSessionOperations: false,
            disposalSession: false,
            disposalPromise: false,
            rejectedNavigation: false,
            cloudTextSession: false,
            hasPendingWork: false,
            pendingWorkBranchId: false,
            recoverableText: false,
        });
    }

    get isEditing(): boolean {
        return this.targetDomEl !== null;
    }

    /** Read live bookkeeping too: pending starts have no target element yet. */
    get hasPendingWork(): boolean {
        return this.shouldNotStartEditing || this.targetDomEl !== null ||
            this.pendingSessionOperations.size > 0 || this.disposalSession !== null ||
            this.disposalPromise !== null;
    }

    /** Pending startup and failed finalization retain their original source owner. */
    get pendingWorkBranchId(): string | null {
        return this.hasPendingWork ? this.pendingWorkSourceBranchId : null;
    }

    /** Keep the final captured result, or input not yet acknowledged by the frame. */
    get recoverableText(): string | null {
        return this.disposalSession?.result?.newContent ?? this.latestInput;
    }

    /** Freeze one settled failed cloud edit for an explicitly confirmed document reload.
     * Its text and history stay in memory until the document actually disappears.
     */
    prepareRejectedCloudNavigation(branchId: string): RejectedTextNavigationLease {
        const captured = this.disposalSession;
        const branch = this.editorEngine.branches.getBranchDataById(branchId);
        const history = captured?.session.history;
        if (this.rejectedNavigation || !captured?.result || !history || captured.stopError ||
            captured.session.commitOverride || captured.session.targetDomEl.branchId !== branchId ||
            !isCloudEditorRuntime(branch?.branch.runtime))
            throw new Error('Only a settled rejected cloud text session can be discarded here');
        const target = captured.session.targetDomEl;
        const assertSession = () => {
            if (this.editorEngine.isClosing || this.disposalSession !== captured ||
                this.targetDomEl !== target || this.sessionHistory !== history ||
                this.disposalPromise || this.pendingSessionOperations.size ||
                this.editorEngine.branches.getBranchDataById(branchId)?.history !== history)
                throw new Error('The text session changed or is still saving');
        };
        assertSession();
        if (!history.canNavigateRejectedText(target)) throw new Error('Other history work is still pending');
        const historyLease = history.beginDisposalPreparation();
        let released = false;
        const navigation: RejectedTextNavigationLease = {
            assertCurrent: () => {
                assertSession();
                if (released || this.rejectedNavigation !== navigation ||
                    !history.canNavigateRejectedText(target, historyLease))
                    throw new Error('The rejected text navigation owner changed');
            },
            release: () => {
                if (released) return;
                released = true;
                if (this.rejectedNavigation === navigation) this.rejectedNavigation = null;
                history.cancelDisposalPreparation(historyLease);
            },
        };
        this.rejectedNavigation = navigation;
        return navigation;
    }

    private canStartOnBranch(branchId: string): boolean {
        const branch = this.editorEngine.branches.getBranchDataById(branchId);
        if (!branch) return false;
        return !isCloudEditorRuntime(branch.branch?.runtime) || branch.sandbox?.cloudSource?.canWrite === true;
    }

    get targetElement(): DomElement | null {
        return this.targetDomEl;
    }

    /**
     * Source-AST editability gate. The preload's DOM-side check cannot tell
     * static text from a rendered `{expression}` (both are text nodes), so the
     * verdict comes from the element's source snippet via the code index.
     * `true` = safe to inline-edit; `false` = dynamic/markup children;
     * `null` = can't determine (no metadata / unparsable snippet).
     */
    async isChildTextEditable(
        el: Pick<DomElement, 'oid' | 'branchId' | 'contentIdentity'>,
        rich = false,
    ): Promise<boolean | null> {
        if (!el.oid) {
            return null;
        }
        const branchData = this.editorEngine.branches.getBranchDataById(el.branchId);
        if (!branchData) {
            return null;
        }
        try {
            const metadata = await branchData.codeEditor.getJsxElementMetadata(el.oid);
            if (!metadata) {
                return null;
            }
            const cloud = branchData.sandbox?.cloudSource;
            if (cloud && (!cloud.canDesign || cloud.isContentMode) && !cloud.canEditText(metadata.path, el.oid, el.contentIdentity)) return false;
            if (cloud?.isContentMode && cloud.state.profile !== 'starter-v1') {
                const pin = cloud.resolveTextApproval(metadata.path, el.oid, el.contentIdentity);
                if (!pin || rich || cloud.state.localDraftChanges) return false;
                const revision = cloud.state.savedRevision;
                const source = await branchData.codeEditor.readFile(pin.path);
                if (typeof source !== 'string' || cloud.state.savedRevision !== revision || !cloud.isTextApprovalCurrent(pin)) return false;
                readContentTextTarget(source, pin.target);
                return true;
            }
            if (isHtmlSourcePath(metadata.path)) {
                // Whole-block (span-preserving) writes are JSX-only.
                return rich ? false : true;
            }
            return rich
                ? canEditJsxChildrenAsRichText(metadata.code)
                : canEditJsxChildrenAsText(metadata.code);
        } catch (error) {
            console.error('Error checking text editability:', error);
            return null;
        }
    }

    /**
     * Start the iframe-side edit and gate it on the source. The preload may
     * widen a double-clicked line (<span>) to its whole text block (the
     * heading). If the block can't be written back safely, fall back to
     * editing just the element that was hit.
     */
    private async beginFrameEdit(
        el: DomElement,
        frameView: IFrameView,
        cloudText: CloudTextSession | null = null,
    ): Promise<{ target: DomElement; res: EditTextResult } | { blocked: boolean | null }> {
        if (cloudText) {
            this.assertCloudTextSession(cloudText);
            await this.assertCloudTextElement(cloudText, el);
            if (cloudText.value.includes('\r')) throw new Error('This source text contains unsupported carriage returns.');
            const res = await frameView.startEditingPlainTextV1(el.domId);
            this.assertCloudTextSession(cloudText);
            await this.assertCloudTextElement(cloudText, el);
            if (!res || res.textRenderMode !== 'plain-string-v1' || res.rich || !res.domEl || res.domEl.domId !== el.domId || res.domEl.frameId !== el.frameId || res.domEl.instanceId !== el.instanceId || !matchesCloudTextElement(cloudText.pin, res.domEl) ||
                res.domEl.branchId !== cloudText.pin.branchId || res.originalContent !== cloudText.value)
                throw new Error('The rendered text no longer matches its approved source.');
            return { target: res.domEl, res };
        }
        const res = await frameView.startEditingText(el.domId);
        if (res) {
            const target = res.domEl ?? el;
            const verdict = await this.isChildTextEditable(target, res.rich === true);
            if (verdict === true) {
                return { target, res };
            }
            await frameView.stopEditingText(target.domId);
            if (target.domId === el.domId) {
                return { blocked: verdict };
            }
        }
        // Hit element on its own (previous per-line behaviour).
        const verdict = await this.isChildTextEditable(el);
        if (verdict !== true) {
            return { blocked: verdict };
        }
        const single = await frameView.startEditingText(el.domId, false);
        if (!single) {
            return { blocked: false };
        }
        if (single.rich && (await this.isChildTextEditable(el, true)) !== true) {
            await frameView.stopEditingText(el.domId);
            return { blocked: false };
        }
        return { target: el, res: single };
    }

    async start(
        el: DomElement,
        frameView: IFrameView,
        commitOverride?: (newContent: string) => Promise<void>,
    ): Promise<void> {
        if (this.editorEngine.isClosing || this.disposalSession || this.disposalPromise || !this.canStartOnBranch(el.branchId)) return;
        const operation = this.startSession(el, frameView, commitOverride);
        this.pendingSessionOperations.add(operation);
        try { await operation; } finally { this.pendingSessionOperations.delete(operation); }
    }

    private assertCloudTextSession(session: CloudTextSession): void {
        const branch = this.editorEngine.branches.getBranchDataById(session.pin.branchId);
        if (!branch || branch.history !== session.history || branch.codeEditor !== session.codeEditor ||
            branch.sandbox.cloudSource !== session.source || session.source.state.savedRevision !== session.revision ||
            session.source.getExternalRevision() !== session.externalRevision || session.source.state.localDraftChanges ||
            !session.source.canWrite || !session.source.isTextApprovalCurrent(session.pin))
            throw new Error('The original text approval or saved source changed. Your text is still available.');
    }

    private async assertCloudTextElement(session: CloudTextSession, element: DomElement): Promise<void> {
        if (!matchesCloudTextElement(session.pin, element)) throw new Error('The selected text belongs to a different approved item.');
        if (session.pin.target.kind === 'component-literal') return;
        const matches = await this.editorEngine.action.approvedTextElements(session.pin, element.frameId);
        this.assertCloudTextSession(session);
        if (!matches || matches.length !== 1 || matches[0]?.domId !== element.domId)
            throw new Error('The selected FAQ item is missing or appears more than once.');
    }

    private async captureCloudTextSession(el: DomElement): Promise<CloudTextSession | null> {
        const branch = this.editorEngine.branches.getBranchDataById(el.branchId);
        const source = branch?.sandbox.cloudSource;
        if (!source?.isContentMode || source.state.profile === 'starter-v1') return null;
        if (!branch || !el.oid || !source.canWrite || source.state.localDraftChanges) throw new Error('Reload the saved source before editing text.');
        const revision = source.state.savedRevision;
        const externalRevision = source.getExternalRevision();
        const oid = el.oid;
        const actorId = source.state.textContracts?.actorId;
        const pin = source.resolveRenderedTextApproval(el);
        if (!pin || pin.actorId !== actorId) throw new Error('This text is not approved for editing.');
        const codeEditor = branch.codeEditor;
        const history = branch.history;
        const metadata = await codeEditor.getJsxElementMetadata(oid);
        if (metadata?.path.replace(/^\/+/, '') !== cloudTextRenderer(pin).path || !source.isTextApprovalCurrent(pin))
            throw new Error('The original text approval changed.');
        const content = await codeEditor.readFile(pin.path);
        if (typeof content !== 'string') throw new Error('The approved text source is unavailable.');
        const session = { pin, source, codeEditor, history, revision, externalRevision,
            value: readContentTextTarget(content, pin.target) };
        this.assertCloudTextSession(session);
        return session;
    }

    private async startSession(
        el: DomElement,
        frameView: IFrameView,
        commitOverride?: (newContent: string) => Promise<void>,
    ): Promise<void> {
        if (commitOverride && this.editorEngine.canUseDesign === false) return;
        if (this.shouldNotStartEditing || this.targetDomEl) {
            return;
        }
        this.shouldNotStartEditing = true;
        this.pendingWorkSourceBranchId = el.branchId;
        this.latestInput = null;

        let started: DomElement | null = null;
        let cloudText: CloudTextSession | null = null;
        let frameStartAttempted = false;
        try {
            const history = this.editorEngine.branches.getBranchDataById(el.branchId)?.history;
            if (!history) throw new Error('The text source branch is no longer available.');
            this.commitOverride = commitOverride ?? null;
            cloudText = await this.captureCloudTextSession(el);
            if (cloudText && commitOverride) throw new Error('Approved text requires its original save path.');
            frameStartAttempted = true;
            const begun = await this.beginFrameEdit(el, frameView, cloudText);
            if ('blocked' in begun) {
                this.commitOverride = null;
                this.shouldNotStartEditing = false;
                // Surface why, or double-click looks silently broken.
                toast.info(
                    begun.blocked === null
                        ? 'Could not verify this text is safe to edit inline — edit it in code instead.'
                        : 'This text is dynamic — edit it in code or ask AI to change it.',
                );
                return;
            }
            const { target, res } = begun;
            started = target;
            if (target.branchId !== el.branchId) throw new Error('The text edit belongs to a different source branch.');

            const computedStyles = (await frameView.getComputedStyleByDomId(target.domId)) as Record<
                string,
                string
            > | null;
            if (!computedStyles) {
                throw new Error('Failed to get computed styles for text editing');
            }
            // The editor overlay lives outside the frame: load the frame's own
            // web fonts here so the text keeps its real typeface while editing.
            await registerEditingFontFaces(res.fontFaces ?? []);
            if (cloudText) {
                this.assertCloudTextSession(cloudText);
                await this.assertCloudTextElement(cloudText, target);
            }

            // Source may have changed while the bridge/fonts were awaited.
            // Roll back this unstarted editor, never an existing active session.
            if (!this.canStartOnBranch(el.branchId)) throw new Error('Reload the saved source before editing text.');
            if (this.editorEngine.canUseDesign === false && (await this.isChildTextEditable(target, res.rich === true)) !== true) throw new Error('This text is not approved for editing.');
            if (cloudText) this.assertCloudTextSession(cloudText);

            const { originalContent } = res;
            this.latestInput = originalContent;
            this.targetDomEl = target;
            this.originalContent = originalContent;
            this.sessionHistory = history;
            this.cloudTextSession = cloudText;
            // This start was admitted before closing. Keep its frame session
            // for the strict finalizer instead of consuming it in rollback.
            if (this.editorEngine.isClosing || history.isPreparingForDisposal) return;
            await history.startTransaction();
            if (cloudText) this.assertCloudTextSession(cloudText);

            const adjustedRect = adaptRectToCanvas(target.rect, frameView);
            const isComponent = target.instanceId !== null;
            this.editorEngine.overlay.clearUI();

            this.editorEngine.overlay.state.addTextEditor(
                adjustedRect,
                this.originalContent,
                // Full computed styles of the edited element, with the exact
                // typography values read from the frame on top.
                { ...computedStyles, ...(res.typography ?? {}) },
                (content: string) => {
                    void this.edit(content);
                },
                () => {
                    void this.end();
                },
                isComponent,
                cloudText ? 'plain-string-v1' : 'legacy',
            );
        } catch (error) {
            console.error('Error starting text edit:', error);
            // Roll back the iframe-side start: startEditingText may have already
            // marked the element with data-weblab-editing-text, which the
            // injected stylesheet hides with `opacity: 0`. If a later step threw
            // (e.g. getComputedStyleByDomId returned null on a penpal hiccup)
            // before targetDomEl was assigned, clean()'s guarded path can't
            // reach stopEditingText — the element would stay invisible with no
            // editor and no recovery short of an iframe reload. Best-effort
            // clear the attribute here.
            try {
                const frameData = this.editorEngine.frames.get(el.frameId);
                if (frameStartAttempted) {
                    if (cloudText) await frameData?.view?.stopEditingPlainTextV1((started ?? el).domId);
                    else await frameData?.view?.stopEditingText((started ?? el).domId);
                }
            } catch (cleanupError) {
                console.error('Error rolling back text edit start:', cleanupError);
            }
            this.editorEngine.overlay.state.removeTextEditor();
            if (started && this.targetDomEl === started) {
                this.targetDomEl = null;
                this.sessionHistory = null;
                this.originalContent = null;
                this.cloudTextSession = null;
                this.commitOverride = null;
            }
            // Reset the guard so a failure after it was set doesn't permanently
            // block editSelectedElement() for the rest of the session — it is
            // otherwise only reset in clean().
            this.shouldNotStartEditing = false;
        }
    }

    async edit(newContent: string): Promise<void> {
        if (this.isFinalizing) return;
        // Capture synchronously before the frame RPC; recovery must include the
        // last keystroke even when that RPC or final source write fails.
        if (this.targetDomEl) this.latestInput = newContent;
        if (this.editorEngine.isClosing || this.disposalSession || this.disposalPromise) return;
        const operation = this.editSession(newContent);
        this.pendingSessionOperations.add(operation);
        try { await operation; } finally { this.pendingSessionOperations.delete(operation); }
    }

    private async editSession(newContent: string): Promise<void> {
        try {
            if (!this.targetDomEl) {
                throw new Error('No target dom element to edit');
            }
            const target = this.targetDomEl;
            const session: TextEditSessionSnapshot = {
                targetDomEl: target,
                history: this.sessionHistory,
                originalContent: this.originalContent,
                commitOverride: this.commitOverride,
                cloudText: this.cloudTextSession,
            };
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                throw new Error('No frameView found for text editing');
            }

            if (session.cloudText) {
                this.assertCloudTextSession(session.cloudText);
                await this.assertCloudTextElement(session.cloudText, target);
            }

            if (session.cloudText && newContent.includes('\r')) throw new Error('Carriage returns are unsupported in approved text.');
            const res = session.cloudText
                ? await frameData.view.editPlainTextV1(target.domId, newContent)
                : await frameData.view.editText(target.domId, newContent);
            if (!res || (session.cloudText && (!('textRenderMode' in res) || res.textRenderMode !== 'plain-string-v1'))) {
                throw new Error('Failed to edit text. No dom element returned');
            }

            await this.handleEditedText(res.domEl, newContent, frameData.view, session, res.textSlots);
        } catch (error) {
            console.error('Error editing text:', error);
        }
    }

    async end(): Promise<void> {
        try {
            await this.finalizeForDisposal();
        } catch (error) {
            console.error('Error ending text edit:', error);
        }
    }

    /**
     * @param expected When provided, clean only tears down if this element is
     * still the active edit target. If cleanup sequencing changes later, a
     * stale clean must not close a newer editor or commit its transaction.
     */
    async clean(expected?: DomElement): Promise<void> {
        if (expected && this.targetDomEl !== expected) {
            return;
        }
        await this.finalizeForDisposal();
    }

    /** Keep the stopped rich-text result and source session until saving succeeds. */
    finalizeForDisposal(owner?: ReadonlyMap<HistoryManager, HistoryDisposalLease>): Promise<void> {
        if (this.rejectedNavigation) return Promise.reject(new Error('A confirmed cloud reload owns this rejected text session'));
        if (this.disposalPromise) return this.disposalPromise;
        this.isFinalizing = true;
        const operation = this.finalizeSessionForDisposal(owner).finally(() => {
            if (this.disposalPromise === operation) this.disposalPromise = null;
            if (!this.disposalSession) this.isFinalizing = false;
        });
        this.disposalPromise = operation;
        return operation;
    }

    private async finalizeSessionForDisposal(owner?: ReadonlyMap<HistoryManager, HistoryDisposalLease>): Promise<void> {
        while (this.pendingSessionOperations.size > 0) {
            await Promise.all([...this.pendingSessionOperations]);
        }
        if (!this.disposalSession) {
            const target = this.targetDomEl;
            if (!target) return;
            const view = this.editorEngine.frames.get(target.frameId)?.view;
            if (!view || !this.sessionHistory) throw new Error('The text source session cannot be saved yet.');
            this.disposalSession = {
                session: { targetDomEl: target, history: this.sessionHistory, originalContent: this.originalContent, commitOverride: this.commitOverride, cloudText: this.cloudTextSession },
                view, result: null, pushed: false, overrideSaved: false, overrideAcknowledged: false,
                overrideExternalRevision: undefined, stopError: null,
            };
        }
        const captured = this.disposalSession;
        const { session } = captured;
        const history = session.history;
        if (!history) throw new Error('The text source session is no longer available.');
        const lease = owner ? owner.get(history) : history.beginDisposalPreparation();
        if (!lease) throw new Error('The final text preparation owner is missing.');
        let registered = false;
        try {
            if (!owner) {
                this.editorEngine.action.beginHistoryDisposalPreparation(session.targetDomEl.branchId, lease);
                registered = true;
            }
            await this.saveCapturedText(captured, history, lease);
            this.sessionHistory = null;
            this.targetDomEl = null;
            this.originalContent = null;
            this.latestInput = null;
            this.commitOverride = null;
            this.cloudTextSession = null;
            this.shouldNotStartEditing = false;
            this.disposalSession = null;
            this.editorEngine.overlay.state.removeTextEditor();
        } finally {
            if (!owner) {
                if (registered) this.editorEngine.action.cancelHistoryDisposalPreparation(session.targetDomEl.branchId, lease);
                history.cancelDisposalPreparation(lease);
            }
        }
    }

    private async saveCapturedText(captured: DisposalTextSession, history: HistoryManager, lease: HistoryDisposalLease): Promise<void> {
        const { session } = captured;
        if (captured.stopError) throw captured.stopError;
        if (!captured.result) {
            try {
                const result = session.cloudText
                    ? await captured.view.stopEditingPlainTextV1(session.targetDomEl.domId)
                    : await captured.view.stopEditingText(session.targetDomEl.domId);
                if (!result || !result.domEl || typeof result.newContent !== 'string' ||
                    (session.cloudText && (!('textRenderMode' in result) || result.textRenderMode !== 'plain-string-v1' || result.newContent.includes('\r') || result.domEl.frameId !== session.targetDomEl.frameId || result.domEl.instanceId !== session.targetDomEl.instanceId)) ||
                    result.domEl.branchId !== session.targetDomEl.branchId ||
                    result.domEl.domId !== session.targetDomEl.domId ||
                    (result.textSlots !== undefined && !Array.isArray(result.textSlots))) {
                    throw new Error('The final text could not be captured safely.');
                }
                captured.result = { domEl: result.domEl, newContent: result.newContent,
                    ...(result.textSlots !== undefined ? { textSlots: result.textSlots } : {}) };
            } catch (error) {
                // A lost reply may have consumed the frame's rich slots already.
                // Never turn a second empty reply into proof that nothing changed.
                captured.stopError = error instanceof Error ? error : new Error('The final text reply was lost.');
                throw captured.stopError;
            }
        }
        const { newContent, textSlots } = captured.result;
        if (session.cloudText && !captured.pushed) {
            this.assertCloudTextSession(session.cloudText);
            await this.assertCloudTextElement(session.cloudText, session.targetDomEl);
            if (textSlots !== undefined || !matchesCloudTextElement(session.cloudText.pin, captured.result.domEl))
                throw new Error('Approved text cannot replace nested markup.');
        }
        if (session.commitOverride) {
            if (!captured.overrideSaved) {
                captured.overrideExternalRevision = history.getExternalRevisionForDisposal(lease);
                await session.commitOverride(newContent);
                captured.overrideSaved = true;
            }
            if (!captured.overrideAcknowledged) {
                history.acknowledgeDisposalSourceWrite(lease, captured.overrideExternalRevision);
                captured.overrideAcknowledged = true;
            }
        } else if (!captured.pushed && textSlots?.length !== 0) {
            const action: EditTextAction = { type: 'edit-text',
                targets: [{ frameId: session.targetDomEl.frameId, branchId: session.targetDomEl.branchId,
                    domId: session.targetDomEl.domId, oid: session.targetDomEl.oid }],
                originalContent: session.originalContent ?? '', newContent,
                ...(session.cloudText ? { cloudText: session.cloudText.pin } : {}),
                ...(textSlots !== undefined ? { textSlots } : {}) };
            if (!await history.pushForDisposal(action, lease)) throw new Error('The final text could not be saved.');
            captured.pushed = true;
        }
        await history.commitForDisposal(lease);
        await this.editorEngine.action.flushAndWaitForPendingRebases();
        await history.flushForDisposal(lease);
    }

    private async handleEditedText(
        domEl: DomElement,
        newContent: string,
        frameView: IFrameView,
        session?: TextEditSessionSnapshot,
        textSlots?: TextSlotEdit[],
    ): Promise<void> {
        try {
            if (session && this.targetDomEl !== session.targetDomEl) return;
            if (session && domEl.branchId !== session.targetDomEl.branchId) {
                throw new Error('The text edit belongs to a different source branch.');
            }
            const commitOverride = session ? session.commitOverride : this.commitOverride;
            const originalContent = session ? session.originalContent : this.originalContent;
            const cloudText = session ? session.cloudText : this.cloudTextSession;
            if (cloudText) {
                this.assertCloudTextSession(cloudText);
                await this.assertCloudTextElement(cloudText, domEl);
                if (textSlots !== undefined || !matchesCloudTextElement(cloudText.pin, domEl) || domEl.domId !== session?.targetDomEl.domId || domEl.frameId !== session?.targetDomEl.frameId || domEl.instanceId !== session?.targetDomEl.instanceId)
                    throw new Error('Approved text cannot replace another element or nested markup.');
            }
            // Per-instance prop edits don't persist the master text — the
            // override (run on end) writes the instance attribute instead, so
            // skip the edit-text history push but keep live visual feedback.
            if (!commitOverride && textSlots?.length !== 0) {
                const history = session ? session.history : this.sessionHistory;
                if (!history) throw new Error('The text editing session is no longer available.');
                await history.push({
                    type: 'edit-text',
                    targets: [
                        {
                            frameId: frameView.id,
                            branchId: domEl.branchId,
                            domId: domEl.domId,
                            oid: domEl.oid,
                        },
                    ],
                    originalContent: originalContent ?? '',
                    newContent,
                    ...(cloudText ? { cloudText: cloudText.pin } : {}),
                    // Whole-block edits (element with inline children) write
                    // per-run so spans/<strong> survive; undefined otherwise.
                    ...(textSlots ? { textSlots } : {}),
                });
            }
            if (session && this.targetDomEl !== session.targetDomEl) {
                return;
            }
            if (cloudText) await this.editorEngine.action.previewApprovedText(cloudText.pin, newContent,
                { frameId: frameView.id, domId: domEl.domId });
            const adjustedRect = adaptRectToCanvas(domEl.rect, frameView);
            this.editorEngine.overlay.state.updateTextEditor(adjustedRect, {
                content: newContent,
            });
            await this.editorEngine.overlay.refresh();
        } catch (error) {
            console.error('Error handling edited text:', error);
        }
    }

    async editSelectedElement(): Promise<void> {
        if (this.shouldNotStartEditing) {
            return;
        }

        try {
            const selected = this.editorEngine.elements.selected;
            if (selected.length === 0) {
                console.error('No selected elements found');
                return;
            }

            const selectedEl = selected[0];
            if (!selectedEl) {
                console.error('No selected element found');
                return;
            }

            const frameData = this.editorEngine.frames.get(selectedEl.frameId);
            if (!frameData?.view) {
                console.error('No frameView found for selected element');
                return;
            }

            const domEl = await frameData.view.getElementByDomId(selectedEl.domId, true);
            if (!domEl) {
                return;
            }

            await this.start(domEl, frameData.view);
        } catch (error) {
            console.error('Error editing selected element:', error);
            return;
        }
    }

    async editElementAtLoc(pos: ElementPosition, frameView: IFrameView): Promise<void> {
        try {
            const el = await frameView.getElementAtLoc(pos.x, pos.y, true);
            if (!el) {
                console.error('Failed to get element at location');
                return;
            }
            await this.start(el, frameView);
        } catch (error) {
            console.error('Error editing element at location:', error);
            return;
        }
    }
}
