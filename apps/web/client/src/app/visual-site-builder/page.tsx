import Link from 'next/link';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';
import { CTASection } from '../_components/landing-page/cta-section';
import { FAQSection } from '../_components/landing-page/faq-section';
import { WebsiteLayout } from '../_components/website-layout';

const FAQS = [
    {
        question: `What is a visual site builder?`,
        answer: `A visual site builder lets you compose a website on a canvas instead of editing markup by hand. ${APP_NAME} is a visual site builder for teams that already have a React or Next.js codebase — you design with your real components, and the changes ship as a pull request to your repo.`,
    },
    {
        question: `How is ${APP_NAME} different from drag-and-drop builders like Webflow or Wix?`,
        answer: `Drag-and-drop builders generate their own markup and host the result on their platform. ${APP_NAME} works on your real codebase: it reads your components and your design tokens, lets designers and engineers edit them on an infinite canvas, and writes the diff back to GitHub as a PR. You keep ownership of the code and the hosting.`,
    },
    {
        question: `Do I need a React project to use ${APP_NAME}?`,
        answer: `Yes — ${APP_NAME} is built for React and Next.js codebases. If you're starting from zero, we recommend bootstrapping a Next.js app first. For non-React codebases, the visual builder still works for design exploration but the PR output targets React/JSX.`,
    },
    {
        question: `Can designers and developers work in the same file?`,
        answer: `Yes. Designers see an infinite canvas with real components and tokens. Developers see the underlying JSX/TSX. Changes are bidirectional — moving a card on the canvas updates the code, and editing the code updates the canvas.`,
    },
    {
        question: `Is ${APP_NAME} open source?`,
        answer: `Yes — you can self-host ${APP_NAME} from GitHub. The hosted cloud version is available with a Free tier and paid Pro tiers on the pricing page.`,
    },
    {
        question: `What design systems does ${APP_NAME} support?`,
        answer: `${APP_NAME} reads whatever lives in your repo: shadcn/ui, Material UI, Chakra UI, Radix, Tailwind tokens, CSS modules, styled-components. The AI is constrained to your real components and tokens — it won't invent new ones unless you ask it to.`,
    },
    {
        question: `Can I use ${APP_NAME} with Figma?`,
        answer: `Yes — you can pull frames from Figma and have ${APP_NAME} translate them into your real components, then refine on the canvas. The output is JSX backed by your design system, not a new component tree.`,
    },
    {
        question: `What does ${APP_NAME} cost?`,
        answer: `Free for self-hosting. The hosted cloud version has a free tier with daily message limits and paid Pro tiers from $25/month upward. See the pricing page for the full grid.`,
    },
];

