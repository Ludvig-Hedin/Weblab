'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import type { Font } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { toNormalCase } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { FontFamily } from '../../../editor-bar/text-inputs/font/font-family';
import { FIELD_BASE_CLASSES } from './constants';

export interface FontFieldProps {
    /** Current value (font id / family). */
    value: string;
    /** Commits a raw font-family string (for free-typing / fallback). */
    onCommit: (value: string) => void;
}

/**
 * Style panel font row — single dropdown trigger that opens a searchable
 * Google Fonts + project fonts list. Mirrors the canvas top-bar font menu
 * but renders inside a `PropertyControl` row so it shares the same gutter,
 * height, and contrast as every other field.
 *
 * Picking a font calls the font store's full install pipeline (so the
 * iframe loads the webface) and then writes the font id to the style.
 */
export const FontField = observer(function FontField({ value, onCommit }: FontFieldProps) {
    const editorEngine = useEditorEngine();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    // Synchronous single-flight latch (a useState bool would let two clicks
    // in the same render tick both pass the guard).
    const busyRef = useRef(false);

    // Kick the font store the first time the dropdown opens so we don't pay
    // the cost until the user actually wants to browse.
    // Init once on first open. Repeated `font.init()` calls would re-fire its
    // internal sync work each time the dropdown opens.
    const hasInitRef = useRef(false);
    useEffect(() => {
        if (!open || hasInitRef.current) return;
        if (!editorEngine.activeSandbox?.session?.provider) return;
        hasInitRef.current = true;
        try {
            editorEngine.font.init();
        } catch (err) {
            console.error('font.init failed', err);
        }
    }, [open, editorEngine.activeSandbox?.session?.provider, editorEngine.font]);

    // Run Google Fonts search whenever the query changes — store debounces.
    useEffect(() => {
        if (!open) return;
        const handle = window.setTimeout(() => {
            editorEngine.font.searchFonts(query.trim()).catch((err) => {
                console.error('Font search failed', err);
            });
        }, 150);
        return () => window.clearTimeout(handle);
    }, [query, open, editorEngine.font]);

    // Track mount so a resumed `applyFont` can't call back after unmount.
    // The mount-side assignment is required: under React StrictMode's
    // mount → cleanup → remount cycle the cleanup sets the ref to false,
    // so without re-asserting `true` on remount every applyFont in dev
    // would silently skip its `onCommit` call.
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Reset query when the popover closes so the next open shows the full
    // catalog instead of a stale filter.
    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    // `editorEngine.font.*` are MobX observable arrays — the Proxy ref is
    // stable across mutations, so `useMemo` keyed on the ref would silently
    // return stale results when items are pushed/spliced. Compute inline.
    const installed = editorEngine.font.fonts;
    const searchResults = editorEngine.font.searchResults;
    const systemFonts = editorEngine.font.systemFonts;
    const q = query.trim().toLowerCase();
    const filteredInstalled = q
        ? installed.filter((f) => f.family.toLowerCase().includes(q))
        : installed;

    // `value` can be either a bare font id (Tailwind-emitted `inter`) or a
    // raw CSS font-family stack (`"Inter", sans-serif`). Strip quotes + the
    // fallback chain so the active-font highlight matches in both cases.
    const primaryFamilyKey = useMemo(
        () =>
            (value.split(',')[0] ?? '')
                .trim()
                .replace(/^['"]|['"]$/g, '')
                .toLowerCase(),
        [value],
    );

    const installedFamilies = new Set(installed.map((f) => f.family));
    const googleSource = q ? searchResults : systemFonts;
    const googleFonts = googleSource.filter((f) => !installedFamilies.has(f.family));

    const applyFont = async (font: Font, alreadyInstalled: boolean) => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            if (!alreadyInstalled) {
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
            // Bail out if the popover was closed (and component unmounted)
            // during the await.
            if (!isMountedRef.current) return;
            // Close the popover BEFORE `onCommit` so a synchronous throw in
            // the commit path doesn't leave the popover stuck open.
            setOpen(false);
            // The font store writes via its own action chain when called via
            // useTextControl, but in this surface we just commit the id —
            // PropertyControl's setter writes through the user's chosen
            // write target (Tailwind / inline / class).
            onCommit(font.id);
        } catch (err) {
            // `addFont` can throw (network failure, sandbox not ready). Without
            // this catch the rejection escapes as an unhandled promise.
            console.error('applyFont failed', err);
            if (isMountedRef.current) {
                toast.error(`Could not apply ${font.family}`, {
                    description: err instanceof Error ? err.message : 'Unexpected error.',
                });
            }
        } finally {
            busyRef.current = false;
        }
    };

    const triggerLabel = value ? toNormalCase(value) : 'System default';

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    aria-label="Font family"
                    // Same canonical row geometry as every other field — see FIELD_BASE_CLASSES.
                    className={cn(FIELD_BASE_CLASSES, 'min-w-0 justify-between gap-2 shadow-none')}
                >
                    <span
                        className="min-w-0 truncate text-left"
                        style={value ? { fontFamily: value } : undefined}
                    >
                        {triggerLabel}
                    </span>
                    <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="end"
                className="bg-background border-border flex max-h-[440px] w-[280px] flex-col overflow-hidden rounded-xl border p-0 shadow-lg"
            >
                <div className="border-border bg-background sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2">
                    <Search className="text-muted-foreground size-3.5" />
                    <Input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search Google Fonts…"
                        aria-label="Search fonts"
                        className="h-8 rounded-md text-sm"
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
                            <span className="text-muted-foreground text-mini">
                                {query.trim() ? `No fonts match "${query}"` : 'Loading fonts…'}
                            </span>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});
