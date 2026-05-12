'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { Font } from '@weblab/models';
import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
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
    const [query, setQuery] = useState('');
    // Synchronous latch so two clicks in the same render tick can't both
    // pass the guard (React state updates are async — a ref is the only
    // safe single-flight gate here).
    const applyingRef = useRef(false);

    // TODO: use file system like code tab
    useEffect(() => {
        if (!editorEngine.activeSandbox.session.provider) {
            return;
        }
        void Promise.resolve(editorEngine.font.init()).catch((err) =>
            console.error('font.init failed', err),
        );
    }, [editorEngine.activeSandbox.session.provider]);

    // Run Google Fonts search whenever the query changes. The font store
    // de-bounces internally and loads the matching webfont so the preview
    // renders in its real face.
    useEffect(() => {
        if (!isOpen) return;
        const q = query.trim();
        const handle = window.setTimeout(() => {
            void editorEngine.font.searchFonts(q);
        }, 150);
        return () => window.clearTimeout(handle);
    }, [query, isOpen, editorEngine.font]);

    const installedFonts = editorEngine.font.fonts;
    const searchResults = editorEngine.font.searchResults;
    const systemFonts = editorEngine.font.systemFonts;

    const filteredInstalled = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return installedFonts;
        return installedFonts.filter((f) => f.family.toLowerCase().includes(q));
    }, [installedFonts, query]);

    const googleFonts: Font[] = useMemo(() => {
        const q = query.trim();
        const source = q ? searchResults : systemFonts;
        // Drop any Google entry whose family is already in installedFonts so
        // we don't render the same name twice.
        const installedFamilies = new Set(installedFonts.map((f) => f.family));
        return source.filter((f) => !installedFamilies.has(f.family));
    }, [installedFonts, searchResults, systemFonts, query]);

    const applyFont = async (font: Font, alreadyInstalled: boolean) => {
        if (applyingRef.current) return;
        applyingRef.current = true;
        try {
            if (!alreadyInstalled) {
                // Persist to font config + load webfont so the iframe can
                // actually render it before we apply the style.
                const ok = await editorEngine.font.addFont(font);
                if (!ok) {
                    console.error('Failed to add font', font);
                    return;
                }
            }
            handleFontFamilyChange(font);
        } catch (err) {
            // `addFont` can throw (network failure, sandbox not ready).
            // Without this catch the rejection escapes as an unhandled promise.
            console.error('applyFont failed', err);
        } finally {
            applyingRef.current = false;
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
                className="bg-background border-border mt-1 flex max-h-[440px] min-w-[280px] flex-col overflow-hidden rounded-xl border p-0 shadow-lg"
            >
                <div className="border-border bg-background sticky top-0 z-10 border-b px-2 py-2">
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search Google Fonts…"
                        className="h-8 text-sm"
                        aria-label="Search fonts"
                    />
                </div>
                <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
                    {filteredInstalled.length > 0 && (
                        <div className="divide-border divide-y">
                            <div className="text-muted-foreground px-1 pb-1 text-[10px] tracking-wider uppercase">
                                In this project
                            </div>
                            {filteredInstalled.map((font) => (
                                <div key={font.id} className="py-1">
                                    <FontFamily
                                        name={font.family}
                                        onSetFont={() => void applyFont(font, true)}
                                        isActive={
                                            textState.fontFamily.toLowerCase() ===
                                            font.id.toLowerCase()
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    {googleFonts.length > 0 && (
                        <div className="divide-border mt-2 divide-y">
                            <div className="text-muted-foreground px-1 pb-1 text-[10px] tracking-wider uppercase">
                                {query.trim() ? 'Google Fonts' : 'Popular Google Fonts'}
                            </div>
                            {googleFonts.map((font) => (
                                <div key={font.id} className="py-1">
                                    <FontFamily
                                        name={font.family}
                                        onSetFont={() => void applyFont(font, false)}
                                        isActive={
                                            textState.fontFamily.toLowerCase() ===
                                            font.id.toLowerCase()
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    {filteredInstalled.length === 0 && googleFonts.length === 0 && (
                        <div className="flex h-20 flex-col items-center justify-center text-center">
                            <Icons.Brand className="text-muted-foreground mb-1 h-5 w-5" />
                            <span className="text-muted-foreground text-small">
                                {query.trim() ? `No fonts match "${query}"` : 'Loading fonts…'}
                            </span>
                        </div>
                    )}
                </div>
                <div className="border-border bg-background sticky bottom-0 border-t p-3">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="text-small w-full rounded-md font-medium"
                        aria-label="Manage Brand fonts"
                        tabIndex={0}
                        onClick={() => {
                            editorEngine.state.setBrandTab(BrandTabValue.FONTS);
                            editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRAND);
                            onOpenChange(false);
                        }}
                    >
                        Manage / upload fonts
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