export default function VisualSiteBuilderPage() {
    return (
        <WebsiteLayout showFooter={true}>
            {/* sr-only summary for AI/answer engines */}
            <section className="sr-only" aria-label="Visual Site Builder Summary">
                <h2>{APP_NAME}: Visual Site Builder for React and Next.js Teams</h2>
                <p>
                    {APP_NAME} is a visual site builder for React and Next.js codebases. Designers
                    and engineers drag real components onto an infinite canvas, edit them visually,
                    and ship changes as pull requests instead of static mockups. The AI is
                    constrained to your existing components and design tokens — outputs match your
                    real design system. Open source. Free to self-host.
                </p>
            </section>

            <main className="text-foreground-primary bg-background">
                {/* Hero */}
                <section className="px-4 pt-32 pb-24 sm:px-6 md:px-8 md:pt-40 md:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <p className="text-foreground-tertiary mb-6 text-xs font-medium">
                            Visual Site Builder
                        </p>
                        <h1 className="mb-8 max-w-4xl text-5xl leading-[1.05] font-light text-balance md:text-7xl">
                            Visual site builder for React & Next.js teams
                        </h1>
                        <p className="text-foreground-secondary mb-12 max-w-2xl text-lg md:text-xl">
                            Design with your real components on an infinite canvas. Edit code
                            visually. Ship pull requests instead of static mockups. Built for teams
                            that already own a React codebase.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild size="lg">
                                <Link href={Routes.PROJECTS}>Start building</Link>
                            </Button>
                            <Button asChild size="lg" variant="secondary">
                                <Link href={Routes.FEATURES_BUILDER}>See features</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* What it is */}
                <section className="border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-4xl">
                        <h2 className="mb-10 text-4xl font-light md:text-5xl">
                            What a visual site builder should be
                        </h2>
                        <div className="space-y-6 text-lg leading-relaxed">
                            <p className="text-foreground-secondary">
                                Most visual site builders are walled gardens. You drag, you drop,
                                you publish — and the moment you need to do anything serious, you
                                hit the wall: no real components, no design system, no git, no PR
                                review, no hosting your own way.
                            </p>
                            <p className="text-foreground-secondary">
                                {APP_NAME} flips it. The canvas reads your real React code. The
                                components on the left panel are the ones already in your repo. The
                                colors are your tokens. The output is a pull request to your GitHub
                                repository — reviewable by engineers, mergeable on your schedule,
                                deployable to your infrastructure.
                            </p>
                            <p className="text-foreground-secondary">
                                Designers get a visual surface. Engineers keep code as the source of
                                truth. Everyone ships the same artifact.
                            </p>
                        </div>
                    </div>
                </section>

                {/* How it works */}
                <section className="bg-foreground-primary/[0.02] border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-6xl">
                        <h2 className="mb-16 text-4xl font-light md:text-5xl">How it works</h2>
                        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
                            <div>
                                <p className="text-foreground-tertiary mb-3 text-sm">Step 1</p>
                                <h3 className="mb-3 text-2xl font-light">Connect your repo</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Point {APP_NAME} at a React or Next.js GitHub repository. We
                                    parse your components, design tokens, and routes. Nothing leaves
                                    your repo unless you ship a PR.
                                </p>
                            </div>
                            <div>
                                <p className="text-foreground-tertiary mb-3 text-sm">Step 2</p>
                                <h3 className="mb-3 text-2xl font-light">Design on canvas</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Drag your real components onto an infinite canvas. Adjust
                                    spacing, swap variants, tweak tokens visually. AI suggestions
                                    are constrained to what already exists in your design system.
                                </p>
                            </div>
                            <div>
                                <p className="text-foreground-tertiary mb-3 text-sm">Step 3</p>
                                <h3 className="mb-3 text-2xl font-light">Ship a pull request</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    When the design is ready, hit "Open PR". {APP_NAME} writes a
                                    clean diff against your codebase. Engineers review it in GitHub
                                    like any other PR. Merge to deploy.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Side-by-side */}
                <section className="border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="mb-12 text-4xl font-light md:text-5xl">How it compares</h2>
                        <div className="border-foreground-primary/10 overflow-x-auto rounded-lg border">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-foreground-primary/10 bg-foreground-primary/[0.03] border-b">
                                        <th className="px-6 py-4 text-sm font-normal">
                                            Capability
                                        </th>
                                        <th className="text-foreground-primary px-6 py-4 text-sm font-normal">
                                            {APP_NAME}
                                        </th>
                                        <th className="text-foreground-tertiary px-6 py-4 text-sm font-normal">
                                            Hosted drag-and-drop builders
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {[
                                        [
                                            'Uses your real components',
                                            'Yes — reads your existing React/Next.js codebase',
                                            'No — generates the platform’s own markup',
                                        ],
                                        [
                                            'Output',
                                            'Pull request to your GitHub repo',
                                            'Hosted page on the platform',
                                        ],
                                        [
                                            'Design system aware',
                                            'AI is constrained to your tokens and components',
                                            'Generic components and styles',
                                        ],
                                        [
                                            'Hosting',
                                            'You own it — Railway, Vercel, your VPS, anywhere',
                                            'Locked to the platform (or risky one-time export)',
                                        ],
                                        [
                                            'Code ownership',
                                            'Code lives in your repo from day one',
                                            'Code lives on the vendor — export is an escape hatch',
                                        ],
                                        ['Open source', 'Yes — self-host for free', 'No'],
                                        [
                                            'Built for teams',
                                            'Designer + engineer workflow with PR review',
                                            'Mostly solo / freelance designer workflow',
                                        ],
                                    ].map(([feature, weblab, other]) => (
                                        <tr
                                            key={feature}
                                            className="border-foreground-primary/10 border-b last:border-b-0"
                                        >
                                            <td className="px-6 py-5 align-top font-medium">
                                                {feature}
                                            </td>
                                            <td className="text-foreground-primary px-6 py-5 align-top">
                                                {weblab}
                                            </td>
                                            <td className="text-foreground-secondary px-6 py-5 align-top">
                                                {other}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                            <Link
                                href="/compare/webflow"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Webflow →
                            </Link>
                            <Link
                                href="/compare/framer"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Framer →
                            </Link>
                            <Link
                                href="/compare/wix"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Wix →
                            </Link>
                            <Link
                                href="/compare"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                All comparisons →
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Who it's for */}
                <section className="bg-foreground-primary/[0.02] border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-6xl">
                        <h2 className="mb-16 text-4xl font-light md:text-5xl">Built for</h2>
                        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <h3 className="mb-3 text-xl font-medium">Design engineers</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Skip the handoff. The artifact you design IS the code that
                                    ships. Visual canvas with a code source of truth.
                                </p>
                            </div>
                            <div>
                                <h3 className="mb-3 text-xl font-medium">Frontend teams</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Cut weeks from the design-implement-review loop. Designers edit
                                    the real components, engineers review the diff in GitHub.
                                </p>
                            </div>
                            <div>
                                <h3 className="mb-3 text-xl font-medium">Founders + small teams</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Iterate on UI as fast as you can on a whiteboard. Own the code
                                    from day one. No vendor lock-in.
                                </p>
                            </div>
                            <div>
                                <h3 className="mb-3 text-xl font-medium">Design system owners</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Your tokens, your components, your rules. The visual editor
                                    enforces the system instead of letting people drift around it.
                                </p>
                            </div>
                            <div>
                                <h3 className="mb-3 text-xl font-medium">Agencies</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Hand clients a real codebase, not a hosted page they have to
                                    migrate out of later. Ship custom React sites at the speed of
                                    drag-and-drop.
                                </p>
                            </div>
                            <div>
                                <h3 className="mb-3 text-xl font-medium">Solo product builders</h3>
                                <p className="text-foreground-secondary leading-relaxed">
                                    Move from concept to deployed page without leaving the canvas or
                                    babysitting a framework you'd rather not touch by hand.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Related reading */}
                <section className="border-foreground-primary/10 border-t px-4 py-20 sm:px-6 md:px-8">
                    <div className="mx-auto max-w-4xl">
                        <p className="text-foreground-tertiary mb-4 text-sm">Related reading</p>
                        <ul className="space-y-3 text-lg">
                            <li>
                                <Link
                                    href="/blog/best-visual-editor-react-2026"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Best visual editor for React in 2026 →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/blog/best-website-builder-2026"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Best website builder for 2026 →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/blog/visual-first-web-development"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Visual-first web development →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/features/builder"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Visual builder feature deep-dive →
                                </Link>
                            </li>
                        </ul>
                    </div>
                </section>

                <FAQSection
                    faqs={FAQS}
                    title={`Visual site builder\nFAQ`}
                    buttonText="See all FAQs"
                    buttonHref={Routes.FAQ}
                />

                <CTASection
                    href={Routes.PROJECTS}
                    ctaText={`Design with your real components.\nShip pull requests.`}
                    buttonText="Start building"
                />
            </main>
        </WebsiteLayout>
    );
}
