'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { LeftPanelTabValue } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import type { ColorVariableOption } from '../hooks/use-color-variable';
import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
    buildTokenSections,
    findTokenRow,
} from '../../../left-panel/design-panel/brand-tab/lib/group-tokens';
import { TokenEditor } from '../../../left-panel/design-panel/brand-tab/token-editor';

/** Opens the pinned Variables tab in the left panel. */
export function useOpenVariablesTab() {
    const editorEngine = useEditorEngine();
    return () => {
        editorEngine.state.setLeftPanelTab(LeftPanelTabValue.VARIABLES);
        editorEngine.state.setLeftPanelLocked(true);
    };
}

export interface ColorVariablePickerProps {
    options: ColorVariableOption[];
    /** Currently bound variable, highlighted in the list. */
    current?: string | null;
    onPick: (varName: string) => void;
}

/** Searchable list of color variables, shown in the color row's connect popover. */
export function ColorVariablePicker({ options, current, onPick }: ColorVariablePickerProps) {
    const t = useTranslations('editor.stylePanel.controls.colorRow');
    const openVariablesTab = useOpenVariablesTab();
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const visible = q
        ? options.filter(
              (o) => o.label.toLowerCase().includes(q) || o.varName.toLowerCase().includes(q),
          )
        : options;

    return (
        <div className="flex max-h-[320px] flex-col">
            <div className="border-border/60 relative border-b p-1.5">
                <Icons.MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('searchVariables')}
                    aria-label={t('searchVariables')}
                    className="text-mini text-foreground-primary placeholder:text-muted-foreground h-7 w-full rounded-md bg-transparent pr-2 pl-7 outline-none"
                />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {options.length === 0 && (
                    <p className="text-foreground-tertiary text-mini px-2 py-2">
                        {t('noColorVariables')}
                    </p>
                )}
                {options.length > 0 && visible.length === 0 && (
                    <p className="text-foreground-tertiary text-mini px-2 py-2">{t('noMatch')}</p>
                )}
                {visible.map((option) => (
                    <button
                        key={option.varName}
                        type="button"
                        onClick={() => onPick(option.varName)}
                        className="hover:bg-background-secondary aria-[current=true]:bg-background-secondary flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                        aria-current={option.varName === current}
                    >
                        <span
                            aria-hidden
                            className="border-foreground/25 size-3.5 shrink-0 rounded-xs border"
                            style={{ backgroundColor: option.swatch }}
                        />
                        <span className="text-foreground-primary text-mini min-w-0 flex-1 truncate">
                            {option.label}
                        </span>
                    </button>
                ))}
            </div>
            <button
                type="button"
                onClick={openVariablesTab}
                className="border-border/60 text-foreground-secondary hover:text-foreground-primary text-mini flex items-center gap-2 border-t px-3 py-2 text-left"
            >
                <Icons.Plus className="size-3.5" />
                {t('createVariable')}
            </button>
        </div>
    );
}

export interface TokenEditPanelProps {
    /** Raw token name (CSS var name or text-style name). */
    name: string;
    onClose: () => void;
}

/** The Variables tab's inline editor, reused in a popover next to a bound value. */
export const TokenEditPanel = observer(function TokenEditPanel({
    name,
    onClose,
}: TokenEditPanelProps) {
    const tokens = useEditorEngine().tokens;
    const { confirm, dialog } = useConfirm();
    const row = findTokenRow(
        buildTokenSections({
            variables: tokens.variables,
            colorStyles: tokens.colorStyles,
            textStyles: tokens.textStyles,
            resolveVar: (n) => tokens.resolveVariableValue(n),
        }),
        name,
    );
    if (!row) return null;
    return (
        <div className="pt-2">
            <TokenEditor row={row} onClose={onClose} confirm={confirm} />
            {dialog}
        </div>
    );
});
