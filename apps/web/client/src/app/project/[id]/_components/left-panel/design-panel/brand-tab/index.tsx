import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';

import { BrandTabValue } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import ColorPanel from './color-panel';
import ColorStylesPanel from './color-styles-panel';
import FontPanel from './font-panel';
import TextStylesPanel from './text-styles-panel';
import VariablesPanel from './variables-panel';

interface SectionRowProps {
    icon: ReactNode;
    label: string;
    description: string;
    onClick: () => void;
    preview?: ReactNode;
}

const SectionRow = ({ icon, label, description, onClick, preview }: SectionRowProps) => (
    <button
        type="button"
        onClick={onClick}
        className="border-border hover:border-border-hover hover:bg-background-secondary group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150"
    >
        <span className="text-foreground-secondary group-hover:text-foreground-primary flex h-7 w-7 shrink-0 items-center justify-center transition-colors">
            {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-foreground-primary text-small">{label}</span>
            <span className="text-foreground-tertiary text-mini truncate">{description}</span>
        </span>
        {preview}
        <Icons.ChevronRight className="text-foreground-tertiary group-hover:text-foreground-secondary h-4 w-4 shrink-0 transition-colors" />
    </button>
);

/**
 * Brand tab hub — a single, scannable list of the five brand surfaces
 * (Colors, Variables, Color Styles, Text Styles, Fonts). Each row drills into
 * its panel; every panel has a back-arrow header that returns here via
 * `setBrandTab(null)`. Counts come straight off the observable `tokens` store.
 */
export const BrandTab = observer(() => {
    const editorEngine = useEditorEngine();
    const { brandTab } = editorEngine.state;
    const tokens = editorEngine.tokens;

    useEffect(() => {
        void editorEngine.theme.scanConfig();
        void tokens.scan();
    }, [editorEngine.theme, tokens]);

    if (brandTab === BrandTabValue.COLORS) return <ColorPanel />;
    if (brandTab === BrandTabValue.VARIABLES) return <VariablesPanel />;
    if (brandTab === BrandTabValue.COLOR_STYLES) return <ColorStylesPanel />;
    if (brandTab === BrandTabValue.TEXT_STYLES) return <TextStylesPanel />;
    if (brandTab === BrandTabValue.FONTS) return <FontPanel />;

    // Brand-color swatch strip — the 500/DEFAULT shade of every color group,
    // used as an at-a-glance preview on the Colors row.
    const { colorGroups, colorDefaults } = editorEngine.theme;
    const swatches: string[] = [];
    [...Object.values(colorGroups), ...Object.values(colorDefaults)].forEach((group) => {
        group.forEach((color) => {
            if (color.name === '500' || color.name === 'default' || color.name === 'DEFAULT') {
                swatches.push(color.lightColor);
            }
        });
    });

    const countLabel = (n: number, noun: string) =>
        n === 0 ? `No ${noun}s yet` : `${n} ${noun}${n === 1 ? '' : 's'}`;

    return (
        <div className="flex flex-col gap-2 p-3">
            <SectionRow
                icon={<Icons.PaintBucket className="h-4 w-4" />}
                label="Colors"
                description="Brand palette & theme colors"
                onClick={() => editorEngine.state.setBrandTab(BrandTabValue.COLORS)}
                preview={
                    swatches.length > 0 ? (
                        <span className="border-border grid h-5 w-16 shrink-0 grid-cols-8 overflow-hidden rounded-[3px] border">
                            {swatches.slice(0, 8).map((color, index) => (
                                <span
                                    key={`swatch-${index}`}
                                    className="h-full w-full"
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </span>
                    ) : undefined
                }
            />
            <SectionRow
                icon={<Icons.Tokens className="h-4 w-4" />}
                label="Variables"
                description={countLabel(tokens.variables.length, 'variable')}
                onClick={() => editorEngine.state.setBrandTab(BrandTabValue.VARIABLES)}
            />
            <SectionRow
                icon={<Icons.EyeDropper className="h-4 w-4" />}
                label="Color Styles"
                description={countLabel(tokens.colorStyles.length, 'style')}
                onClick={() => editorEngine.state.setBrandTab(BrandTabValue.COLOR_STYLES)}
            />
            <SectionRow
                icon={<Icons.Text className="h-4 w-4" />}
                label="Text Styles"
                description={countLabel(tokens.textStyles.length, 'style')}
                onClick={() => editorEngine.state.setBrandTab(BrandTabValue.TEXT_STYLES)}
            />
            <SectionRow
                icon={<Icons.Pilcrow className="h-4 w-4" />}
                label="Fonts"
                description="Site typography"
                onClick={() => editorEngine.state.setBrandTab(BrandTabValue.FONTS)}
            />
        </div>
    );
});
