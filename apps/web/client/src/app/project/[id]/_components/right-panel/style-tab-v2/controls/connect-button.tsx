'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { StyleBinding } from '@weblab/models/style';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { ConnectTokenPicker } from './connect-token-picker';

interface ConnectButtonProps {
    /** CSS property the user is binding. */
    property: string;
    /** Active binding (if any) for this property. */
    binding?: StyleBinding;
    /** Bind / unbind callbacks routed to the property's setter. */
    onBindColorStyle: (name: string) => void;
    onBindVariable: (varName: string) => void;
    onUnbind: () => void;
}

/**
 * Hover-revealed `+` button shown next to the label inside `PropertyControl`.
 * When a binding is already active the button stays visible and renders as a
 * compact chip with the token name + click-to-unbind affordance.
 *
 * Picker contents are filtered to tokens applicable to `property` by the
 * underlying `TokensManager`.
 */
export const ConnectButton = observer(function ConnectButton({
    property,
    binding,
    onBindColorStyle,
    onBindVariable,
    onUnbind,
}: ConnectButtonProps) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [open, setOpen] = useState(false);

    const candidates = tokens.applicableTokensFor(property);
    const hasAny =
        candidates.colorStyles.length > 0 ||
        candidates.textStyles.length > 0 ||
        candidates.variables.length > 0;

    if (!binding && !hasAny && !tokens.hasTokensLayer) {
        return null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={binding ? `Bound to ${binding.displayName}` : 'Connect to token'}
                    className={cn(
                        'text-mini flex h-5 shrink-0 items-center gap-1 rounded-sm px-1 transition-colors',
                        binding
                            ? 'bg-foreground/8 text-foreground-primary'
                            : 'text-foreground-secondary hover:bg-foreground/5 opacity-0 group-hover/control:opacity-100',
                    )}
                >
                    {binding ? (
                        <>
                            <Icons.Link className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">{binding.displayName}</span>
                        </>
                    ) : (
                        <Icons.Plus className="h-3 w-3" />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="left"
                align="start"
                className="w-auto overflow-hidden rounded-lg p-0 shadow-xl"
            >
                <ConnectTokenPicker
                    property={property}
                    activeBindingName={binding?.name}
                    activeBindingIsTextStyle={binding?.kind === 'text-style'}
                    onBindColorStyle={onBindColorStyle}
                    onBindVariable={onBindVariable}
                    onBindTextStyle={async (name) => {
                        await editorEngine.tokens.applyTextStyleToSelected(name);
                    }}
                    onUnbind={onUnbind}
                    onClose={() => setOpen(false)}
                />
            </PopoverContent>
        </Popover>
    );
});
