import { freezeCloudPropertyApproval, reconstructCloudPropertyAction, validCloudPropertyApproval } from '../sandbox/cloud-property-approval';
import { validCloudImageApproval, freezeCloudImageApproval } from '../sandbox/cloud-image-approval';
import { readContentImageTarget, replaceContentImageTarget } from '@weblab/parser/src/code-edit/content-image-target';
import { createEditorBeforeUnloadHandler } from './before-unload';
import { replaceContentTextTarget } from '@weblab/parser/src/code-edit/content-target';
import { validCloudTextApproval, cloudTextRenderer, freezeCloudTextApproval } from '../sandbox/cloud-source';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import { makeAutoObservable } from 'mobx';

import type { CodeFileSystem } from '@weblab/file-system';
import type { BreakpointId, DomElement } from '@weblab/models';
import type { CssModuleProperty, CssModuleStyleEdit } from '@weblab/models/actions';
import { NodeFsProvider } from '@weblab/code-provider';
import type { BreakpointEntry } from '@weblab/parser';
import { type Action, type CodeDiff, type CodeDiffRequest, type FileToRequests, type UpdateStyleAction } from '@weblab/models';
import { assertStaticClassName, getAstFromCodeblock, getAstFromContent, selectPipeline } from '@weblab/parser';
import { toast } from '@weblab/ui/sonner';
import { assertNever } from '@weblab/utility';

import { type EditorEngine } from '@/components/store/editor/engine';
import type { BranchData } from '../branch/manager';
import type { HistoryDisposalLease } from '../history';
import { getOrCreateCodeDiffRequest } from './helpers';
import {
    getEditTextRequests,
    getGroupRequests,
    getInsertImageRequests,
    getInsertRequests,
    getMoveRequests,
    getRemoveImageRequests,
    getRemoveRequests,
    getStyleRequests,
    getUngroupRequests,
    getWriteCodeRequests,
    processGroupedRequests,
} from './requests';
import { addResponsiveTailwindToRequest, getTailwindClasses, tailwindPrefixForWidth } from './tailwind';
import { hasUnsupportedResponsiveStyleValue } from '../style/local-style-writer';
import { breakpointMinWidth, readProjectBreakpoints } from './project-breakpoints';

import { CSS_MODULE_PROPERTIES, readCssModuleDeclaration, replaceCssModuleDeclaration, resolveCssModuleBinding, validateCssModuleStyleEdit } from './css-module-declaration';

export interface CssModuleStyleInspection {
    branchId: string;
    oid: string;
    frameId: string;
    domId: string;
    sourcePath: string;
    source: string;
    cssPath: string;
    css: string;
    className: string;
    properties: Partial<Record<CssModuleProperty, string>>;
}

interface ElementMetadataUpdate {
    oid: string;
    branchId: string;
    attributes?: Record<string, string>;
    tagName?: string | null;
    overrideClasses?: boolean | null;
}

