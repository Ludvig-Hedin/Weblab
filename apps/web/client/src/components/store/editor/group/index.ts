import type { DomElement } from '@weblab/models';
import type {
    ActionTarget,
    GroupContainer,
    GroupElementsAction,
    UngroupElementsAction,
} from '@weblab/models/actions';
import { createDomId, createOid } from '@weblab/utility';
import { assertGroupSelectionSafe, assertUngroupContainerSafe, getAstFromCodeblock, getOidFromJsxElement, t } from '@weblab/parser';
import { toast } from '@weblab/ui/sonner';

import type { EditorEngine } from '../engine';

export class GroupManager {
    constructor(private editorEngine: EditorEngine) {}

    async groupSelectedElements() {
        const selectedEls = this.editorEngine.elements.selected;
        const groupTarget = this.getGroupParentId(selectedEls);
        if (!groupTarget) {
            console.error('Failed to get group target');
            return;
        }
        const { frameId, parentDomId } = groupTarget;
        let groupAction: GroupElementsAction | null;
        try {
            groupAction = await this.getGroupAction(frameId, parentDomId, selectedEls);
        } catch (error) {
            toast.error('These elements cannot be grouped safely', {
                description: error instanceof Error ? error.message : 'Source could not be checked.',
            });
            return;
        }

        if (!groupAction) {
            console.error('Failed to get group action');
            return;
        }

        await this.editorEngine.action.run(groupAction);
    }

    async ungroupSelectedElement() {
        if (!this.canUngroupElement()) {
            console.error('Cannot ungroup elements');
            return;
        }

        const selectedEl = this.editorEngine.elements.selected[0];
        if (!selectedEl) {
            console.error('No selected element');
            return;
        }

        let ungroupAction: UngroupElementsAction | null;
        try {
            ungroupAction = await this.getUngroupAction(selectedEl);
        } catch (error) {
            toast.error('This element cannot be ungrouped safely', {
                description: error instanceof Error ? error.message : 'Source could not be checked.',
            });
            return;
        }
        if (!ungroupAction) {
            console.error('Failed to get ungroup action');
            return;
        }

        await this.editorEngine.action.run(ungroupAction);
    }

    getGroupParentId(
        elements: DomElement[],
        log = true,
    ): { frameId: string; parentDomId: string } | null {
        if (elements.length === 0) {
            if (log) {
                console.error('No elements to group');
            }
            return null;
        }

        const frameId = elements[0]?.frameId;
        const sameFrame = elements.every((el) => el.frameId === frameId);

        if (!sameFrame) {
            if (log) {
                console.error('Selected elements are not in the same frame');
            }
            return null;
        }

        const parentDomId = elements[0]?.parent?.domId;
        if (!parentDomId) {
            if (log) {
                console.error('No parent found');
            }
            return null;
        }

        const sameParent = elements.every((el) => el.parent?.domId === parentDomId);
        if (!sameParent) {
            if (log) {
                console.error('Selected elements are not in the same parent');
            }
            return null;
        }

        if (!frameId) {
            if (log) {
                console.error('No frame id found');
            }
            return null;
        }

        return { frameId, parentDomId };
    }

    canGroupElements() {
        return this.getGroupParentId(this.editorEngine.elements.selected, false) !== null;
    }

    canUngroupElement() {
        return this.editorEngine.elements.selected.length === 1;
    }

    async getGroupAction(
        frameId: string,
        parentDomId: string,
        selectedEls: DomElement[],
    ): Promise<GroupElementsAction | null> {
        const frame = this.editorEngine.frames.get(frameId);
        if (!frame) {
            console.error('Failed to get frame');
            return null;
        }

        const anyParent = selectedEls.find((el) => el.parent)?.parent;

        if (!anyParent) {
            console.error('Failed to find parent target');
            return null;
        }

        const parentTarget: ActionTarget = {
            frameId: frameId,
            branchId: frame.frame.branchId,
            domId: anyParent.domId,
            oid: anyParent.oid,
        };

        const children: ActionTarget[] = selectedEls.map((el) => ({
            frameId: el.frameId,
            branchId: el.branchId,
            domId: el.domId,
            oid: el.oid,
        }));
        if (!parentTarget.oid) throw new Error('The source parent could not be identified.');
        const branchData = this.editorEngine.branches.getBranchDataById(parentTarget.branchId);
        const metadata = await branchData?.codeEditor.getJsxElementMetadata(parentTarget.oid);
        const sourceParent = metadata && getAstFromCodeblock(metadata.code);
        if (!sourceParent) throw new Error('The source parent could not be checked.');
        const sourceOrder = assertGroupSelectionSafe(sourceParent, children.map((child) => child.oid))
            .map((child) => getOidFromJsxElement(child.openingElement));
        children.sort((a, b) => sourceOrder.indexOf(a.oid) - sourceOrder.indexOf(b.oid));

        const container: GroupContainer = {
            domId: createDomId(),
            oid: createOid(),
            tagName: 'div',
            attributes: {},
        };

        return {
            type: 'group-elements',
            parent: parentTarget,
            children,
            container,
        };
    }

    async getUngroupAction(selectedEl: DomElement): Promise<UngroupElementsAction | null> {
        if (!selectedEl.oid) throw new Error('The selected wrapper has no editable source.');
        const frame = this.editorEngine.frames.get(selectedEl.frameId);
        if (!frame) {
            console.error('Failed to get frame');
            return null;
        }

        if (!selectedEl.parent) {
            console.error('Failed to get parent');
            return null;
        }

        // Container is the selected element
        if (!frame.view) {
            console.error('No frame view found');
            return null;
        }

        const actionContainer = await frame.view.getActionElement(selectedEl.domId);

        if (!actionContainer) {
            console.error('Failed to get container');
            return null;
        }

        const branchData = this.editorEngine.branches.getBranchDataById(selectedEl.branchId);
        const metadata = await branchData?.codeEditor.getJsxElementMetadata(selectedEl.oid);
        const sourceCode = metadata?.code;
        const sourceContainer = sourceCode && getAstFromCodeblock(sourceCode);
        if (!sourceContainer || !sourceCode) throw new Error('The source wrapper could not be checked.');
        assertUngroupContainerSafe(sourceContainer);
        const sourceOids = sourceContainer.children.filter((child) => t.isJSXElement(child))
            .map((child) => t.isJSXElement(child) ? getOidFromJsxElement(child.openingElement) : null);
        if (sourceOids.length !== actionContainer.children.length || new Set(sourceOids).size !== sourceOids.length ||
            sourceOids.some((oid) => !oid || !actionContainer.children.some((child) => child.oid === oid))) {
            throw new Error('The rendered children do not match direct source children.');
        }

        const container: GroupContainer = {
            domId: actionContainer.domId,
            oid: actionContainer.oid,
            tagName: actionContainer.tagName,
            attributes: actionContainer.attributes,
            sourceCode,
        };

        const parent: ActionTarget = {
            frameId: selectedEl.frameId,
            branchId: selectedEl.branchId,
            domId: selectedEl.parent.domId,
            oid: selectedEl.parent.oid,
        };

        // Children to be spread where container was
        const targets: ActionTarget[] = actionContainer.children.map((child) => {
            return {
                frameId: selectedEl.frameId,
                branchId: selectedEl.branchId,
                domId: child.domId,
                oid: child.oid,
            };
        });

        return {
            type: 'ungroup-elements',
            parent,
            container,
            children: targets,
        };
    }

    clear() {}
}
