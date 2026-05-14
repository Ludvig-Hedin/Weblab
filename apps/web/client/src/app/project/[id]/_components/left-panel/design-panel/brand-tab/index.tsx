'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { BrandTabValue } from '@weblab/models';
import { Accordion } from '@weblab/ui/accordion';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';

import type { TokenSectionData, TokenSectionId } from './lib/group-tokens';
import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import FontPanel from './font-panel';
import { buildTokenSections } from './lib/group-tokens';
import { SetupTokensCta } from './setup-tokens-cta';
import { TokenSection } from './token-section';

const DEFAULT_OPEN: TokenSectionId[] = ['colors', 'sizes', 'radius', 'text-styles'];

/** Which section a legacy `BrandTabValue` deep-link should expand. */
function sectionForBrandTab(tab: BrandTabValue | null): TokenSectionId | null {
    switch (tab) {
        case BrandTabValue.COLORS:
        case BrandTabValue.COLOR_STYLES:
            return 'colors';
        case BrandTabValue.TEXT_STYLES:
            return 'text-styles';
        default:
            return null;
    }
}

function filterSections(sections: TokenSectionData[], query: string): TokenSectionData[] {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    const matches = (label: string, name: string) =>
        label.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    return sections.map((section) => {
        const rows = section.rows.filter((r) => matches(r.label, r.name));
        const groups = section.groups
            .map((g) => ({ ...g, rows: g.rows.filter((r) => matches(r.label, r.name)) }))
            .filter((g) => g.rows.length > 0);
        const count = rows.length + groups.reduce((n, g) => n + g.rows.length, 0);
        return { ...section, rows, groups, count };
    });
}

/**
 * Brand tab — one scrollable panel of typed, collapsible token sections.
 *
 * Replaces the old 5-row drill-in hub. Every token is projected from
 * `TokensManager` into a typed section (Colors, Sizes & Spacing, Radius, Text
 * Styles, Other); Fonts keep their dedicated panel, reached from the footer
 * row. Rows expand inline for editing (M2); the right-click menu lands in M3.
 */
export const BrandTab = observer(() => {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const { brandTab } = editorEngine.state;
    const { confirm, dialog } = useConfirm();
    const [query, setQuery] = useState('');
    const [openSections, setOpenSections] = useState<string[]>(DEFAULT_OPEN);
    const [expandedName, setExpandedName] = useState<string | null>(null);
    const [addingSection, setAddingSection] = useState<TokenSectionId | null>(null);
    const [paletteImported, setPaletteImported] = useState(false);
    const [importingPalette, setImportingPalette] = useState(false);

    useEffect(() => {
        void tokens.scan();
        // Populate ThemeManager.colorGroups so we can detect a legacy Tailwind
        // palette worth importing into @theme variables (M5).
        void editorEngine.theme.scanConfig();
    }, [tokens, editorEngine.theme]);

    // Legacy deep-links (right-panel "Create text style", v2 connect-token
    // picker "Manage tokens") still set `brandTab` — in the unified panel that
    // just means "make sure this section is expanded".
    useEffect(() => {
        const target = sectionForBrandTab(brandTab);
        if (target) {
            setOpenSections((prev) => (prev.includes(target) ? prev : [...prev, target]));
        }
    }, [brandTab]);

    const toggleRow = (name: string) => setExpandedName((prev) => (prev === name ? null : name));

    const openAdd = (id: TokenSectionId) => {
        setAddingSection(id);
        setOpenSections((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };

    const handleImportPalette = async () => {
        setImportingPalette(true);
        try {
            await tokens.migrateTailwindPalette();
            setPaletteImported(true);
        } finally {
            setImportingPalette(false);
        }
    };

    // Fonts keep their dedicated panel for now — the footer row is the entry
    // point (drill-in exception, see plan: font-panel stays).
    if (brandTab === BrandTabValue.FONTS) {
        return <FontPanel />;
    }

    if (!tokens.hasTokensLayer) {
        return (
            <div className="flex flex-col gap-3 p-3">
                <SetupTokensCta />
                {dialog}
            </div>
        );
    }

    const sections = filterSections(
        buildTokenSections({
            variables: tokens.variables,
            colorStyles: tokens.colorStyles,
            textStyles: tokens.textStyles,
            resolveVar: (name) => tokens.resolveVariableValue(name),
        }),
        query,
    );
    const searching = query.trim().length > 0;
    const visibleSections = searching ? sections.filter((s) => s.count > 0) : sections;
    const accordionValue = searching ? visibleSections.map((s) => s.id) : openSections;

    return (
        <div className="flex h-full flex-col">
            <div className="border-border/60 border-b p-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search tokens…"
                        className="text-mini h-8 pl-7"
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {tokens.scanError && (
                    <p className="text-destructive text-mini px-3 py-2">{tokens.scanError}</p>
                )}
                {!searching &&
                    !paletteImported &&
                    Object.keys(editorEngine.theme.colorGroups).length > 0 && (
                        <div className="border-border bg-background-secondary mx-2 mt-2 flex flex-col gap-2 rounded-md border p-2.5">
                            <p className="text-foreground-secondary text-mini">
                                Found a Tailwind color palette in this project. Import it to manage
                                every color here.
                            </p>
                            <Button
                                size="sm"
                                className="h-7 self-start"
                                disabled={importingPalette}
                                onClick={() => void handleImportPalette()}
                            >
                                {importingPalette ? 'Importing…' : 'Import Tailwind colors'}
                            </Button>
                        </div>
                    )}
                {searching && visibleSections.length === 0 ? (
                    <p className="text-foreground-tertiary text-mini px-3 py-3">
                        No tokens match “{query.trim()}”.
                    </p>
                ) : (
                    <Accordion
                        type="multiple"
                        value={accordionValue}
                        onValueChange={(value) => {
                            if (!searching) setOpenSections(value);
                        }}
                    >
                        {visibleSections.map((section) => (
                            <TokenSection
                                key={section.id}
                                section={section}
                                expandedName={expandedName}
                                onToggleRow={toggleRow}
                                confirm={confirm}
                                adding={addingSection === section.id}
                                onAdd={() => openAdd(section.id)}
                                onCloseAdd={() => setAddingSection(null)}
                            />
                        ))}
                    </Accordion>
                )}

                {/* Fonts — entry point into the dedicated font manager. */}
                <button
                    type="button"
                    onClick={() => editorEngine.state.setBrandTab(BrandTabValue.FONTS)}
                    className="border-border/60 text-foreground-secondary hover:text-foreground-primary hover:bg-background-secondary flex w-full items-center gap-2 border-t px-3 py-2 text-left transition-colors"
                >
                    <span className="text-mini flex-1 font-medium tracking-wide uppercase">
                        Fonts
                    </span>
                    <Icons.ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                </button>
            </div>
            {dialog}
        </div>
    );
});
