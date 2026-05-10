'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { ConnectTokenPicker } from './connect-token-picker';

/**
 * "Apply Text Style" header rendered above the typography section in the
 * right-panel inspector. Shows the current text style binding (if any) and
 * opens the token picker scoped to Text Styles.
 *
 * Mirrors the layout in the user's reference screenshot — a top-level chip
 * controlling the entire typography group.
 */
export const TextStyleHeader = observer(function TextStyleHeader() {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [open, setOpen] = useState(false);

    const selected = editorEngine.elements.selected[0];
    const className = selected?.className ?? '';
    const active = tokens.detectTextStyleInClassName(className);

    return (
        <div className="px-3 pt-1 pb-1.5">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            'text-mini h-7 w-full justify-start gap-2',
                            active && 'border-foreground-brand/30 bg-foreground-brand/5',
                        )}
                    >
                        {active ? (
                            <>
                                <Icons.Link className="h-3.5 w-3.5" />
                                <span className="flex-1 truncate text-left">
                                    {active.displayName}
                                </span>
                                <button
                                    type="button"
                                    aria-label="Unbind text style"
                                    className="hover:bg-foreground/10 -mr-1 rounded-sm p-0.5"
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        await tokens.applyTextStyleToSelected(null);
                                    }}
                                >
                                    <Icons.CrossS className="h-3 w-3" />
                                </button>
                            </>
                        ) : (
                            <>
                                <Icons.Plus className="h-3.5 w-3.5" />
                                <span>Apply Text Style</span>
                            </>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    side="left"
                    align="start"
                    className="w-auto overflow-hidden rounded-lg p-0 shadow-xl"
                >
                    <ConnectTokenPicker
                        property="font-family"
                        activeBindingName={active?.name}
                        activeBindingIsTextStyle={!!active}
                        onBindColorStyle={() => undefined}
                        onBindVariable={() => undefined}
                        onBindTextStyle={async (name) => {
                            await tokens.applyTextStyleToSelected(name);
                        }}
                        onUnbind={async () => {
                            await tokens.applyTextStyleToSelected(null);
                        }}
                        onClose={() => setOpen(false)}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
});
