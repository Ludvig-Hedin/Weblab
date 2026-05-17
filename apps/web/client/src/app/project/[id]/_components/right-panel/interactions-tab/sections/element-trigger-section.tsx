'use client';

import { MousePointer2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { Interaction, TriggerKind } from '@weblab/models';

import { transKeys } from '@/i18n/keys';
import { Section } from '../../style-tab-v2/sections/section';
import { InteractionRow } from '../controls/interaction-row';
import { TriggerPicker } from '../controls/trigger-picker';

interface ElementTriggerSectionProps {
    interactions: Interaction[];
    disableAdd?: boolean;
    onAddTrigger: (kind: TriggerKind) => void;
    onOpenInteraction: (id: string) => void;
    onDeleteInteraction: (id: string) => void;
}

export const ElementTriggerSection = observer(function ElementTriggerSection({
    interactions,
    disableAdd,
    onAddTrigger,
    onOpenInteraction,
    onDeleteInteraction,
}: ElementTriggerSectionProps) {
    const t = useTranslations();
    return (
        <Section
            id="element-trigger"
            title={t(transKeys.editor.panels.edit.tabs.interactions.sections.elementTrigger.title)}
            icon={MousePointer2}
            setCount={interactions.length}
            actions={
                <TriggerPicker
                    ariaLabel={t(
                        transKeys.editor.panels.edit.tabs.interactions.sections.elementTrigger
                            .addAria,
                    )}
                    elementOnly
                    disabled={disableAdd}
                    onPick={onAddTrigger}
                />
            }
        >
            {interactions.length === 0 ? (
                <p className="text-foreground-tertiary text-mini px-3 pb-2">
                    {t(transKeys.editor.panels.edit.tabs.interactions.empty.noInteractions.body)}
                </p>
            ) : (
                <div className="flex flex-col">
                    {interactions.map((interaction) => (
                        <InteractionRow
                            key={interaction.id}
                            interaction={interaction}
                            onOpen={() => onOpenInteraction(interaction.id)}
                            onDelete={() => onDeleteInteraction(interaction.id)}
                        />
                    ))}
                </div>
            )}
        </Section>
    );
});
