'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Accordion } from '@weblab/ui/accordion';
import { ScrollArea } from '@weblab/ui/scroll-area';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { PropertySearch } from './controls';
import { useResetHotkey } from './hooks/use-reset-hotkey';
import { useSectionState } from './hooks/use-section-state';
import { AdvancedSection } from './sections/advanced';
import { BackgroundSection } from './sections/background';
import { BorderSection } from './sections/border';
import { CursorSection } from './sections/cursor';
import { EffectsSection } from './sections/effects';
import { ElementSection } from './sections/element';
import { LayoutSection } from './sections/layout';
import { PositionSection } from './sections/position';
import { SizeSection } from './sections/size';
import { StylesSection } from './sections/styles';
import { TextSection } from './sections/text';
import { TransformsSection } from './sections/transforms';
import { TransitionsSection } from './sections/transitions';

const DEFAULT_OPEN_SECTIONS = [
    'element',
    'position',
    'layout',
    'size',
    'text',
    'background',
    'border',
] as const;

const StyleTabV4Empty = () => {
    const t = useTranslations();
    return (
        <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="space-y-2">
                <p className="text-foreground-primary text-small font-medium">
                    {t(transKeys.editor.panels.edit.tabs.styles.emptyState)}
                </p>
                <p className="text-foreground-tertiary text-mini">
                    {t(transKeys.editor.panels.edit.tabs.styles.emptyStateHint)}
                </p>
            </div>
        </div>
    );
};

/**
 * StyleTabV4 — designer-first, Figma/Cursor-inspired redesign of the
 * Style tab. Behind `NEXT_PUBLIC_STYLE_PANEL_V4` (defaults off). Reuses
 * v2/v3's StyleManager pipeline (read via `useStyleValue`, write via
 * `useStyleSetter`) so undo/redo, AST sync, write-target preferences,
 * and the in-canvas reflection keep working unchanged.
 *
 * Section order (top → bottom):
 *   Element → Position → Layout → Size → Text → Background → Border →
 *   Effects → Transitions → Transforms → Cursor → Styles → Advanced
 *
 * The v3 "Overlays" section is split into:
 *   - Background  (bg color + image + size + position + repeat)
 *   - Border      (stroke + radius + per-side / per-corner detail)
 */
export const StyleTabV4 = observer(function StyleTabV4() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const { open, setOpen } = useSectionState(DEFAULT_OPEN_SECTIONS);
    useResetHotkey();

    if (!selected) return <StyleTabV4Empty />;

    return (
        // `w-full min-w-0` is load-bearing: this is a flex item inside the
        // RightPanel's Tabs column, and a flex item's default `min-width: auto`
        // refuses to shrink below its content — so any wide control would push
        // the whole column past the panel's right edge. `min-w-0` lets it
        // shrink to the container; `overflow-x-hidden` is the hard backstop so
        // the panel can NEVER scroll or clip horizontally at any resize width.
        <div className="flex h-full w-full min-w-0 flex-col overflow-x-hidden">
            {/* Static header strip: the property search stays pinned above the
                scrolling accordion so it never scrolls out of reach. */}
            <div className="border-border/30 w-full min-w-0 border-b px-3 py-2">
                <PropertySearch
                    onNavigate={(sectionId) =>
                        setOpen((prev) => (prev.includes(sectionId) ? prev : [...prev, sectionId]))
                    }
                />
            </div>
            <ScrollArea className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden">
                <Accordion
                    type="multiple"
                    value={open}
                    onValueChange={setOpen}
                    className="w-full max-w-full min-w-0 px-0 pb-6"
                >
                    <ElementSection />
                    <PositionSection />
                    <LayoutSection />
                    <SizeSection />
                    <TextSection />
                    <BackgroundSection />
                    <BorderSection />
                    <EffectsSection />
                    <TransitionsSection />
                    <TransformsSection />
                    <CursorSection />
                    <StylesSection />
                    <AdvancedSection />
                </Accordion>
            </ScrollArea>
        </div>
    );
});
