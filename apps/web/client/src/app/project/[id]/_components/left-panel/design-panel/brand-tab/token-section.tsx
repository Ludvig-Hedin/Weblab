'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';

import { AccordionItem } from '@weblab/ui/accordion';
import { Icons } from '@weblab/ui/icons';

import type { TokenSectionData } from './lib/group-tokens';
import type { ConfirmFn } from './lib/token-mutations';
import { AddTokenForm } from './editors/add-token-form';
import { TokenGroup } from './token-group';
import { TokenRow } from './token-row';

export interface TokenSectionProps {
    section: TokenSectionData;
    expandedName: string | null;
    onToggleRow: (name: string) => void;
    confirm: ConfirmFn;
    /** True while the inline add form for this section is open. */
    adding: boolean;
    onAdd: () => void;
    onCloseAdd: () => void;
}

/**
 * One typed section of the Brand panel (Colors, Sizes & Spacing, …). Built on
 * the Radix accordion primitive — same pattern as the right-panel
 * `style-tab-v3` `Section`, restyled for the left panel's tree.
 */
export function TokenSection({
    section,
    expandedName,
    onToggleRow,
    confirm,
    adding,
    onAdd,
    onCloseAdd,
}: TokenSectionProps) {
    const isEmpty = section.count === 0;
    const groupLabels = section.groups.map((group) => group.label);
    return (
        <AccordionItem
            value={section.id}
            className="border-border/60 border-t border-b-0 first:border-t-0"
        >
            <AccordionPrimitive.Header className="flex w-full">
                <AccordionPrimitive.Trigger className="text-foreground-secondary hover:text-foreground-primary text-mini flex w-full items-center gap-2 px-3 py-2 font-medium transition-colors outline-none [&[data-state=open]>svg]:rotate-90">
                    <ChevronRight className="text-muted-foreground size-3 shrink-0 transition-transform duration-150" />
                    <span className="flex-1 truncate text-left">{section.title}</span>
                    <span className="text-foreground-tertiary text-micro shrink-0 tabular-nums">
                        {section.count}
                    </span>
                </AccordionPrimitive.Trigger>
                <div
                    role="presentation"
                    className="flex items-center pr-2"
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={onAdd}
                        aria-label={`Add to ${section.title}`}
                        className="text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground-primary flex size-6 items-center justify-center rounded-md transition-colors"
                    >
                        <Icons.Plus className="size-3.5" />
                    </button>
                </div>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                <div className="flex flex-col gap-0.5 pb-2">
                    {adding && <AddTokenForm sectionId={section.id} onClose={onCloseAdd} />}
                    {isEmpty && !adding && (
                        <p className="text-foreground-tertiary text-mini px-4 py-1.5">
                            No {section.title.toLowerCase()} yet — click + to add one.
                        </p>
                    )}
                    <div className="flex flex-col gap-0.5 px-2">
                        {section.groups.map((group) => (
                            <TokenGroup
                                key={group.key}
                                group={group}
                                expandedName={expandedName}
                                onToggleRow={onToggleRow}
                                confirm={confirm}
                                groupLabels={groupLabels}
                            />
                        ))}
                        {section.rows.map((row) => (
                            <TokenRow
                                key={row.name}
                                row={row}
                                expanded={expandedName === row.name}
                                onToggle={() => onToggleRow(row.name)}
                                confirm={confirm}
                                groupLabels={groupLabels}
                            />
                        ))}
                    </div>
                </div>
            </AccordionPrimitive.Content>
        </AccordionItem>
    );
}
