'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useTranslations } from 'next-intl';

import type { Font } from '@weblab/models';
import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { toNormalCase } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { useDropdownControl } from '../../hooks/use-dropdown-manager';
import { useTextControl } from '../../hooks/use-text-control';
import { HoverOnlyTooltip } from '../../hover-tooltip';
import { ToolbarButton } from '../../toolbar-button';
import { FontFamily } from './font-family';

export const FontFamilySelector = observer(() => {
    const t = useTranslations('editor.editorBar');
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

    // Defer `font.init()` until the dropdown actually opens and only fire
    // once per mount — repeated calls re-run the store's sync work needlessly.
    const hasInitRef = useRef(false);
    useEffect(() => {
        if (!isOpen || hasInitRef.current) return;
        if (!editorEngine.activeSandbox?.session?.provider) return;
        hasInitRef.current = true;
        try {
            editorEngine.font.init();
        } catch (err) {
            console.error('font.init failed', err);
        }
    }, [isOpen, editorEngine.activeSandbox?.session?.provider, editorEngine.font]);

    // Run Google Fonts search whenever the query changes. The font store
    // de-bounces internally and loads the matching webfont so the preview
    // renders in its real face.
    useEffect(() => {
        if (!isOpen) return;
        const q = query.trim();
        const handle = window.setTimeout(() => {
            editorEngine.font.searchFonts(q).catch((err) => {
                console.error('Font search failed', err);
            });
        }, 150);
        return () => window.clearTimeout(handle);
    }, [query, isOpen, editorEngine.font]);

    // Track mount state so an async `applyFont` resumed after the user closes
    // the panel can't call back into a hook attached to an unmounted tree.
    // The mount-side assignment is required: under React StrictMode's
    // mount → cleanup → remount cycle the cleanup sets the ref to false,
    // so without re-asserting `true` on remount every applyFont in dev would
    // silently skip its `handleFontFamilyChange` call.
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Reset the search query when the dropdown closes so the next open shows
    // the full catalog instead of a stale filter.
    useEffect(() => {
        if (!isOpen) setQuery('');
    }, [isOpen]);

    // `editorEngine.font.*` are MobX observable arrays — the Proxy ref is
    // stable across mutations, so `useMemo` keyed on the ref would silently
    // return stale results. Compute inline; filter cost is trivial for font
    // catalogs (<1k items).
    const installedFonts = editorEngine.font.fonts;
    const searchResults = editorEngine.font.searchResults;
    const systemFonts = editorEngine.font.systemFonts;
    const q = query.trim().toLowerCase();
    const filteredInstalled = q
        ? installedFonts.filter((f) => f.family.toLowerCase().includes(q))
        : installedFonts;

    // `textState.fontFamily` can be a CSS stack like `"Inter", sans-serif`.
    // Strip quotes + fallbacks so the active-font highlight matches a bare id.
    const primaryFamilyKey = useMemo(
        () =>
            (textState.fontFamily.split(',')[0] ?? '')
                .trim()
                .replace(/^['"]|['"]$/g, '')
                .toLowerCase(),
        [textState.fontFamily],
    );

    const installedFamilies = new Set(installedFonts.map((f) => f.family));
    const googleSource = q ? searchResults : systemFonts;
    const googleFonts: Font[] = googleSource.filter((f) => !installedFamilies.has(f.family));

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
                    if (isMountedRef.current) {
                        toast.error(`Could not add ${font.family}`, {
                            description: 'Check your network or try again.',
                        });
                    }
                    return;
                }
            }
            // Bail out if the component unmounted during the await.
            if (!isMountedRef.current) return;
            // Close the dropdown before committing so a sync throw in the
            // commit path doesn't leave the picker stuck open.
            onOpenChange(false);
            handleFontFamilyChange(font);
        } catch (err) {
            // `addFont` can throw (network failure, sandbox not ready).
            // Without this catch the rejection escapes as an unhandled promise.
            console.error('applyFont failed', err);
            if (isMountedRef.current) {
                toast.error(`Could not apply ${font.family}`, {
                    description: err instanceof Error ? err.message : 'Unexpected error.',
                });
            }
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
                content={t('fontFamily')}
                side="bottom"
                className="mt-1"
                hideArrow
                disabled={isOpen}
            >
                <DropdownMenuTrigger asChild>
                    <ToolbarButton
                        isOpen={isOpen}
                        className="flex items-center gap-2 px-3"
                        aria-label={t('fontFamilySelector')}
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
                        placeholder={t('searchGoogleFonts')}
                        className="h-8 text-sm"
                        aria-label={t('searchFonts')}
                    />
                </div>
                <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
                    {filteredInstalled.length > 0 && (
                        <div className="divide-border divide-y">
                            <div className="text-muted-foreground px-1 pb-1 text-tiny">
                                In this project
                            </div>
                            {filteredInstalled.map((font) => (
                                <div key={font.id} className="py-1">
                                    <FontFamily
                                        name={font.family}
                                        onSetFont={() => void applyFont(font, true)}
                                        isActive={
                                            primaryFamilyKey === font.id.toLowerCase() ||
                                            primaryFamilyKey === font.family.toLowerCase()
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    {googleFonts.length > 0 && (
                        <div className="divide-border mt-2 divide-y">
                            <div className="text-muted-foreground px-1 pb-1 text-tiny">
                                {query.trim() ? 'Google Fonts' : 'Popular Google Fonts'}
                            </div>
                            {googleFonts.map((font) => (
                                <div key={font.id} className="py-1">
                                    <FontFamily
                                        name={font.family}
                                        onSetFont={() => void applyFont(font, false)}
                                        isActive={
                                            primaryFamilyKey === font.id.toLowerCase() ||
                                            primaryFamilyKey === font.family.toLowerCase()
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
                        aria-label={t('manageBrandFonts')}
                        tabIndex={0}
                        onClick={() => {
                            editorEngine.state.setBrandTab(BrandTabValue.FONTS);
                            editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRAND);
                            onOpenChange(false);
                        }}
                    >
                        {t('manageUploadFonts')}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
