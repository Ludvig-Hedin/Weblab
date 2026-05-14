'use client';

import Link from 'next/link';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Toggle } from '@weblab/ui/toggle';

import { Section } from '../section';

type ButtonVariant = NonNullable<React.ComponentProps<typeof Button>['variant']>;
type ButtonSize = NonNullable<React.ComponentProps<typeof Button>['size']>;

const VARIANTS: ButtonVariant[] = [
    'default',
    'secondary',
    'outline',
    'ghost',
    'destructive',
    'accent',
    'warning',
    'danger',
    'chip',
    'link',
];
const SIZES: ButtonSize[] = ['lg', 'default', 'sm', 'compact'];

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
                    {VARIANTS.map((v) => (
                        <Button key={v} variant={v}>
                            {v}
                        </Button>
                    ))}
                </div>
            </Section>

            <Section title="Variant × size matrix" tag="buttons" inspectId="button">
                <div className="border-border overflow-hidden rounded-xl border">
                    <div
                        className="bg-foreground/[0.03] text-foreground-tertiary grid gap-2 border-b px-4 py-2 text-[10px] font-medium"
                        style={{
                            gridTemplateColumns: `120px repeat(${SIZES.length}, minmax(0, 1fr))`,
                        }}
                    >
                        <span>Variant</span>
                        {SIZES.map((s) => (
                            <span key={s}>{s}</span>
                        ))}
                    </div>
                    {VARIANTS.map((v) => (
                        <div
                            key={v}
                            className="border-border grid items-center gap-2 border-b px-4 py-3 last:border-b-0"
                            style={{
                                gridTemplateColumns: `120px repeat(${SIZES.length}, minmax(0, 1fr))`,
                            }}
                        >
                            <span className="text-foreground-secondary text-mini font-mono">
                                {v}
                            </span>
                            {SIZES.map((s) => (
                                <div key={s}>
                                    <Button variant={v} size={s}>
                                        Button
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                <p className="text-foreground-tertiary mt-3 max-w-3xl text-xs">
                    <strong className="text-foreground-secondary">accent</strong> — soft-positive
                    surface for "last used" / selected pills.{' '}
                    <strong className="text-foreground-secondary">warning</strong> — soft amber
                    surface for pending / attention states (not destructive actions).{' '}
                    <strong className="text-foreground-secondary">danger</strong> — soft red
                    surface for error / offline status (different from{' '}
                    <code className="font-mono">destructive</code>, which is a solid red CTA for
                    delete actions).{' '}
                    <strong className="text-foreground-secondary">chip</strong> — small
                    rounded-sm filter pill for cards/mockups.{' '}
                    <strong className="text-foreground-secondary">compact</strong> — h-7 status
                    badge pill.
                </p>
            </Section>

            <Section title="Icon-only sizes" tag="buttons" inspectId="button">
                <div className="flex flex-wrap items-center gap-3">
                    {VARIANTS.map((v) => (
                        <Button key={v} variant={v} size="icon" aria-label={v}>
                            <Icons.Plus className="h-4 w-4" />
                        </Button>
                    ))}
                    <Button size="toolbar" aria-label="toolbar">
                        <Icons.MagnifyingGlass className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </Section>

            <Section title="With leading icon" tag="buttons" inspectId="button">
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
                        <Icons.Gear className="h-4 w-4" /> Settings
                    </Button>
                    <Button variant="destructive">
                        <Icons.Trash className="h-4 w-4" /> Delete
                    </Button>
                </div>
            </Section>

            <Section title="With trailing icon" tag="buttons" inspectId="button">
                <div className="flex flex-wrap items-center gap-3">
                    <Button>
                        Continue <Icons.ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline">
                        Open <Icons.ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary">
                        Expand <Icons.ChevronDown className="h-4 w-4" />
                    </Button>
                </div>
            </Section>

            <Section title="States" tag="buttons" inspectId="button">
                <div className="flex flex-wrap items-center gap-3">
                    <Button>Default</Button>
                    <Button disabled>Disabled</Button>
                    <Button loading>Loading</Button>
                    <Button variant="outline" loading>
                        Saving changes
                    </Button>
                    <Button variant="destructive" loading>
                        Deleting
                    </Button>
                    <Button variant="outline" disabled>
                        Disabled outline
                    </Button>
                </div>
                <p className="text-foreground-tertiary mt-3 max-w-2xl text-xs">
                    Use the <code className="font-mono">loading</code> prop instead of composing a
                    spinner manually — it disables the button, sets{' '}
                    <code className="font-mono">aria-busy</code>, and renders the canonical
                    spinner.
                </p>
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
                    <Toggle aria-label="Disabled" disabled>
                        <Icons.TextAlignJustified className="h-4 w-4" />
                    </Toggle>
                    <Toggle aria-label="Disabled pressed" disabled defaultPressed>
                        <Icons.TextAlignJustified className="h-4 w-4" />
                    </Toggle>
                </div>
            </Section>

            <Section title="Full-width" tag="buttons" inspectId="button">
                <div className="grid w-full max-w-md gap-2">
                    <Button className="w-full">
                        <Icons.GoogleLogo className="h-4 w-4" /> Continue with Google
                    </Button>
                    <Button variant="outline" className="w-full">
                        <Icons.GitHubLogo className="h-4 w-4" /> Continue with GitHub
                    </Button>
                </div>
            </Section>

            <Section title="Button groups" tag="buttons" inspectId="button">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex overflow-hidden rounded-md">
                        <Button variant="outline" className="rounded-r-none">
                            <Icons.ArrowLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" className="-ml-px rounded-none">
                            <Icons.Reload className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" className="-ml-px rounded-l-none">
                            <Icons.ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="inline-flex overflow-hidden rounded-md">
                        <Button className="rounded-r-none">Save</Button>
                        <Button className="border-primary-foreground/20 -ml-px rounded-l-none border-l">
                            <Icons.ChevronDown className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </Section>

            <Section title="Allowed customizations" tag="buttons">
                <div className="flex flex-col gap-6">
                    <div>
                        <p className="text-foreground-secondary mb-2 text-xs font-medium">
                            Width-fill (forms, dropdowns)
                        </p>
                        <div className="border-border bg-background-secondary/40 max-w-sm rounded-lg border p-4">
                            <Button className="w-full">Continue</Button>
                        </div>
                        <p className="text-foreground-tertiary mt-2 max-w-2xl text-xs">
                            <code className="font-mono">className="w-full"</code> only — never
                            override radius, color, height, or padding.
                        </p>
                    </div>

                    <div>
                        <p className="text-foreground-secondary mb-2 text-xs font-medium">
                            asChild — wrap a link
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild variant="default">
                                <Link href="#">Go to docs</Link>
                            </Button>
                            <Button asChild variant="outline">
                                <a href="https://weblab.build" target="_blank" rel="noreferrer">
                                    External link <Icons.ExternalLink className="h-4 w-4" />
                                </a>
                            </Button>
                        </div>
                    </div>

                    <div>
                        <p className="text-foreground-secondary mb-2 text-xs font-medium">
                            Font-weight tweak (rare — marketing CTAs)
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button className="font-semibold">Upgrade to Pro</Button>
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Do / Don't" tag="buttons">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="border-border bg-background-secondary/40 rounded-lg border p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="bg-background-success text-foreground-success rounded px-1.5 py-0.5 text-[10px] font-medium">
                                Do
                            </span>
                            <span className="text-foreground-secondary text-xs font-medium">
                                Use variants and sizes
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="default" size="sm">
                                Confirm
                            </Button>
                            <Button variant="outline" size="sm">
                                Cancel
                            </Button>
                            <Button variant="accent" size="compact">
                                Last used
                            </Button>
                        </div>
                    </div>
                    <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-[10px] font-medium">
                                Don't
                            </span>
                            <span className="text-foreground-secondary text-xs font-medium">
                                Override radius, palette, or size
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button className="rounded-md bg-blue-500 px-3 py-2 text-xs text-white">
                                Confirm
                            </button>
                            <Button className="rounded-md bg-zinc-900">Cancel</Button>
                            <button className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white">
                                Last used
                            </button>
                        </div>
                    </div>
                </div>
                <p className="text-foreground-tertiary mt-4 max-w-3xl text-xs">
                    Raw Tailwind palette utilities (<code className="font-mono">bg-blue-500</code>,{' '}
                    <code className="font-mono">bg-zinc-900</code>) and raw radius (
                    <code className="font-mono">rounded-md</code>) bypass the design system. Reach
                    for the closest variant/size first; if nothing fits, add a new variant here.
                </p>
            </Section>

            <Section title="Deviations found in code (audit)" tag="buttons">
                <p className="text-foreground-tertiary mb-6 max-w-3xl text-xs">
                    Real off-spec patterns currently shipping in the app, paired with the
                    canonical replacement. Use this as the reference when migrating.
                </p>

                <div className="flex flex-col gap-4">
                    <DeviationRow
                        title="Login button — last sign-in highlight"
                        path="apps/web/client/src/app/_components/login-button.tsx:54"
                        offSpec={
                            <button className="inline-flex h-9 items-center gap-2 rounded-full border border-blue-300 bg-blue-100 px-3 py-2 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100">
                                <Icons.GoogleLogo className="h-4 w-4" /> Continue with Google
                            </button>
                        }
                        canonical={
                            <Button variant="accent">
                                <Icons.GoogleLogo className="h-4 w-4" /> Continue with Google
                            </Button>
                        }
                        problem="Raw bg-blue-* palette and dark variants composed inline."
                        fix="Use variant='accent' — already themed via --background-positive."
                    />

                    <DeviationRow
                        title="Publish dropdown — link domain"
                        path="apps/web/client/src/app/project/[id]/_components/top-bar/publish/dropdown/custom-domain/no-domain.tsx:17"
                        offSpec={
                            <Button variant="default" className="w-full rounded-md p-3">
                                Link a Custom Domain
                            </Button>
                        }
                        canonical={
                            <Button variant="default" size="lg" className="w-full">
                                Link a Custom Domain
                            </Button>
                        }
                        problem="rounded-md breaks the global rounded-full button invariant."
                        fix="Use size='lg' + w-full. Width-fill is the only allowed override."
                    />

                    <DeviationRow
                        title="Settings — page status pill"
                        path="apps/web/client/src/components/ui/settings-modal/site/page.tsx:376"
                        offSpec={
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-mini h-7 px-2"
                                disabled
                            >
                                Unpublished
                            </Button>
                        }
                        canonical={
                            <Button variant="outline" size="compact" disabled>
                                Unpublished
                            </Button>
                        }
                        problem="Height + padding override on top of size='sm' = missing size token."
                        fix="Use size='compact' — h-7 pill designed for status badges."
                    />

                    <DeviationRow
                        title="Mockup chrome — filter pill"
                        path="apps/web/client/src/app/_components/shared/mockups/components-mockup.tsx:290"
                        offSpec={
                            <button className="text-foreground-primary flex items-center rounded bg-zinc-900 px-2 py-0.5 text-xs">
                                May <Icons.ChevronDown className="ml-1 h-3 w-3" />
                            </button>
                        }
                        canonical={
                            <Button variant="chip" size="compact">
                                May <Icons.ChevronDown className="ml-1 h-3 w-3" />
                            </Button>
                        }
                        problem="Raw <button> with bg-zinc-900 + text-xs + rounded."
                        fix="Use variant='chip' + size='compact'. Decorative mockup chrome should still use canonical tokens."
                    />

                    <DeviationRow
                        title="Manual loading spinner composition"
                        path="apps/web/client/src/app/_components/login-button.tsx:60"
                        offSpec={
                            <Button variant="outline" disabled>
                                <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                Signing in
                            </Button>
                        }
                        canonical={
                            <Button variant="outline" loading>
                                Signing in
                            </Button>
                        }
                        problem="Spinner composed manually inside the button — repeated across the app."
                        fix="Use the loading prop. Disables button, sets aria-busy, renders canonical spinner."
                    />
                </div>
            </Section>

            <Section title="When raw <button> is OK" tag="buttons">
                <ul className="text-foreground-tertiary max-w-3xl space-y-2 text-xs">
                    <li>
                        <strong className="text-foreground-secondary">
                            Editor toolbar chrome
                        </strong>{' '}
                        — <code className="font-mono">ToolbarButton</code> wraps{' '}
                        <code className="font-mono">Button</code> with its own surface language.
                        Keep contained inside{' '}
                        <code className="font-mono">_components/editor-bar/*</code>.
                    </li>
                    <li>
                        <strong className="text-foreground-secondary">
                            Tab list click targets
                        </strong>{' '}
                        — should be the <code className="font-mono">Tabs</code> primitive, not{' '}
                        <code className="font-mono">Button</code>.
                    </li>
                    <li>
                        <strong className="text-foreground-secondary">
                            Card / row entire-surface clicks
                        </strong>{' '}
                        — wrapping an entire card in{' '}
                        <code className="font-mono">&lt;button&gt;</code> for click-to-open is
                        fine; inherit the card's chrome and skip{' '}
                        <code className="font-mono">Button</code> styling.
                    </li>
                    <li>
                        <strong className="text-foreground-secondary">
                            Decorative non-interactive mockup illustrations
                        </strong>{' '}
                        — if the button is never actually clickable, prefer{' '}
                        <code className="font-mono">variant="chip"</code> so it still uses real
                        tokens.
                    </li>
                </ul>
            </Section>
        </div>
    );
}

interface DeviationRowProps {
    title: string;
    path: string;
    offSpec: React.ReactNode;
    canonical: React.ReactNode;
    problem: string;
    fix: string;
}

function DeviationRow({ title, path, offSpec, canonical, problem, fix }: DeviationRowProps) {
    return (
        <div className="border-border bg-background-secondary/40 rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
                <h3 className="text-foreground text-sm font-medium">{title}</h3>
                <code className="text-foreground-tertiary font-mono text-[10px]">{path}</code>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-md border p-3">
                    <span className="bg-destructive/10 text-destructive w-fit rounded px-1.5 py-0.5 text-[10px] font-medium">
                        Off-spec
                    </span>
                    <div className="flex min-h-9 items-center">{offSpec}</div>
                    <p className="text-foreground-tertiary text-xs">{problem}</p>
                </div>
                <div className="border-border bg-background flex flex-col gap-2 rounded-md border p-3">
                    <span className="bg-background-success text-foreground-success w-fit rounded px-1.5 py-0.5 text-[10px] font-medium">
                        Canonical
                    </span>
                    <div className="flex min-h-9 items-center">{canonical}</div>
                    <p className="text-foreground-tertiary text-xs">{fix}</p>
                </div>
            </div>
        </div>
    );
}
