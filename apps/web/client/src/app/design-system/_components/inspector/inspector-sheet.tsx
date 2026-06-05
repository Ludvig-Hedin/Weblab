'use client';

import { useMemo, useState } from 'react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@weblab/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';

import { useInspector, useOverrides } from '../overrides-context';
import { COMPONENT_TOKENS } from './component-tokens';
import { TokenControl } from './token-control';
import { VariantsPreview } from './variants-preview';

export function InspectorSheet() {
    const { current, close } = useInspector();
    const { overrides, resetTokens } = useOverrides();

    const spec = current ? COMPONENT_TOKENS[current] : null;

    const editedTokens = useMemo(() => {
        if (!spec) return [];
        return spec.tokens.filter((t) => overrides[t.cssVar] !== undefined);
    }, [spec, overrides]);

    return (
        <Sheet open={!!current} onOpenChange={(open) => !open && close()}>
            <SheetContent
                side="right"
                className="bg-background border-border w-full overflow-hidden p-0 sm:max-w-md"
            >
                {spec ? (
                    <div className="flex h-full flex-col">
                        <SheetHeader className="border-border border-b p-5">
                            <div className="flex items-center justify-between gap-2">
                                <SheetTitle className="text-foreground text-base font-medium">
                                    {spec.label}
                                </SheetTitle>
                                {editedTokens.length > 0 && (
                                    <button
                                        onClick={() =>
                                            resetTokens(editedTokens.map((t) => t.cssVar))
                                        }
                                        className="text-foreground-tertiary hover:text-foreground text-tiny transition-colors"
                                    >
                                        reset {editedTokens.length}
                                    </button>
                                )}
                            </div>
                            <SheetDescription className="text-foreground-tertiary text-xs">
                                Edits write to <code>:root</code> and apply globally to every
                                component that uses these tokens.
                            </SheetDescription>
                        </SheetHeader>

                        <Tabs
                            defaultValue="tokens"
                            className="flex flex-1 flex-col overflow-hidden"
                        >
                            <TabsList className="mx-5 mt-3 self-start bg-transparent">
                                <TabsTrigger value="tokens">Tokens</TabsTrigger>
                                <TabsTrigger value="variants">Variants</TabsTrigger>
                                <TabsTrigger value="code">Code</TabsTrigger>
                            </TabsList>

                            <TabsContent value="tokens" className="m-0 flex-1 overflow-hidden">
                                <ScrollArea className="h-full">
                                    <div className="space-y-2.5 p-5">
                                        {spec.tokens.length === 0 ? (
                                            <p className="text-foreground-tertiary text-xs italic">
                                                No editable tokens — this component renders using
                                                only structural styles.
                                            </p>
                                        ) : (
                                            spec.tokens.map((t) => (
                                                <TokenControl key={t.cssVar} spec={t} />
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="variants" className="m-0 flex-1 overflow-hidden">
                                <ScrollArea className="h-full">
                                    <div className="p-5">
                                        <VariantsPreview id={spec.id} />
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="code" className="m-0 flex-1 overflow-hidden">
                                <ScrollArea className="h-full">
                                    <CodeTab id={spec.id} />
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : (
                    <div className="p-5">
                        <SheetHeader>
                            <SheetTitle>Inspector</SheetTitle>
                            <SheetDescription>Select a component to inspect.</SheetDescription>
                        </SheetHeader>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

function CodeTab({ id }: { id: string }) {
    const spec = COMPONENT_TOKENS[id]!;
    const { overrides } = useOverrides();
    const [copied, setCopied] = useState(false);

    const css = useMemo(() => {
        const lines = spec.tokens
            .filter((t) => overrides[t.cssVar] !== undefined)
            .map((t) => `    ${t.cssVar}: ${overrides[t.cssVar]};`);
        if (lines.length === 0) {
            return `/* No overrides on ${spec.label} yet. Edit tokens to see CSS here. */`;
        }
        return `:root {\n${lines.join('\n')}\n}`;
    }, [spec, overrides]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(css);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // noop
        }
    };

    return (
        <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
                <p className="text-foreground-tertiary text-xs">
                    Paste into <code>packages/ui/src/globals.css</code>
                </p>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? (
                        <>
                            <Icons.CheckCircled className="mr-1 h-3.5 w-3.5" /> Copied
                        </>
                    ) : (
                        <>
                            <Icons.Copy className="mr-1 h-3.5 w-3.5" /> Copy
                        </>
                    )}
                </Button>
            </div>
            <pre className="bg-background-secondary border-border overflow-x-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
                <code>{css}</code>
            </pre>
            {spec.sourcePath && (
                <p className="text-foreground-tertiary text-tiny">
                    Component source: <code>{spec.sourcePath}</code>
                </p>
            )}
        </div>
    );
}
