'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { nanoid } from 'nanoid/non-secure';
import { useTranslations } from 'next-intl';

import type {
    ActionStep,
    ActionStepKind,
    ActionStepPayload,
    Animation,
    Interaction,
} from '@weblab/models';
import { Accordion } from '@weblab/ui/accordion';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { Input } from '@weblab/ui/input';
import { ScrollArea } from '@weblab/ui/scroll-area';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { Section } from '../../style-tab-v2/sections/section';
import { ActionRow } from '../controls/action-row';
import { ActionTypePicker } from '../controls/action-type-picker';
import { BreakpointCheckboxes } from '../controls/breakpoint-checkboxes';
import { TargetPicker } from '../controls/target-picker';
import { useInteractionsSectionState } from '../hooks/use-section-state';

interface TimelineEditorPlaceholderProps {
    interactionId: string;
    onBack: () => void;
}

const DEFAULT_OPEN = ['trigger-settings', 'timeline'] as const;

export const TimelineEditorPlaceholder = observer(function TimelineEditor({
    interactionId,
    onBack,
}: TimelineEditorPlaceholderProps) {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const interaction = editorEngine.interactions.getInteraction(interactionId);
    const { open, setOpen } = useInteractionsSectionState(DEFAULT_OPEN);
    const [activeAnimationId, setActiveAnimationId] = useState<string | null>(
        interaction?.animations[0]?.id ?? null,
    );

    if (!interaction) {
        return (
            <div className="flex h-full flex-col">
                <Header onBack={onBack} name="Not found" />
                <div className="text-foreground-tertiary text-mini flex flex-1 items-center justify-center px-6 text-center">
                    Interaction not found.
                </div>
            </div>
        );
    }

    const branchId = editorEngine.branches.activeBranch.id;

    const persist = (next: Interaction) => {
        void editorEngine.interactions.updateInteraction(
            { ...next, updatedAt: Date.now() },
            branchId,
        );
    };

    const setName = (name: string) => {
        if (name === interaction.name) return;
        persist({ ...interaction, name });
    };

    const setBreakpoints = (breakpoints: Interaction['breakpoints']) => {
        persist({ ...interaction, breakpoints });
    };

    const setTarget = (target: Interaction['target']) => {
        persist({ ...interaction, target });
    };

    const activeAnimation =
        interaction.animations.find((a) => a.id === activeAnimationId) ?? interaction.animations[0];

    const updateAnimation = (animationId: string, updater: (a: Animation) => Animation) => {
        const nextAnimations = interaction.animations.map((a) =>
            a.id === animationId ? updater(a) : a,
        );
        persist({ ...interaction, animations: nextAnimations });
    };

    const addStep = (kind: ActionStepKind) => {
        if (!activeAnimation) return;
        const payload = defaultPayloadFor(kind);
        const step: ActionStep = {
            id: `st_${nanoid(8)}`,
            startAt: 0,
            duration: 300,
            delay: 0,
            easing: { kind: 'named', name: 'out-cubic' },
            payload,
            isInitial: false,
        };
        updateAnimation(activeAnimation.id, (a) => ({
            ...a,
            steps: [...a.steps, step],
        }));
    };

    return (
        <div className="flex h-full flex-col">
            <Header onBack={onBack} name={interaction.name} onRename={setName} />
            <ScrollArea className="min-h-0 flex-1">
                <Accordion
                    type="multiple"
                    value={open}
                    onValueChange={setOpen}
                    className="w-full max-w-full pb-6"
                >
                    <Section
                        id="trigger-settings"
                        title={t(
                            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings
                                .title,
                        )}
                    >
                        <BreakpointCheckboxes
                            flags={interaction.breakpoints}
                            onChange={setBreakpoints}
                        />
                        <TargetPicker target={interaction.target} onChange={setTarget} />
                    </Section>

                    <Section
                        id="timeline"
                        title={interaction.animations.length === 1 ? 'Timeline' : 'Animations'}
                    >
                        {interaction.animations.length > 1 && (
                            <div className="flex gap-1 px-3 pb-2">
                                {interaction.animations.map((animation) => (
                                    <Button
                                        key={animation.id}
                                        variant={
                                            activeAnimationId === animation.id ? 'default' : 'ghost'
                                        }
                                        size="sm"
                                        className="text-mini h-7 flex-1"
                                        onClick={() => setActiveAnimationId(animation.id)}
                                    >
                                        {animation.name}
                                    </Button>
                                ))}
                            </div>
                        )}

                        {activeAnimation && (
                            <>
                                {activeAnimation.steps.length === 0 ? (
                                    <p className="text-foreground-tertiary text-mini px-3 pb-2">
                                        No actions yet. Add one below.
                                    </p>
                                ) : (
                                    <div className="flex flex-col">
                                        {activeAnimation.steps.map((step) => (
                                            <ActionRow
                                                key={step.id}
                                                step={step}
                                                onChange={(next) =>
                                                    updateAnimation(activeAnimation.id, (a) => ({
                                                        ...a,
                                                        steps: a.steps.map((s) =>
                                                            s.id === step.id ? next : s,
                                                        ),
                                                    }))
                                                }
                                                onRemove={() =>
                                                    updateAnimation(activeAnimation.id, (a) => ({
                                                        ...a,
                                                        steps: a.steps.filter(
                                                            (s) => s.id !== step.id,
                                                        ),
                                                    }))
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                                <div className="px-3 pt-2">
                                    <ActionTypePicker onPick={addStep} />
                                </div>
                            </>
                        )}
                    </Section>
                </Accordion>
            </ScrollArea>
        </div>
    );
});

function Header({
    onBack,
    name,
    onRename,
}: {
    onBack: () => void;
    name: string;
    onRename?: (next: string) => void;
}) {
    const t = useTranslations();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);

    return (
        <div className="border-border-bar flex h-10 items-center gap-2 border-b px-2">
            <Button
                variant="ghost"
                size="icon"
                className="text-foreground-secondary hover:text-foreground-primary h-7 w-7"
                onClick={onBack}
                aria-label={t(transKeys.editor.panels.edit.tabs.interactions.editor.back)}
            >
                <Icons.ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            {editing && onRename ? (
                <Input
                    autoFocus
                    className="text-mini h-7 flex-1"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                        setEditing(false);
                        if (draft.trim() && draft !== name) onRename(draft.trim());
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            (e.currentTarget as HTMLInputElement).blur();
                        }
                        if (e.key === 'Escape') {
                            setDraft(name);
                            setEditing(false);
                        }
                    }}
                />
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        if (onRename) {
                            setDraft(name);
                            setEditing(true);
                        }
                    }}
                    className="text-foreground-primary text-mini hover:bg-background-bar-active flex-1 truncate rounded px-1 py-0.5 text-left font-medium"
                >
                    {name}
                </button>
            )}
        </div>
    );
}

function defaultPayloadFor(kind: ActionStepKind): ActionStepPayload {
    switch (kind) {
        case 'move':
            return { kind: 'move', y: { value: -8, unit: 'px' } };
        case 'scale':
            return { kind: 'scale', x: 1.05, y: 1.05, lockAspect: true };
        case 'rotate':
            return { kind: 'rotate', z: { value: 10, unit: 'deg' } };
        case 'opacity':
            return { kind: 'opacity', value: 0 };
        case 'size':
            return { kind: 'size' };
        case 'bg-color':
            return { kind: 'bg-color', color: '#000000' };
    }
}
