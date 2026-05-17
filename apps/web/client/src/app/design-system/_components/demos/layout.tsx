'use client';

import { AspectRatio } from '@weblab/ui/aspect-ratio';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@weblab/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { Progress } from '@weblab/ui/progress';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Separator } from '@weblab/ui/separator';

import { Section } from '../section';

export function LayoutDemo() {
    return (
        <div id="layout">
            <Section
                title="Card"
                tag="layout"
                inspectId="card"
                filePath="packages/ui/src/components/card.tsx"
            >
                <div className="flex flex-wrap gap-4">
                    <Card className="w-64">
                        <CardHeader>
                            <CardTitle>Project name</CardTitle>
                            <CardDescription>Last updated 2 hours ago</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-foreground-secondary text-sm">Card body content.</p>
                        </CardContent>
                        <CardFooter className="gap-2">
                            <Button size="sm">Open</Button>
                            <Button size="sm" variant="ghost">
                                Settings
                            </Button>
                        </CardFooter>
                    </Card>
                    <Card className="w-64">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Usage</CardTitle>
                                <Badge variant="secondary">Pro</Badge>
                            </div>
                            <CardDescription>Current billing period</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-foreground-secondary">AI requests</span>
                                    <span>450 / 1000</span>
                                </div>
                                <Progress value={45} />
                            </div>
                        </CardContent>
                    </Card>
                    <div className="border-border bg-background-secondary w-64 rounded-xl border p-4">
                        <p className="text-foreground text-sm font-medium">Minimal card</p>
                        <p className="text-foreground-tertiary mt-1 text-xs">
                            No Card component — just background-secondary + border tokens.
                        </p>
                    </div>
                </div>
            </Section>

            <Section title="Separator" tag="layout" inspectId="separator">
                <div className="w-full max-w-md space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="text-foreground-secondary text-xs">Section A</span>
                        <Separator className="flex-1" />
                        <span className="text-foreground-secondary text-xs">Section B</span>
                    </div>
                    <Separator />
                    <div className="flex h-8 items-stretch gap-3">
                        <span className="text-foreground-secondary text-xs">Left</span>
                        <Separator orientation="vertical" />
                        <span className="text-foreground-secondary text-xs">Right</span>
                    </div>
                </div>
            </Section>

            <Section
                title="Scroll area"
                tag="layout"
                inspectId="scroll-area"
                filePath="packages/ui/src/components/scroll-area.tsx"
            >
                <ScrollArea className="border-border h-48 w-72 rounded-md border p-3">
                    <div className="space-y-2">
                        {Array.from({ length: 24 }).map((_, i) => (
                            <p key={i} className="text-foreground-secondary text-xs">
                                Item {i + 1} — scrollable content
                            </p>
                        ))}
                    </div>
                </ScrollArea>
            </Section>

            <Section
                title="Aspect ratio"
                tag="layout"
                inspectId="aspect-ratio"
                filePath="packages/ui/src/components/aspect-ratio.tsx"
            >
                <div className="flex flex-wrap gap-4">
                    {[
                        { ratio: 16 / 9, label: '16:9' },
                        { ratio: 4 / 3, label: '4:3' },
                        { ratio: 1, label: '1:1' },
                    ].map(({ ratio, label }) => (
                        <div key={label} className="w-48">
                            <AspectRatio
                                ratio={ratio}
                                className="bg-background-secondary border-border flex items-center justify-center rounded-md border"
                            >
                                <span className="text-foreground-tertiary text-xs">{label}</span>
                            </AspectRatio>
                        </div>
                    ))}
                </div>
            </Section>

            <Section
                title="Collapsible"
                tag="layout"
                inspectId="collapsible"
                filePath="packages/ui/src/components/collapsible.tsx"
            >
                <Collapsible className="border-border w-80 space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <p className="text-foreground text-sm font-medium">Advanced options</p>
                        <CollapsibleTrigger asChild>
                            <Button size="icon" variant="ghost">
                                <Icons.ChevronDown className="h-4 w-4" />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-2">
                        <div className="bg-background-secondary rounded-md px-3 py-2 text-xs">
                            Setting A
                        </div>
                        <div className="bg-background-secondary rounded-md px-3 py-2 text-xs">
                            Setting B
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </Section>

            <Section
                title="Sidebar (preview)"
                tag="layout"
                inspectId="sidebar"
                filePath="packages/ui/src/components/sidebar.tsx"
            >
                <div className="border-border flex h-64 w-full max-w-2xl overflow-hidden rounded-xl border">
                    <aside className="bg-background-secondary border-border w-48 border-r p-3">
                        <p className="text-foreground-tertiary text-mini font-medium">Workspace</p>
                        <nav className="mt-3 space-y-1">
                            {['Overview', 'Projects', 'Members', 'Billing', 'Settings'].map(
                                (item, i) => (
                                    <button
                                        key={item}
                                        className={`hover:bg-accent block w-full rounded-md px-2 py-1 text-left text-xs ${
                                            i === 1
                                                ? 'bg-accent text-foreground'
                                                : 'text-foreground-secondary'
                                        }`}
                                    >
                                        {item}
                                    </button>
                                ),
                            )}
                        </nav>
                    </aside>
                    <main className="flex-1 p-4">
                        <p className="text-foreground text-sm font-medium">Projects</p>
                        <p className="text-foreground-tertiary mt-2 text-xs">
                            This is a static preview of the Sidebar layout pattern. The full{' '}
                            <code>Sidebar</code> component is also exported from{' '}
                            <code>@weblab/ui/sidebar</code>.
                        </p>
                    </main>
                </div>
            </Section>
        </div>
    );
}
