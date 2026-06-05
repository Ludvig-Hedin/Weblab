'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { tokenToHex } from '../color-utils';
import { useOverrides } from '../overrides-context';
import { Section } from '../section';
import { ColorSwatch } from './color-swatch';
import { CANVAS_EDITOR_TOKENS, FOREGROUND_TOKENS, PALETTE, SEMANTIC_TOKENS } from './data';

export function ColorsDemo() {
    const { overrides, resetAll } = useOverrides();
    const editedCount = [...SEMANTIC_TOKENS, ...FOREGROUND_TOKENS, ...CANVAS_EDITOR_TOKENS].filter(
        (t) => overrides[t.cssVar],
    ).length;

    return (
        <div id="colors">
            <Section
                title="Semantic tokens"
                tag="colors"
                filePath="packages/ui/src/globals.css"
                editedCount={editedCount}
                controls={
                    editedCount > 0 ? (
                        <button
                            onClick={resetAll}
                            className="text-foreground-tertiary hover:text-foreground text-tiny transition-colors"
                        >
                            reset all
                        </button>
                    ) : undefined
                }
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {SEMANTIC_TOKENS.map((t) => (
                        <ColorSwatch
                            key={t.cssVar}
                            name={t.name}
                            cssVar={t.cssVar}
                            value={t.value}
                            description={t.description}
                            usage={t.usage}
                        />
                    ))}
                </div>
            </Section>

            <Section
                title="Foreground & background tokens"
                tag="colors"
                filePath="packages/ui/src/globals.css"
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {FOREGROUND_TOKENS.map((t) => (
                        <ColorSwatch
                            key={t.cssVar}
                            name={t.name}
                            cssVar={t.cssVar}
                            value={t.value}
                            description={t.description}
                            usage={t.usage}
                        />
                    ))}
                </div>
                <div className="border-border mt-6 grid gap-3 border-t pt-4">
                    <p className="text-foreground-secondary text-small">Semantic status tokens</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-foreground-success bg-background-success/40 border-success/30 text-mini rounded-md border px-2 py-1">
                            Added · success
                        </span>
                        <span className="text-foreground-warning bg-background-warning/40 border-warning/30 text-mini rounded-md border px-2 py-1">
                            Modified · warning
                        </span>
                        <span className="text-destructive bg-destructive/10 border-destructive/30 text-mini rounded-md border px-2 py-1">
                            Deleted · destructive
                        </span>
                    </div>
                </div>
            </Section>

            <Section
                title="Canvas editor surfaces"
                tag="colors"
                filePath="packages/ui/src/globals.css"
            >
                <p className="text-foreground-tertiary mb-3 text-xs">
                    Tokens for the project editor chrome — canvas, side panels, top/bottom bars, and
                    tab strip.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {CANVAS_EDITOR_TOKENS.map((t) => (
                        <ColorSwatch
                            key={t.cssVar}
                            name={t.name}
                            cssVar={t.cssVar}
                            value={t.value}
                            description={t.description}
                            usage={t.usage}
                        />
                    ))}
                </div>
            </Section>

            <Section title="Color palette" tag="colors">
                {PALETTE.map((group) => (
                    <div key={group.label} className="mb-6">
                        <p className="text-foreground-tertiary mb-2 text-xs">{group.label}</p>
                        <div className="flex flex-wrap gap-1">
                            {group.colors.map((c) => (
                                <Tooltip key={c.name}>
                                    <TooltipTrigger>
                                        <div
                                            className="h-8 w-8 cursor-default rounded"
                                            style={{ background: c.value }}
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="font-mono text-xs">
                                            {c.name} — {tokenToHex(c.value)}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                    </div>
                ))}
            </Section>
        </div>
    );
}
