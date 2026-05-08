'use client';

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';

import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toNormalCase } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { useDropdownControl } from '../../hooks/use-dropdown-manager';
import { useTextControl } from '../../hooks/use-text-control';
import { HoverOnlyTooltip } from '../../hover-tooltip';
import { ToolbarButton } from '../../toolbar-button';
import { FontFamily } from './font-family';

export const FontFamilySelector = observer(() => {
    const editorEngine = useEditorEngine();
    const { handleFontFamilyChange, textState } = useTextControl();
    const { isOpen, onOpenChange } = useDropdownControl({
        id: 'font-family-dropdown',
    });

    // TODO: use file system like code tab
    useEffect(() => {
        if (!editorEngine.activeSandbox.session.provider) {
            return;
        }
        editorEngine.font.init();
    }, [editorEngine.activeSandbox.session.provider]);

    const handleClose = () => {
        onOpenChange(false);
        editorEngine.state.setBrandTab(null);
        if (editorEngine.state.leftPanelTab === LeftPanelTabValue.BRAND) {
            editorEngine.state.setLeftPanelTab(null);
        }
    };

    return (
        <DropdownMenu
            open={isOpen}
            modal={false}
            onOpenChange={(v) => {
                onOpenChange(v);
                if (!v) editorEngine.state.setBrandTab(null);
            }}
        >
            <HoverOnlyTooltip
                content="Font Family"
                side="bottom"
                className="mt-1"
                hideArrow
                disabled={isOpen}
            >
                <DropdownMenuTrigger asChild>
                    <ToolbarButton
                        isOpen={isOpen}
                        className="flex items-center gap-2 px-3"
                        aria-label="Font Family Selector"
                    >
                        <span className="text-small truncate">
                            {toNormalCase(textState.fontFamily) || 'Sans Serif'}
                        </span>
                    </ToolbarButton>
                </DropdownMenuTrigger>
            </HoverOnlyTooltip>
            <DropdownMenuContent
                side="bottom"
                align="center"
                className="bg-background border-border mt-1 flex max-h-[400px] min-w-[240px] flex-col overflow-y-auto rounded-xl border p-0 shadow-lg"
            >
                <div className="divide-border flex-1 divide-y overflow-y-auto px-2 pt-2 pb-2">
                    {editorEngine.font.fonts.length === 0 ? (
                        <div className="flex h-20 flex-col items-center justify-center text-center">
                            <Icons.Brand className="text-muted-foreground mb-1 h-5 w-5" />
                            <span className="text-muted-foreground text-small">
                                No fonts found <br /> Add fonts from the Brand Tab
                            </span>
                        </div>
                    ) : (
                        editorEngine.font.fonts.map((font) => (
                            <div key={font.id} className="py-1">
                                <FontFamily
                                    name={font.family}
                                    onSetFont={() => handleFontFamilyChange(font)}
                                    isActive={
                                        textState.fontFamily.toLowerCase() === font.id.toLowerCase()
                                    }
                                />
                            </div>
                        ))
                    )}
                </div>
                <div className="border-border bg-background sticky bottom-0 border-t p-4">
                    <Button
                        variant="secondary"
                        size="lg"
                        className="text-small w-full rounded-md font-medium"
                        aria-label="Manage Brand fonts"
                        tabIndex={0}
                        onClick={() => {
                            editorEngine.state.setBrandTab(BrandTabValue.FONTS);
                            editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRAND);
                            onOpenChange(false);
                        }}
                    >
                        Browse more fonts
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
