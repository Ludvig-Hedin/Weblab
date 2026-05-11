'use client';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Toggle } from '@weblab/ui/toggle';

import { Section } from '../section';

export function ButtonsDemo() {
    return (
        <div id="buttons">
            <Section
                title="Variants"
                tag="buttons"
                inspectId="button"
                filePath="packages/ui/src/components/button.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="default">Default</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link</Button>
                    <Button disabled>Disabled</Button>
                </div>
            </Section>

            <Section title="Sizes" tag="buttons" inspectId="button">
                <div className="flex flex-wrap items-center gap-3">
                    <Button size="lg">Large</Button>
                    <Button size="default">Default</Button>
                    <Button size="sm">Small</Button>
                    <Button size="icon">
                        <Icons.Plus className="h-4 w-4" />
                    </Button>
                    <Button size="toolbar">
                        <Icons.MagnifyingGlass className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </Section>

            <Section title="With icons" tag="buttons" inspectId="button">
                <div className="flex flex-wrap items-center gap-3">
                    <Button>
                        <Icons.Plus className="h-4 w-4" /> Create project
                    </Button>
                    <Button variant="outline">
                        <Icons.Download className="h-4 w-4" /> Export
                    </Button>
                    <Button variant="secondary">
                        <Icons.GitHubLogo className="h-4 w-4" /> Connect GitHub
                    </Button>
                    <Button variant="ghost">
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" /> Loading
                    </Button>
                    <Button variant="destructive">
                        <Icons.Trash className="h-4 w-4" /> Delete
                    </Button>
                </div>
            </Section>

            <Section title="Toggle" tag="buttons" inspectId="toggle">
                <div className="flex flex-wrap items-center gap-3">
                    <Toggle aria-label="Align left">
                        <Icons.TextAlignLeft className="h-4 w-4" />
                    </Toggle>
                    <Toggle aria-label="Align center" defaultPressed>
                        <Icons.TextAlignCenter className="h-4 w-4" />
                    </Toggle>
                    <Toggle aria-label="Align right" variant="outline">
                        <Icons.TextAlignRight className="h-4 w-4" />
                    </Toggle>
                </div>
            </Section>
        </div>
    );
}
