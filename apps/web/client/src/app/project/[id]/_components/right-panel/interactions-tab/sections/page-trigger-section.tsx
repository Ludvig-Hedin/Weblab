'use client';

import { Sparkles } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { Interaction, TriggerKind } from '@weblab/models';

import { transKeys } from '@/i18n/keys';
import { Section } from '../../style-tab-v2/sections/section';
import { InteractionRow } from '../controls/interaction-row';
import { TriggerPicker } from '../controls/trigger-picker';

interface PageTriggerSectionProps {
    interactions: Interaction[];
    onAddTrigger: (kind: TriggerKind) => void;
    onOpenInteraction: (id: string) => void;
    onDeleteInteraction: (id: string) => void;
}

export const PageTriggerSection = observer(function PageTriggerSection({
    interactions,
    onAddTrigger,
    onOpenInteraction,
    onDeleteInteraction,
}: PageTriggerSectionProps) {
    const t = useTranslations();
    return (
        <Section
            id="page-trigger"
            title={t(transKeys.editor.panels.edit.tabs.interactions.sections.pageTrigger.title)}
            icon={Sparkles}
            setCount={interactions.length}
            actions={
                <TriggerPicker
                    ariaLabel={t(
                        transKeys.editor.panels.edit.tabs.interactions.sections.pageTrigger.addAria,
                    )}
                    pageOnly
                    onPick={onAddTrigger}
                />
            }
        >
            <p className="text-foreground-tertiary text-mini px-3 pb-2">
                {t(transKeys.editor.panels.edit.tabs.interactions.sections.pageTrigger.hint)}
            </p>
            {interactions.length > 0 && (
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
