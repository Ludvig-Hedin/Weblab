'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { Interaction, TriggerKind } from '@weblab/models';
import { Accordion } from '@weblab/ui/accordion';
import { ScrollArea } from '@weblab/ui/scroll-area';

import { useEditorEngine } from '@/components/store/editor';
import { ElementHeaderSection } from '../style-tab-v2/sections/element-header';
import { NoSelectionEmptyState } from './empty-states/no-selection';
import { makeInteraction } from './factories';
import { useInteractionsSectionState } from './hooks/use-section-state';
import { ElementTriggerSection } from './sections/element-trigger-section';
import { PageTriggerSection } from './sections/page-trigger-section';

const DEFAULT_OPEN_SECTIONS = ['element-trigger'] as const;

interface ListViewProps {
    onOpenInteraction: (id: string) => void;
}

export const ListView = observer(function ListView({ onOpenInteraction }: ListViewProps) {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const { open, setOpen } = useInteractionsSectionState(DEFAULT_OPEN_SECTIONS);

    const allInteractions = editorEngine.interactions.interactions;
    const pageInteractions: Interaction[] = allInteractions.filter(
        (ix) => ix.trigger.kind === 'page-load',
    );

    // Async resolve the selected element's ix-id by reading the per-oid
    // metadata index. The attribute is stamped lazily by ensureIxIdForOid
    // when the user first attaches an interaction, so it may be absent until
    // they pick a trigger; we surface element interactions only once we know
    // the id. The effect depends on selected.oid + branchId, so re-selection
    // re-resolves correctly.
    const [selectedIxId, setSelectedIxId] = useState<string | null>(null);
    const selectedOid = selected?.oid ?? null;
    const selectedBranchId = selected?.branchId ?? null;
    useEffect(() => {
        let cancelled = false;
        // Clear stale state immediately so a quick selection swap can't render
        // the previous element's interactions while the new metadata loads.
        setSelectedIxId(null);
        if (!selectedOid || !selectedBranchId) {
            return () => {
                cancelled = true;
            };
        }
        const branchData = editorEngine.branches.getBranchDataById(selectedBranchId);
        const codeEditor = branchData?.codeEditor;
        if (!codeEditor) {
            return () => {
                cancelled = true;
            };
        }
        void codeEditor.getJsxElementMetadata(selectedOid).then((meta) => {
            if (cancelled) return;
            setSelectedIxId(meta?.ixId ?? null);
        });
        return () => {
            cancelled = true;
        };
        // `allInteractions.length` is included so that after ensureIxIdForOid
        // stamps a fresh ixId on the selected element (which appends to
        // allInteractions), the metadata is re-resolved and the new id shows
        // up immediately. The reset at the top of the effect guards against
        // a stale ixId leaking across selections.
    }, [editorEngine, selectedOid, selectedBranchId, allInteractions.length]);

    const elementInteractions: Interaction[] = selectedIxId
        ? allInteractions.filter(
              (ix) => ix.trigger.kind !== 'page-load' && ix.trigger.sourceIxId === selectedIxId,
          )
        : [];

    const addElementTrigger = async (kind: TriggerKind) => {
        if (!selected?.oid) return;
        const ixId = await editorEngine.interactions.ensureIxIdForOid(
            selected.oid,
            selected.branchId,
        );
        if (!ixId) return;
        const interaction = makeInteraction({
            triggerKind: kind,
            sourceIxId: ixId,
        });
        await editorEngine.interactions.addInteraction(interaction, selected.branchId);
        onOpenInteraction(interaction.id);
    };

    const addPageTrigger = async (kind: TriggerKind) => {
        const branchId = editorEngine.branches.activeBranch?.id;
        if (!branchId) return;
        const interaction = makeInteraction({
            triggerKind: kind,
            sourceIxId: null,
        });
        await editorEngine.interactions.addInteraction(interaction, branchId);
        onOpenInteraction(interaction.id);
    };

    const deleteInteraction = async (id: string) => {
        const branchId = editorEngine.branches.activeBranch?.id;
        if (!branchId) return;
        await editorEngine.interactions.removeInteraction(id, branchId);
    };

    if (!selected) {
        return (
            <ScrollArea className="h-full">
                <NoSelectionEmptyState />
                <Accordion
                    type="multiple"
                    value={open}
                    onValueChange={setOpen}
                    className="w-full max-w-full pb-6"
                >
                    <PageTriggerSection
                        interactions={pageInteractions}
                        onAddTrigger={(kind) => void addPageTrigger(kind)}
                        onOpenInteraction={onOpenInteraction}
                        onDeleteInteraction={(id) => void deleteInteraction(id)}
                    />
                </Accordion>
            </ScrollArea>
        );
    }

    return (
        <ScrollArea className="h-full">
            <ElementHeaderSection />
            <Accordion
                type="multiple"
                value={open}
                onValueChange={setOpen}
                className="w-full max-w-full pb-6"
            >
                <ElementTriggerSection
                    interactions={elementInteractions}
                    onAddTrigger={(kind) => void addElementTrigger(kind)}
                    onOpenInteraction={onOpenInteraction}
                    onDeleteInteraction={(id) => void deleteInteraction(id)}
                />
                <PageTriggerSection
                    interactions={pageInteractions}
                    onAddTrigger={(kind) => void addPageTrigger(kind)}
                    onOpenInteraction={onOpenInteraction}
                    onDeleteInteraction={(id) => void deleteInteraction(id)}
                />
            </Accordion>
        </ScrollArea>
    );
});