export class CodeManager {
    private cssModuleInspectionOwners = new WeakMap<CssModuleStyleInspection, {
        branch: BranchData; codeEditor: CodeFileSystem; provider: NodeFsProvider; version: string | null;
    }>();
    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
        this.attachBeforeUnload();
    }

    /**
     * Number of writes currently queued/running on `writeChain`. Reloading
     * while this is non-zero can truncate the file mid-transport (the user
     * hit exactly this: a rapid element-delete burst + reload left
     * `page.tsx` ending in `</m` — unparseable, preview dead, later writes
     * failing at parse). The beforeunload guard below warns instead.
     */
    private pendingWrites = 0;
    private moduleApplyPending = false;
    private moduleApplyRun: Promise<void> | null = null;
    cssModulePreview: { branchId: string; status: 'requested' | 'pending' | 'failed' } | null = null;

    get hasPendingWrites(): boolean {
        return this.pendingWrites > 0 || this.moduleApplyPending;
    }

    async waitForPendingWrites(): Promise<void> {
        while (this.moduleApplyRun) await this.moduleApplyRun.catch(() => undefined);
        await this.writeChain;
    }

    private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

    private attachBeforeUnload() {
        if (typeof window === 'undefined') return;
        if (this.beforeUnloadHandler) return;
        const handler = createEditorBeforeUnloadHandler(
            () => this.editorEngine.action.flushPendingRebases(),
            () => ({
                pendingWrites: this.hasPendingWrites,
                pendingRebases: this.editorEngine.action.hasPendingRebases,
                pendingStylePreflights: this.editorEngine.action.hasPendingStylePreflights,
                text: {
                    pending: this.editorEngine.text?.hasPendingWork ?? false,
                    branchId: this.editorEngine.text?.pendingWorkBranchId ?? null,
                },
                branches: this.editorEngine.branches.allBranches.map((branch) => ({
                    id: branch.id,
                    runtime: branch.runtime.type,
                    historyOpen: this.editorEngine.branches.getBranchDataById(branch.id)?.history.isTransactionOpen ?? false,
                })),
            }),
        );
        window.addEventListener('beforeunload', handler);
        this.beforeUnloadHandler = handler;
    }

    private detachBeforeUnload() {
        if (typeof window === 'undefined') return;
        if (!this.beforeUnloadHandler) return;
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
    }

    /**
     * Apply an action's code changes to the file system. Returns `true` on
     * success and `false` if the write failed (the error is surfaced to the
     * user here via toast + the Errors console). Callers use the result to
     * keep history in sync — see `HistoryManager.push`, which drops an action
     * from the undo stack when its write fails so a later undo can't emit the
     * inverse of an edit that never landed.
     */
    async write(action: Action, sourceContext?: { branchId: string; codeEditor: CodeFileSystem; current?: () => boolean; validate?: () => Promise<boolean> }): Promise<boolean> {
        try {
            if (action.type === 'write-code' && 'cloudProperty' in action) {
                const edit = action.cloudProperty;
                if (!edit || !validCloudPropertyApproval(edit.pin)) throw new Error('This property edit has no valid original approval.');
                const pin = freezeCloudPropertyApproval(edit.pin), branch = this.editorEngine.branches.getBranchDataById(pin.branchId), source = branch?.sandbox.cloudSource;
                const codeEditor = sourceContext?.codeEditor ?? branch?.codeEditor;
                if (!branch || !source || !codeEditor || !isCloudEditorRuntime(branch.branch.runtime) || branch.codeEditor !== codeEditor ||
                    (sourceContext && sourceContext.branchId !== pin.branchId)) throw new Error('The property source is no longer available.');
                const revision = source.state.savedRevision, version = source.getSourceVersion(), externalRevision = source.getExternalRevision();
                const current = () => (sourceContext?.current?.() ?? true) && !this.editorEngine.isClosing && this.editorEngine.branches.hasActiveBranch &&
                    this.editorEngine.branches.activeBranchData === branch && this.editorEngine.branches.getBranchDataById(pin.branchId) === branch &&
                    branch.sandbox.cloudSource === source && branch.codeEditor === codeEditor && source.isContentMode &&
                    source.state.savedRevision === revision && source.getSourceVersion() === version && source.getExternalRevision() === externalRevision;
                const original = await codeEditor.readFile(pin.path);
                if (typeof original !== 'string' || !current()) return false;
                const reconstructed = reconstructCloudPropertyAction(action, original), diff = reconstructed.diffs[0]!;
                const choice = pin.binding.options.find(option => option.value === edit.value);
                if (!choice) return false;
                const saved = await source.withApprovedPropertyWrite({ pin, revision, previousValue: edit.previousValue, choiceId: choice.id,
                    original, candidate: diff.generated, current, validate: sourceContext?.validate }, lease => this.enqueueWrite(async () => {
                        if (!lease.current() || await codeEditor.readFile(pin.path) !== original || !lease.current()) return false;
                        return lease.commit();
                    }));
                if (!saved) throw new Error('The approved property could not be saved.');
                return true;
            }
            if (action.type === 'write-code' && 'cloudImage' in action) {
                const edit = action.cloudImage;
                if (!edit || !validCloudImageApproval(edit.pin) || !['src', 'alt'].includes(edit.field) ||
                    !edit.pin.binding.fields.includes(edit.field) || action.diffs.length !== 1 || action.branchId !== edit.pin.branchId ||
                    action.previewStyle || action.refreshTokens || action.cssModuleStyle || 'cloudAttribute' in action || 'cloudProperty' in action) throw new Error('This image edit has no valid original approval.');
                const pin = freezeCloudImageApproval(edit.pin), diff = action.diffs[0]!;
                const branch = this.editorEngine.branches.getBranchDataById(pin.branchId), source = branch?.sandbox.cloudSource;
                const codeEditor = sourceContext?.codeEditor ?? branch?.codeEditor;
                if (!branch || !source || !codeEditor || !isCloudEditorRuntime(branch.branch.runtime) || diff.path !== pin.path ||
                    (sourceContext && sourceContext.branchId !== pin.branchId) || branch.codeEditor !== codeEditor) throw new Error('The image source is no longer available.');
                const externalRevision = source.getExternalRevision(), mode = source.isContentMode;
                const revision = source.state.savedRevision;
                const ownerCurrent = () => (sourceContext?.current?.() ?? true) && !this.editorEngine.isClosing &&
                    this.editorEngine.branches.hasActiveBranch && this.editorEngine.branches.activeBranchData === branch &&
                    this.editorEngine.branches.getBranchDataById(pin.branchId) === branch && branch.sandbox.cloudSource === source &&
                    branch.codeEditor === codeEditor && source.isContentMode === mode && source.getExternalRevision() === externalRevision &&
                    source.state.savedRevision === revision;
                const previous = readContentImageTarget(diff.original, pin.binding.target), value = readContentImageTarget(diff.generated, pin.binding.target);
                const other = edit.field === 'src' ? 'alt' : 'src';
                if (value[other] !== previous[other] || replaceContentImageTarget(diff.original, pin.binding.target, previous, value) !== diff.generated)
                    throw new Error('The image edit changes unapproved source.');
                // Acquire before this write enters the queue, so pending-work admission
                // still rejects unrelated writes without rejecting this write itself.
                const saved = await source.withApprovedImageWrite({ pin, field: edit.field, revision, previous, current: ownerCurrent }, lease =>
                    this.enqueueWrite(async () => {
                        const current = () => ownerCurrent() && lease.current() && this.editorEngine.branches.getBranchDataById(pin.branchId) === branch &&
                            branch.sandbox.cloudSource === source && branch.codeEditor === codeEditor && source.isContentMode === mode &&
                            source.getExternalRevision() === externalRevision && source.state.savedRevision === revision;
                        if (!current() || await codeEditor.readFile(pin.path) !== diff.original || !current()) return false;
                        return lease.commit(diff.generated);
                    }));
                if (!saved) throw new Error('The approved image could not be saved.');
                return true;
            }
            if (action.type === 'edit-text' && 'cloudText' in action) {
                if (!validCloudTextApproval(action.cloudText) || action.textSlots !== undefined || action.targets.length === 0)
                    throw new Error('This text edit has no valid original approval.');
                const pin = freezeCloudTextApproval(action.cloudText);
                const originalContent = action.originalContent, newContent = action.newContent;
                if (action.targets.some(target => target.branchId !== pin.branchId || target.oid !== cloudTextRenderer(pin).oid))
                    throw new Error('The text edit belongs to another source target.');
                const branches = this.editorEngine.branches;
                const branch = branches.getBranchDataById(pin.branchId);
                const source = branch?.sandbox.cloudSource;
                const codeEditor = sourceContext?.codeEditor ?? branch?.codeEditor;
                if (!branch || !source || !codeEditor || !isCloudEditorRuntime(branch.branch.runtime) ||
                    (sourceContext && sourceContext.branchId !== pin.branchId) || branch.codeEditor !== codeEditor)
                    throw new Error('The approved text source is no longer available.');
                const revision = source.state.savedRevision;
                const version = source.getSourceVersion(), externalRevision = source.getExternalRevision();
                const current = () => (sourceContext?.current?.() ?? true) && !this.editorEngine.isClosing &&
                    branches.hasActiveBranch && branches.activeBranchData === branch && branches.getBranchDataById(pin.branchId) === branch &&
                    branch.sandbox.cloudSource === source && branch.codeEditor === codeEditor &&
                    source.getExternalRevision() === externalRevision && source.getSourceVersion() === version &&
                    source.state.savedRevision === revision && source.canWrite && !source.state.localDraftChanges && source.isTextApprovalCurrent(pin);
                await this.enqueueWrite(async () => {
                    if (!current()) throw new Error('The original text approval changed.');
                    const metadata = await codeEditor.getJsxElementMetadata(cloudTextRenderer(pin).oid);
                    if (!current()) throw new Error('The approved text source changed.');
                    const original = await codeEditor.readFile(pin.path);
                    if (!current() || metadata?.path.replace(/^\/+/, '') !== cloudTextRenderer(pin).path || typeof original !== 'string')
                        throw new Error('The approved text source changed.');
                    const candidate = replaceContentTextTarget(original, pin.target, originalContent, newContent);
                    if (candidate === original) return;
                    const saved = await source.withApprovedTextWrite({ pin, revision, candidate }, async () => {
                        if (!current()) return false;
                        await codeEditor.writeCloudTextFile(pin.path, candidate, original);
                        return true;
                    });
                    if (!saved) throw new Error('The approved text could not be saved.');
                });
                return true;
            }
            if (action.type === 'edit-text' && action.targets.some(target => {
                const source = this.editorEngine.branches.getBranchDataById(target.branchId)?.sandbox.cloudSource;
                return source?.isContentMode && source.state.profile !== 'starter-v1';
            })) throw new Error('Imported text edits require their original approval.');
            if (action.type === 'update-style' && this.editorEngine.framework === 'static-html') {
                throw new Error('Visual style editing of static HTML requires a CSS source writer. No project file was changed.');
            }
            if (action.type === 'update-style' && action.targets.some((target) =>
                this.editorEngine.branches.getStyleWriterForBranch(target.branchId) === 'none')) {
                throw new Error('Visual style editing requires a wired Tailwind v4 App Router stylesheet. No project file was changed.');
            }
            if (action.type === 'update-style' && hasUnsupportedResponsiveStyleValue(
                action.targets, this.editorEngine.frames?.getAll() ?? [])) {
                throw new Error('Breakpoint font stacks are not supported yet. No project file was changed.');
            }
            // TODO: This is a hack to write code, we should refactor this
            if (action.type === 'write-code') {
                // Capture both branch and filesystem before entering the queue.
                // Switching projects while an earlier save runs cannot redirect
                // this save or its Undo/Redo to the newly active project.
                const branchId = action.branchId ?? sourceContext?.branchId ?? this.editorEngine.branches.activeBranch.id;
                const branchData = this.editorEngine.branches.getBranchDataById(branchId);
                if (!branchData) throw new Error('The source branch is no longer available.');
                const codeEditor = sourceContext?.codeEditor ?? branchData.codeEditor;
                if (sourceContext && sourceContext.branchId !== branchId) {
                    throw new Error('The edit belongs to a different source branch.');
                }
                if (action.diffs.length === 0) {
                    throw new Error('write-code action has no diffs');
                }
                if (
                    branchData.branch.runtime.type === 'local' &&
                    action.diffs.length > 1
                ) {
                    throw new Error('Multi-file local edits need a transaction and are unavailable');
                }
                // Apply EVERY diff using the captured source context — reverseWriteCodeAction reverses all
                // of them, so writing only diffs[0] would make the inverse
                // asymmetric (undo restores files the redo never wrote) and
                // silently drop every file after the first on a multi-diff write.
                //
                // Routed through the serialized write chain so these raw
                // writes (a) count toward `pendingWrites` for the
                // beforeunload truncation guard and (b) can't interleave
                // with an in-flight AST read-modify-write on the same files.
                // The re-parse corruption guard in `processWriteRequest`
                // deliberately does NOT apply here: write-code diffs are
                // whole-file AI-apply outputs that may target non-JSX files
                // (css, json, md, …) the JSX re-parse would falsely reject.
                await this.enqueueWrite(async () => {
                    let assertModuleSourceCurrent: (() => void) | null = null;
                    let moduleWrite: { expectedSha256: string; dependencies: Array<{ path: string; sha256: string }> } | null = null;
                    if ('cssModuleStyle' in action) {
                        const edit = action.cssModuleStyle;
                        if (!edit || action.previewStyle || action.refreshTokens || action.diffs.length !== 1 ||
                            'cloudProperty' in action || 'cloudImage' in action || action.diffs[0]?.path !== edit.cssPath ||
                            action.branchId !== branchId || branchData.codeEditor !== codeEditor) {
                            throw new Error('This component-class edit has no valid source target.');
                        }
                        this.assertCssModuleReady(branchId, true);
                        validateCssModuleStyleEdit(edit);
                        const provider = branchData.sandbox.session.provider;
                        if (!(provider instanceof NodeFsProvider)) throw new Error('The private source folder is no longer available.');
                        const sourceVersion = branchData.sandbox.getLocalSourceVersion();
                        const externalRevision = branchData.sandbox.getLocalExternalRevision();
                        const ownRevision = branchData.sandbox.getLocalOwnRevision();
                        if (sourceVersion === null || externalRevision === null || ownRevision === null) {
                            throw new Error('The private source version could not be verified.');
                        }
                        assertModuleSourceCurrent = () => {
                            this.assertCssModuleReady(branchId, true);
                            if (branchData.codeEditor !== codeEditor || branchData.sandbox.session.provider !== provider ||
                                this.editorEngine.branches.getBranchDataById(branchId) !== branchData || sourceContext?.current?.() === false ||
                                branchData.sandbox.getLocalSourceVersion() !== sourceVersion ||
                                branchData.sandbox.getLocalExternalRevision() !== externalRevision ||
                                branchData.sandbox.getLocalOwnRevision() !== ownRevision) {
                                throw new Error('The source changed before this edit could be saved. Your draft has been kept.');
                            }
                        };
                        const diff = action.diffs[0]!;
                        // This read dependency is checked on DISK inside the final
                        // write queue on initial save and every history replay.
                        const [diskSource, diskCss, mirrorSource] = await Promise.all([
                            provider.readFileWithHash(edit.sourcePath), provider.readFileWithHash(edit.cssPath), codeEditor.readFile(edit.sourcePath),
                        ]);
                        if (diskSource.content !== edit.source || mirrorSource !== edit.source || diskCss.content !== diff.original ||
                            replaceCssModuleDeclaration(diff.original, edit.className, edit.property, edit.previousValue, edit.value) !== diff.generated) {
                            throw new Error('The component or stylesheet changed. Your draft has been kept.');
                        }
                        moduleWrite = { expectedSha256: diskCss.sha256,
                            dependencies: [{ path: edit.sourcePath, sha256: diskSource.sha256 }] };
                        this.assertCssModuleReady(branchId, true);
                        if (branchData.codeEditor !== codeEditor || branchData.sandbox.session.provider !== provider ||
                            this.editorEngine.branches.getBranchDataById(branchId) !== branchData || sourceContext?.current?.() === false) {
                            throw new Error('The source session changed before this edit could be saved.');
                        }
                    }
                    // Check EVERY expected original before touching ANY file.
                    // The same path runs for initial saves, Undo and Redo.
                    for (const diff of action.diffs) {
                        const current = await codeEditor.readFile(diff.path);
                        if (current !== diff.original) {
                            throw new Error(`File changed on disk: ${diff.path}. Reload before retrying this edit.`);
                        }
                    }
                    const durableCloud = isCloudEditorRuntime(branchData.branch.runtime);
                    if (durableCloud) await codeEditor.writeFiles(action.diffs.map(diff => ({ path: diff.path, content: diff.generated })));
                    for (const diff of action.diffs) {
                        if (!durableCloud) {
                            assertModuleSourceCurrent?.();
                            if (moduleWrite) await codeEditor.writeFileIfUnchangedWithDependencies(diff.path, diff.generated,
                                moduleWrite.expectedSha256, moduleWrite.dependencies);
                            else await codeEditor.writeFile(diff.path, diff.generated);
                        }
                        // Cloud writers may format/instrument source. The
                        // next replay must compare with what actually landed.
                        const saved = await codeEditor.readFile(diff.path);
                        if (typeof saved === 'string') diff.generated = saved;
                    }
                });
                if (action.refreshTokens && this.editorEngine.branches.activeBranch.id === branchId) {
                    await this.editorEngine.tokens.scan();
                }
                if (action.cssModuleStyle) this.refreshCssModulePreview(branchId);
            } else if (
                action.type === 'add-interaction' ||
                action.type === 'update-interaction' ||
                action.type === 'remove-interaction'
            ) {
                await this.editorEngine.interactions.applyHistoryAction(action);
            } else {
                const branchIds = 'parent' in action ? [action.parent.branchId]
                    : 'targets' in action ? action.targets.map((target) => target.branchId) : [];
                const editors = new Map<string, CodeFileSystem>();
                for (const branchId of branchIds) {
                    const branchData = this.editorEngine.branches.getBranchDataById(branchId);
                    if (!branchData) throw new Error('The source branch is no longer available.');
                    editors.set(branchId, branchData.codeEditor);
                }
                await this.enqueueWrite(async () => {
                    const requests = await this.collectRequests(action, editors);
                    await this.processWriteRequest(requests, editors);
                });
            }
            return true;
        } catch (error) {
            console.error('Error writing requests:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            // Stable id: rapid repeat failures (e.g. arrow-key nudges while the
            // sandbox is broken) update one toast instead of stacking dozens.
            toast.error("Couldn't save this edit", {
                id: 'code-write-error',
                description: message,
                action: message.includes('File changed on disk:') && typeof window !== 'undefined'
                    ? { label: 'Reload from disk', onClick: () => window.location.reload() }
                    : undefined,
            });
            this.editorEngine.branches.activeError.addCodeApplicationError(
                message,
                action,
            );
            return false;
        }
    }

    // Serializes source writes. Every write is a read-modify-write (read file →
    // parse → transform AST → regenerate → write file). The immediate write
    // (`code.write`) and the debounced responsive write (`writeResponsiveStyle`)
    // — plus undo/redo — all target the same files with no shared lock, so on a
    // rapid slider drag they interleave: a later write reads stale content and
    // clobbers an earlier one, or two regenerations race and leave the file
    // syntactically broken ("No ast found for file" on the next parse). Chaining
    // them guarantees each completes before the next reads.
    private writeChain: Promise<void> = Promise.resolve();

    async writeRequest(requests: CodeDiffRequest[]): Promise<void> {
        const editors = new Map<string, CodeFileSystem>();
        for (const request of requests) {
            const data = this.editorEngine.branches.getBranchDataById(request.branchId);
            if (!data) throw new Error('The source branch is no longer available.');
            editors.set(request.branchId, data.codeEditor);
        }
        return this.enqueueWrite(() => this.processWriteRequest(requests, editors));
    }

    /** Record an exact single-file source change through the normal Undo stack. */
    async saveSourceDiffs(
        branchId: string,
        diffs: CodeDiff[],
        refreshTokens = false,
        capturedEditor?: CodeFileSystem,
        previewStyle?: UpdateStyleAction,
        cssModuleStyle?: CssModuleStyleEdit,
        sourceCurrent?: () => boolean,
    ): Promise<void> {
        const branchData = this.editorEngine.branches.getBranchDataById(branchId);
        if (!branchData) throw new Error('The source branch is no longer available.');
        const codeEditor = capturedEditor ?? branchData.codeEditor;
        if (!previewStyle && diffs.every((diff) => diff.original === diff.generated)) return;
        const action: Action = { type: 'write-code', branchId, diffs, refreshTokens, previewStyle,
            ...(cssModuleStyle ? { cssModuleStyle } : {}) };
        const saved = await branchData.history.pushImmediate(action, (entry) =>
            this.write(entry, { branchId, codeEditor, current: sourceCurrent }));
        if (!saved) throw new Error('The edit could not be saved. Your source was not changed.');
        if (previewStyle) await this.editorEngine.action.applySourcePreview(previewStyle);
    }

    private assertCssModuleReady(branchId: string, insideWrite = false): void {
        const branch = this.editorEngine.branches.getBranchDataById(branchId);
        if (!branch || branch.branch.runtime.type !== 'local' || this.editorEngine.framework && this.editorEngine.framework !== 'nextjs' ||
            !this.editorEngine.canUseDesign || this.editorEngine.isClosing || !this.editorEngine.branches.hasActiveBranch ||
            this.editorEngine.branches.activeBranchData !== branch || branch.history.isPreparingForDisposal ||
            branch.history.isTransactionOpen || this.editorEngine.text.hasPendingWork ||
            this.editorEngine.action.hasPendingStylePreflights || this.editorEngine.action.hasPendingRebases ||
            this.pendingWrites > (insideWrite ? 1 : 0)) {
            throw new Error('Finish the current edit before changing this component class.');
        }
    }

    async inspectCssModuleStyle(selection: Pick<DomElement, 'branchId' | 'oid' | 'frameId' | 'domId'>): Promise<CssModuleStyleInspection> {
        this.assertCssModuleReady(selection.branchId);
        if (!selection.oid || this.editorEngine.style.mode !== 'root') throw new Error('Select the component source to edit its shared class.');
        const branch = this.editorEngine.branches.getBranchDataById(selection.branchId)!;
        const codeEditor = branch.codeEditor;
        const provider = branch.sandbox.session.provider;
        if (!(provider instanceof NodeFsProvider)) throw new Error('A private local source folder is required.');
        const owner = { branch, codeEditor, provider, version: branch.sandbox.getLocalSourceVersion() };
        const assertOwner = () => {
            this.assertCssModuleReady(selection.branchId);
            if (this.editorEngine.branches.getBranchDataById(selection.branchId) !== branch ||
                branch.codeEditor !== codeEditor || branch.sandbox.session.provider !== provider ||
                branch.sandbox.getLocalSourceVersion() !== owner.version)
                throw new Error('The source session changed. Review the component class again.');
        };
        const metadata = await codeEditor.getJsxElementMetadata(selection.oid);
        assertOwner();
        if (!metadata) throw new Error('The selected source is unavailable.');
        // CodeFS indexes project-root paths as /src/…, while native reads and
        // persisted dependency pins must stay relative to the private folder.
        const sourcePath = metadata.path.startsWith('/') ? metadata.path.slice(1) : metadata.path;
        const source = await codeEditor.readFile(sourcePath);
        assertOwner();
        if (typeof source !== 'string') throw new Error('The selected source is unavailable.');
        const properties: Partial<Record<CssModuleProperty, string>> = {};
        let target: { cssPath: string; className: string } | null = null;
        let css = '';
        for (const property of CSS_MODULE_PROPERTIES) {
            try {
                const binding = resolveCssModuleBinding(sourcePath, source, selection.oid, property);
                const content = await codeEditor.readFile(binding.cssPath);
                if (typeof content !== 'string') continue;
                properties[property] = readCssModuleDeclaration(content, binding.className, property);
                target = binding;
                css = content;
            } catch { /* Unsupported declarations are unavailable, never approximated. */ }
        }
        this.assertCssModuleReady(selection.branchId);
        if (!target || branch.codeEditor !== codeEditor || this.editorEngine.branches.getBranchDataById(selection.branchId) !== branch) {
            throw new Error('This element has no supported component-class declarations.');
        }
        assertOwner();
        const inspection = { ...selection, oid: selection.oid, sourcePath, source, ...target, css, properties };
        this.cssModuleInspectionOwners.set(inspection, owner);
        return inspection;
    }

    async applyCssModuleStyle(inspection: CssModuleStyleInspection, property: CssModuleProperty, value: string): Promise<'saved' | 'saved-refresh-pending'> {
        if (this.moduleApplyPending) throw new Error('This component class is still saving.');
        this.assertCssModuleReady(inspection.branchId);
        const owner = this.cssModuleInspectionOwners.get(inspection);
        const branch = this.editorEngine.branches.getBranchDataById(inspection.branchId);
        if (!owner || branch !== owner.branch || branch.codeEditor !== owner.codeEditor ||
            branch.sandbox.session.provider !== owner.provider || branch.sandbox.getLocalSourceVersion() !== owner.version)
            throw new Error('The source session changed. Review the component class again.');
        const selected = this.editorEngine.elements.selected;
        if (selected.length !== 1 || selected[0]?.oid !== inspection.oid || selected[0]?.branchId !== inspection.branchId ||
            selected[0]?.frameId !== inspection.frameId || selected[0]?.domId !== inspection.domId || this.editorEngine.style.mode !== 'root') {
            throw new Error('The selected source changed. Your draft has been kept.');
        }
        const previousValue = inspection.properties[property];
        if (previousValue === undefined) throw new Error('This property is unavailable for the selected class.');
        const edit: CssModuleStyleEdit = { version: 1, sourcePath: inspection.sourcePath, source: inspection.source, oid: inspection.oid,
            cssPath: inspection.cssPath, className: inspection.className, property, previousValue, value };
        validateCssModuleStyleEdit(edit);
        const generated = replaceCssModuleDeclaration(inspection.css, inspection.className, property, previousValue, value);
        if (generated === inspection.css) return 'saved';
        const codeEditor = this.editorEngine.branches.getBranchDataById(inspection.branchId)!.codeEditor;
        this.moduleApplyPending = true;
        const save = this.saveSourceDiffs(inspection.branchId, [{ path: inspection.cssPath, original: inspection.css, generated }], false, codeEditor, undefined, edit,
            () => this.editorEngine.branches.getBranchDataById(inspection.branchId) === owner.branch &&
                owner.branch.codeEditor === owner.codeEditor && owner.branch.sandbox.session.provider === owner.provider &&
                owner.branch.sandbox.getLocalSourceVersion() === owner.version);
        this.moduleApplyRun = save;
        try {
            await save;
            return this.cssModulePreview?.branchId === inspection.branchId && this.cssModulePreview.status === 'requested' ? 'saved' : 'saved-refresh-pending';
        } finally { this.moduleApplyPending = false; this.moduleApplyRun = null; }
    }

    /** Source CSS, rather than a per-instance override, owns the shared preview. */
    refreshCssModulePreview(branchId: string): boolean {
        this.cssModulePreview = { branchId, status: 'pending' };
        try {
            this.assertCssModuleReady(branchId);
            const frames = this.editorEngine.frames.getAll().filter(frame => frame.frame.branchId === branchId);
            if (!frames.length || frames.some(frame => !frame.view)) return false;
            this.editorEngine.frames.reloadByBranchId(branchId);
            this.cssModulePreview = { branchId, status: 'requested' };
            return true;
        } catch {
            this.cssModulePreview = { branchId, status: 'failed' };
            return false;
        }
    }

    async resetResponsiveStyle(previewStyle: UpdateStyleAction): Promise<void> {
        const target = previewStyle.targets[0];
        if (!target?.oid) throw new Error('The element source could not be identified.');
        const branchData = this.editorEngine.branches.getBranchDataById(target.branchId);
        if (!branchData) throw new Error('The source branch is no longer available.');
        const codeEditor = branchData.codeEditor;
        await branchData.history.commitTransaction();
        await branchData.history.waitForCommit();
        const requests = new Map<string, CodeDiffRequest>();
        const request = await getOrCreateCodeDiffRequest(target.oid, target.branchId, requests);
        const prefixes = await readProjectBreakpoints((path) => codeEditor.readFile(path));
        const prefix = this.responsivePrefixFor(target.branchId, target.breakpoint?.minWidth, prefixes);
        const width = target.breakpoint?.minWidth ?? 0;
        const equivalentPrefixes = new Set([prefix]);
        if (width > 0) {
            equivalentPrefixes.add(tailwindPrefixForWidth(width, {}, true));
            for (const [name, minWidth] of Object.entries(prefixes)) {
                if (minWidth === width) equivalentPrefixes.add(`${name}:`);
            }
        }
        request.classRemovals = Object.entries(target.change.original).flatMap(([property, style]) =>
            getTailwindClasses(target.oid!, { [property]: style }).flatMap((probeClass) =>
                [...equivalentPrefixes].map((prefix) => ({ prefix, probeClass }))));
        request.requireClassRemoval = true;
        if (request.classRemovals.length === 0) throw new Error('This property cannot be reset safely in source yet.');
        const grouped = await this.groupRequestByFile([request], new Map([[target.branchId, codeEditor]]));
        const diffs = await processGroupedRequests(grouped);
        for (const diff of diffs) diff.original = grouped.get(diff.path)!.content;
        await this.saveSourceDiffs(target.branchId, diffs, false, codeEditor, previewStyle);
    }

    /**
     * Enqueue a write task on the serialized write chain with `pendingWrites`
     * accounting. EVERY source write must go through here: a direct
     * `fileSystem.writeFile` bypasses both the serialization (interleaved
     * read-modify-writes clobber each other) and the beforeunload truncation
     * guard (a reload mid-write can persist a truncated, unparseable file).
     */
    private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
        this.pendingWrites += 1;
        const run = this.writeChain.then(task).finally(() => {
            this.pendingWrites -= 1;
        });
        // Swallow errors on the chain itself so one failed write doesn't wedge
        // every subsequent write; the real result/rejection is returned to the
        // caller via `run`.
        this.writeChain = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private async processWriteRequest(requests: CodeDiffRequest[], editors: Map<string, CodeFileSystem>) {
        const groupedRequests = await this.groupRequestByFile(requests, editors);
        const codeDiffs = await processGroupedRequests(groupedRequests);

        // Validate EVERY diff before writing ANY file. A multi-file action
        // (multi-select edit across components) that failed validation on
        // file 2 used to leave file 1 already written — and history then
        // dropped the whole action, so the landed half was un-undoable and
        // the UI diverged from disk. All-or-nothing: reject up front.
        const validated: { codeEditor: CodeFileSystem; path: string; original: string; generated: string }[] = [];
        for (const diff of codeDiffs) {
            const fileGroup = groupedRequests.get(diff.path);
            if (!fileGroup) {
                throw new Error(`No request group found for file: ${diff.path}`);
            }

            const firstRequest = Array.from(fileGroup.oidToRequest.values())[0];
            if (!firstRequest) {
                throw new Error(`No requests found in group for file: ${diff.path}`);
            }

            const branchData = this.editorEngine.branches.getBranchDataById(firstRequest.branchId);
            if (!branchData) {
                throw new Error(`Branch not found for ID: ${firstRequest.branchId}`);
            }

            // Corruption guard: editor-action output comes from Babel
            // `generate()` and must re-parse. If it doesn't, something
            // upstream (stale snapshot, interrupted transform) produced
            // garbage — refuse to persist it. CodeFileSystem.writeFile
            // intentionally writes unparseable content for the code-mode
            // editor (devs may save WIP), so the guard must live HERE on
            // the action path, not down there. Without it a bad diff
            // overwrites the user's source with a syntactically broken
            // file and every subsequent action write fails at parse.
            {
                // Re-parse with the pipeline that produced the content —
                // HTML output is valid parse5 but not valid JSX.
                const pipeline = selectPipeline(diff.path);
                const reparses =
                    pipeline && pipeline.id !== 'jsx'
                        ? pipeline.parse(diff.generated) !== null
                        : getAstFromContent(diff.generated) !== null;
                if (!reparses) {
                    throw new Error(
                        `Refusing to write ${diff.path}: generated content does not parse. The edit was not saved — your source files are untouched.`,
                    );
                }
            }

            validated.push({
                codeEditor: editors.get(firstRequest.branchId) ?? branchData.codeEditor,
                path: diff.path,
                original: fileGroup.content,
                generated: diff.generated,
            });
        }

        if (
            validated.length > 1 &&
            requests.some(
                (request) =>
                    this.editorEngine.branches.getBranchById(request.branchId)?.runtime.type ===
                    'local',
            )
        ) {
            throw new Error('Multi-file local edits need a transaction and are unavailable');
        }
        for (const { codeEditor, path, original } of validated) {
            if (await codeEditor.readFile(path) !== original) {
                throw new Error(`File changed on disk: ${path}. Reload before retrying this edit.`);
            }
        }
        const cloudBranches = new Set(requests.filter(request => isCloudEditorRuntime(this.editorEngine.branches.getBranchById(request.branchId)?.runtime)).map(request => request.branchId));
        if (cloudBranches.size) {
            const destinations = new Set(validated.map(diff => diff.codeEditor));
            if (destinations.size !== 1) throw new Error('An edit across cloud branches cannot be saved atomically.');
            const destination = validated[0]?.codeEditor;
            if (destination) await destination.writeFiles(validated.map(diff => ({ path: diff.path, content: diff.generated })));
        } else {
            for (const { codeEditor, path, generated } of validated) await codeEditor.writeFile(path, generated);
        }
    }

    private async collectRequests(action: Action, editors?: Map<string, CodeFileSystem>): Promise<CodeDiffRequest[]> {
        switch (action.type) {
            case 'update-style':
                const prefixes = new Map<string, Record<string, number>>();
                for (const branchId of new Set(action.targets.map((target) => target.branchId))) {
                    const editor = editors?.get(branchId) ?? this.editorEngine.branches.getBranchDataById(branchId)?.codeEditor;
                    if (!editor) throw new Error('The source branch is no longer available.');
                    prefixes.set(branchId, await readProjectBreakpoints((path) => editor.readFile(path)));
                }
                return await getStyleRequests(action, (target) =>
                    this.responsivePrefixFor(target.branchId, target.breakpoint?.minWidth, prefixes.get(target.branchId)));
            case 'insert-element':
                return await getInsertRequests(action);
            case 'move-element':
                return await getMoveRequests(action);
            case 'remove-element':
                return await getRemoveRequests(action);
            case 'edit-text':
                return await getEditTextRequests(action);
            case 'group-elements':
                return await getGroupRequests(action);
            case 'ungroup-elements':
                return await getUngroupRequests(action);
            case 'insert-image':
                return getInsertImageRequests(action);
            case 'remove-image':
                return getRemoveImageRequests(action);
            case 'write-code':
                return await getWriteCodeRequests(action);
            case 'add-interaction':
            case 'update-interaction':
            case 'remove-interaction':
                // Interaction writes are handled by InteractionsManager via a
                // dedicated CodeManager path (Phase D). They produce no
                // standard CodeDiffRequest entries.
                return [];
            default:
                assertNever(action);
        }
    }

    async groupRequestByFile(requests: CodeDiffRequest[], editors?: Map<string, CodeFileSystem>): Promise<FileToRequests> {
        const requestByFile: FileToRequests = new Map();

        for (const request of requests) {
            const branchData = this.editorEngine.branches.getBranchDataById(request.branchId);
            const codeEditor = editors?.get(request.branchId) ?? branchData?.codeEditor;
            if (!codeEditor) throw new Error('The source branch is no longer available.');

            const metadata = await codeEditor.getJsxElementMetadata(request.oid);
            if (!metadata) {
                throw new Error(`Metadata not found for oid: ${request.oid}`);
            }
            const fileContent = await codeEditor.readFile(metadata.path);
            if (fileContent instanceof Uint8Array) {
                throw new Error(`File is binary: ${metadata.path}`);
            }
            const path = metadata.path;

            let groupedRequest = requestByFile.get(path);
            groupedRequest ??= { oidToRequest: new Map(), content: fileContent };
            groupedRequest.oidToRequest.set(request.oid, request);
            requestByFile.set(path, groupedRequest);
        }
        return requestByFile;
    }

    /**
     * Persist a responsive style override to source for one `(oid, property)`.
     *
     * `valuesByBreakpoint` is keyed by the user's stable breakpoint id. We
     * resolve each id's `minWidth` from the FramesManager, rebase to mobile-
     * first, and let the existing tailwind/CodeDiffRequest pipeline write the
     * resulting className tokens (`p-4 md:p-2 lg:p-6`) into the JSX source.
     *
     * Static HTML has no Tailwind build step, so reject that path until a
     * CSS source writer can persist its breakpoint rules.
     *
     * The ActionManager owns one cancellable debounce per `(oid, property)`.
     */
    writeResponsiveStyleNow(args: {
        branchId?: string;
        oid: string;
        property: string;
        valuesByBreakpoint: Partial<Record<BreakpointId, string>>;
        removedByBreakpoint?: Partial<Record<BreakpointId, string>>;
        getHistoryLease?: () => HistoryDisposalLease | undefined;
    }): Promise<'applied' | 'no-source'> {
        if (this.editorEngine.framework === 'static-html') {
            return Promise.reject(new Error('Responsive style editing of static HTML requires a CSS source writer.'));
        }
        return this.undebouncedWriteResponsiveStyle(args);
    }

    private async undebouncedWriteResponsiveStyle({
        branchId = this.editorEngine.branches.activeBranch.id,
        oid,
        property,
        valuesByBreakpoint,
        removedByBreakpoint = {},
        getHistoryLease,
    }: {
        branchId?: string;
        oid: string;
        property: string;
        valuesByBreakpoint: Partial<Record<BreakpointId, string>>;
        removedByBreakpoint?: Partial<Record<BreakpointId, string>>;
        getHistoryLease?: () => HistoryDisposalLease | undefined;
    }): Promise<'applied' | 'no-source'> {
        // Resolve breakpoint widths (and active branch) from the canvas.
        const branchData = this.editorEngine.branches.getBranchDataById(branchId);
        if (!branchData) throw new Error('The source branch is no longer available.');
        const codeEditor = branchData.codeEditor;
        const allFrames = this.editorEngine.frames.getAll().filter((frame) => frame.frame.branchId === branchId);
        if (allFrames.length === 0) return 'no-source';

        const widthById = new Map<string, number>();
        const branchIdForOid = branchId;
        for (const f of allFrames) {
            const id = f.frame.breakpoint?.id;
            if (!id) continue;
            if (!widthById.has(id)) widthById.set(id, f.frame.breakpoint.width);
        }
        if (this.editorEngine.branches.getStyleWriterForBranch(branchIdForOid) === 'none') {
            throw new Error('Responsive style editing requires a wired Tailwind v4 App Router stylesheet.');
        }

        // The smallest frame is the unprefixed base, matching the main style
        // write (see responsivePrefixFor). Its width maps to 0 for the rebase.
        const base = this.baseFrameWidth(branchIdForOid);
        const rebaseWidth = (width: number) => breakpointMinWidth(width, base);
        const entries: BreakpointEntry[] = [];
        for (const [id, value] of Object.entries(valuesByBreakpoint)) {
            if (value === undefined) continue;
            // Skip ids that don't map to a frame breakpoint, but keep
            // ids whose width is legitimately 0 (mobile-first base).
            const minWidth = widthById.get(id);
            if (minWidth === undefined) continue;
            entries.push({ id, minWidth: rebaseWidth(minWidth), value });
        }
        const removals: BreakpointEntry[] = [];
        for (const [id, value] of Object.entries(removedByBreakpoint)) {
            if (value === undefined) continue;
            const minWidth = widthById.get(id);
            if (minWidth === undefined) continue;
            removals.push({ id, minWidth: rebaseWidth(minWidth), value });
        }
        if (entries.length === 0 && removals.length === 0) return 'no-source';

        const requests = new Map<string, CodeDiffRequest>();
        const request = await getOrCreateCodeDiffRequest(oid, branchIdForOid, requests);
        const prefixes = await readProjectBreakpoints((path) => codeEditor.readFile(path));
        addResponsiveTailwindToRequest(request, property, entries, removals, {
            tailwindPrefixes: prefixes, exactThresholds: true,
        });

        try {
            await this.enqueueWrite(() => this.processWriteRequest(Array.from(requests.values()), new Map([[branchId, codeEditor]])));
            await branchData.history.noteOwnSourceWrite(getHistoryLease?.());
            return 'applied';
        } catch (error) {
            console.error('writeResponsiveStyle failed', { oid, property, error });
            toast.error("Couldn't save the responsive style", {
                id: 'code-write-error',
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /** Smallest frame width in the branch; edits there are the unprefixed base. */
    private baseFrameWidth(branchId: string): number | null {
        const widths = (this.editorEngine.frames?.getAll() ?? [])
            .filter((f) => f.frame.branchId === branchId)
            .map((f) => f.frame.breakpoint?.width)
            .filter((width): width is number => width !== undefined);
        return widths.length > 0 ? Math.min(...widths) : null;
    }

    /** Tailwind prefix matching the preview's `@media (min-width)` scope. */
    private responsivePrefixFor(_branchId: string, minWidth: number | undefined, prefixes: Record<string, number> = {}): string {
        if (minWidth === undefined) return '';
        return tailwindPrefixForWidth(minWidth, prefixes, true);
    }

    /** Validate the whole selection before any optimistic paint or binding update. */
    async preflightStyleAction(action: UpdateStyleAction): Promise<void> {
        if (new Set(action.targets.map((target) => target.branchId)).size > 1) {
            throw new Error('A style edit must belong to one source branch.');
        }
        const targets = new Map<string, { oid: string; codeEditor: CodeFileSystem }>();
        for (const target of action.targets) {
            if (!target.oid) throw new Error('The selected element has no editable source.');
            const branch = this.editorEngine.branches.getBranchDataById(target.branchId);
            if (!branch) throw new Error('The source branch is no longer available.');
            targets.set(`${target.branchId}:${target.oid}`, { oid: target.oid, codeEditor: branch.codeEditor });
        }
        if (targets.size === 0) throw new Error('No editable source was selected.');
        for (const { oid, codeEditor } of targets.values()) {
            const metadata = await codeEditor.getJsxElementMetadata(oid);
            const node = metadata && getAstFromCodeblock(metadata.code);
            if (!node) throw new Error('The selected source could not be checked safely.');
            assertStaticClassName(node);
        }
    }

    /** Normalize preview scope once, before this action enters history. */
    prepareStyleAction(action: UpdateStyleAction): UpdateStyleAction {
        return { ...action, targets: action.targets.map((target) => ({
            ...target,
            ...(target.breakpoint ? { breakpoint: {
                ...target.breakpoint,
                minWidth: breakpointMinWidth(target.breakpoint.minWidth, this.baseFrameWidth(target.branchId)),
            } } : {}),
        })) };
    }

    clear() {
        this.detachBeforeUnload();
    }

    async updateElementMetadata(update: ElementMetadataUpdate): Promise<void> {
        await this.updateElementsMetadata([update]);
    }

    /** Validate a selection together so one dynamic element cannot leave a partial binding. */
    async updateElementsMetadata(updates: ElementMetadataUpdate[]): Promise<void> {
        const branchId = updates[0]?.branchId;
        if (!branchId) return;
        if (updates.some((update) => update.branchId !== branchId)) {
            throw new Error('A property edit must belong to one source branch.');
        }
        const branchData = this.editorEngine.branches.getBranchDataById(branchId);
        if (!branchData) throw new Error('The source branch is no longer available.');
        const codeEditor = branchData.codeEditor;
        await branchData.history.commitTransaction();
        await branchData.history.waitForCommit();
        const requests = new Map<string, CodeDiffRequest>();
        for (const { oid, attributes, tagName = null, overrideClasses = null } of updates) {
            const request = await getOrCreateCodeDiffRequest(oid, branchId, requests);
            if (attributes) {
                request.attributes = { ...request.attributes, ...attributes };
            }
            request.tagName = tagName;
            request.overrideClasses = overrideClasses;
        }

        const grouped = await this.groupRequestByFile(Array.from(requests.values()), new Map([[branchId, codeEditor]]));
        const diffs = await processGroupedRequests(grouped);
        for (const diff of diffs) {
            const pipeline = selectPipeline(diff.path);
            const reparses = pipeline && pipeline.id !== 'jsx'
                ? pipeline.parse(diff.generated) !== null
                : getAstFromContent(diff.generated) !== null;
            if (!reparses) throw new Error('The property edit could not be saved safely.');
            const source = grouped.get(diff.path);
            if (!source) throw new Error('The property source is no longer available.');
            diff.original = source.content;
        }
        await this.saveSourceDiffs(branchId, diffs, false, codeEditor);
    }
}
