import { makeAutoObservable } from 'mobx';

import type { DomElement } from '@weblab/models';
import type {
    ActionElement,
    ActionLocation,
    ActionTarget,
    InsertElementAction,
} from '@weblab/models/actions';
import { createDomId, createOid } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import { getCleanedElement } from '../history/helpers';

export class CopyManager {
    copied: {
        element: ActionElement;
        codeBlock: string | null;
    } | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    // `clearOsClipboard` writes '' to the OS clipboard so a subsequent native
    // Cmd+V can't paste foreign text into the editor (paste isolation). The
    // in-app `duplicate()` path passes `false` so alt-drag/Cmd+D doesn't wipe
    // the user's real OS clipboard as a side effect.
    //
    // Returns `true` only when `this.copied` was actually refreshed — callers
    // like `cut()`/`duplicate()` must abort on `false` so they don't delete or
    // paste against a stale (or missing) copy.
    async copy(clearOsClipboard = true): Promise<boolean> {
        const selected = this.editorEngine.elements.selected;
        if (selected.length === 0) {
            return false;
        }
        const selectedEl = this.editorEngine.elements.selected[0];
        if (!selectedEl) {
            console.error('Failed to copy element');
            return false;
        }
        const frameId = selectedEl.frameId;
        const frameData = this.editorEngine.frames.get(frameId);
        if (!frameData) {
            console.error('Failed to get frameView');
            return false;
        }

        if (!frameData.view) {
            console.error('No frame view found');
            return false;
        }

        const targetEl: ActionElement | null = await frameData.view.getActionElement(
            selectedEl.domId,
        );

        if (!targetEl) {
            console.error('Failed to copy element');
            return false;
        }
        if (!selectedEl.oid) {
            console.error('Failed to copy element');
            return false;
        }

        const branchData = this.editorEngine.branches.getBranchDataById(selectedEl.branchId);
        if (!branchData) {
            console.error(`Branch data not found for branchId: ${selectedEl.branchId}`);
            return false;
        }

        const metadata = await branchData.codeEditor.getJsxElementMetadata(selectedEl.oid);
        this.copied = { element: targetEl, codeBlock: metadata?.code || null };
        if (clearOsClipboard) await this.clearClipboard();
        return true;
    }

    async clearClipboard() {
        try {
            await navigator.clipboard.writeText('');
        } catch (error) {
            console.warn('Failed to clear clipboard:', error);
        }
    }

    async paste() {
        const selected = this.editorEngine.elements.selected;
        if (selected.length === 0) {
            return;
        }

        if (!this.copied) {
            console.warn('Nothing to paste');
            return;
        }

        const selectedEl = this.editorEngine.elements.selected[0];

        if (!selectedEl) {
            console.error('Failed to paste element');
            return;
        }

        // Mirror copy()'s `!oid` guard: an element with no oid can't anchor a
        // valid insert. Bail on the primary and drop any oid-less targets so the
        // InsertElementAction never receives a malformed (null-oid) target.
        if (!selectedEl.oid) {
            console.error('Failed to paste: selected element has no oid');
            return;
        }

        const targets: Array<ActionTarget> = this.editorEngine.elements.selected
            .filter((el) => el.oid)
            .map((selectedEl) => {
                const target: ActionTarget = {
                    frameId: selectedEl.frameId,
                    branchId: selectedEl.branchId,
                    domId: selectedEl.domId,
                    oid: selectedEl.oid,
                };
                return target;
            });

        const location = await this.getInsertLocation(selectedEl);
        if (!location) {
            console.error('Failed to get insert location');
            return;
        }

        const newOid = createOid();
        const newDomId = createDomId();

        const action: InsertElementAction = {
            type: 'insert-element',
            targets: targets,
            element: getCleanedElement(this.copied.element, newDomId, newOid),
            location,
            editText: null,
            pasteParams: {
                oid: newOid,
                domId: newDomId,
            },
            codeBlock: this.copied.codeBlock,
        };

        await this.editorEngine.action.run(action);
    }

    async cut(): Promise<boolean> {
        const copied = await this.copy();
        if (!copied) {
            // Nothing was captured — deleting now would destroy the element
            // with no way to paste it back.
            return false;
        }
        await this.editorEngine.elements.delete();
        return true;
    }

    async duplicate() {
        const savedCopied = this.copied;
        // Don't wipe the user's OS clipboard for an in-app duplicate.
        const copied = await this.copy(false);
        if (!copied) {
            // copy() failed and left `this.copied` untouched — pasting now
            // would duplicate a stale earlier copy instead of the selection.
            this.copied = savedCopied;
            return;
        }
        await this.paste();
        this.copied = savedCopied;
    }

    async getInsertLocation(selectedEl: DomElement): Promise<ActionLocation | undefined> {
        const frameId = selectedEl.frameId;
        const frameData = this.editorEngine.frames.get(frameId);
        if (!frameData?.view) {
            console.error('Failed to get frameView');
            return;
        }

        const insertAsSibling =
            selectedEl.tagName === 'img' ||
            selectedEl.domId === this.copied?.element.domId ||
            selectedEl.oid === this.copied?.element.oid;

        if (insertAsSibling) {
            const location: ActionLocation | null = await frameData.view.getActionLocation(
                selectedEl.domId,
            );
            if (!location) {
                console.error('Failed to get location');
                return;
            }
            // Insert as sibling after the selected element
            if (location.type === 'index') {
                location.index += 1;
            }
            return location;
        } else {
            return {
                type: 'append',
                targetDomId: selectedEl.domId,
                targetOid: selectedEl.instanceId ?? selectedEl.oid,
            };
        }
    }

    clear() {
        this.copied = null;
    }
}
