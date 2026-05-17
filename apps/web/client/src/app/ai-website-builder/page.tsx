import Link from 'next/link';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';
import { CTASection } from '../_components/landing-page/cta-section';
import { FAQSection } from '../_components/landing-page/faq-section';
import { WebsiteLayout } from '../_components/website-layout';

const FAQS = [
    {
        question: `What does AI website builder mean in ${APP_NAME}?`,
        answer: `An AI assistant that builds and edits your website inside the canvas. In ${APP_NAME} the AI is constrained to your real React components, your design tokens, and your existing routes. It doesn't generate a new app from scratch — it modifies the codebase you already own.`,
    },
    {
        question: `How is this different from Lovable, Bolt, or v0?`,
        answer: `Those tools generate a new app from a prompt. The output is a fresh project on their platform. ${APP_NAME} works on your existing repo. The AI reads your components and writes diffs against them as pull requests — your engineers review the change in GitHub like any other PR.`,
    },
    {
        question: `Which AI models can I use?`,
        answer: `Claude Opus, Sonnet, Haiku; GPT-5.5; Gemini Pro; DeepSeek; Mistral Codestral; or your local Ollama. You can also bring your own API key. Reasoning effort is tunable from fast to deep per request.`,
    },
    {
        question: `Does the AI invent new components?`,
        answer: `Not by default. It is constrained to the components and tokens already in your design system. If you explicitly ask for a new one, it scaffolds it in the same style as your existing components and writes the matching token entries.`,
    },
    {
        question: `Can the AI write tests and migrations?`,
        answer: `It can write component tests, snapshot tests, and visual regression specs alongside the change. For schema migrations, it proposes the migration file and the corresponding code change in a single PR, but you review and run the migration yourself.`,
    },
    {
        question: `Where does the AI run?`,
        answer: `In the hosted cloud version, the AI runs in our infrastructure with the provider you choose. In the self-hosted version, the AI talks directly to the provider's API using your key — nothing routes through us.`,
    },
    {
        question: `Is the AI website builder free?`,
        answer: `Free tier with daily message limits. Paid Pro tiers from $25/month for higher limits, with eleven pricing tiers up to enterprise. Self-hosted is free with your own API key.`,
    },
    {
        question: `Can I review what the AI did before merging?`,
        answer: `Yes — every AI change is a git diff. You see the PR in GitHub, with proper file-by-file review, comments, CI checks, and merge controls. If the AI got it wrong, you reject the PR like any other.`,
    },
];

export default function AiWebsiteBuilderPage() {
    return (
        <WebsiteLayout showFooter={true}>
            <section className="sr-only" aria-label="AI Website Builder Summary">
                <h2>{APP_NAME}: AI Website Builder for React and Next.js Codebases</h2>
                <p>
                    {APP_NAME} is an AI website builder for teams that already have a React or
                    Next.js codebase. The AI is constrained to your real components and design
                    tokens. Every change ships as a pull request reviewable in GitHub. Bring your
                    own model — Claude, GPT, Gemini, DeepSeek, Mistral, or local Ollama. Open source
                    and self-hostable.
                </p>
            </section>

            <main className="text-foreground-primary bg-background">
                {/* Hero */}
                <section className="px-4 pt-32 pb-24 sm:px-6 md:px-8 md:pt-40 md:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <p className="text-foreground-tertiary mb-6 text-xs font-medium">
                            AI Website Builder
                        </p>
                        <h1 className="mb-8 max-w-4xl text-5xl leading-[1.05] font-light text-balance md:text-7xl">
                            AI website builder for the codebase you already own
                        </h1>
                        <p className="text-foreground-secondary mb-12 max-w-2xl text-lg md:text-xl">
                            Most AI website builders regenerate a new app from a prompt. {APP_NAME}{' '}
                            edits your real React components, respects your design tokens, and
                            writes every change as a pull request to your GitHub repo.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild size="lg">
                                <Link href={Routes.PROJECTS}>Try the AI builder</Link>
                            </Button>
                            <Button asChild size="lg" variant="secondary">
                                <Link href={Routes.FEATURES_AI}>See AI features</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* What's different */}
                <section className="border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-4xl">
                        <h2 className="mb-10 text-4xl font-light md:text-5xl">
                            Constrained AI, not generative chaos
                        </h2>
                        <div className="space-y-6 text-lg leading-relaxed">
                            <p className="text-foreground-secondary">
                                Generative AI website builders sound magical and ship slop. The
                                model invents a new button, a new spacing scale, a new color, a new
                                component name. You end up with a tree of orphan code that ignores
                                everything your team already built.
                            </p>
                            <p className="text-foreground-secondary">
                                {APP_NAME} reverses that contract. The AI sees your existing
                                components, your tokens, your conventions. It is graded on whether
                                the change fits your system — not on whether it generates the
                                fanciest thing.
                            </p>
                            <p className="text-foreground-secondary">
                                The output is a git diff. Your engineers review it. Bad diffs get
                                rejected like any other PR. Good ones merge and ship.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Capabilities */}
                <section className="bg-foreground-primary/[0.02] border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-6xl">
                        <h2 className="mb-16 text-4xl font-light md:text-5xl">What the AI does</h2>
                        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                            {[
                                [
                                    'Design system aware edits',
                                    'AI knows your tokens and your component library. Asks for the "primary button" and gets your `<Button variant="primary">` — not a fresh `<button>` styled from memory.',
                                ],
                                [
                                    'Page-level composition',
                                    'Generate a new page or section from a prompt. The AI assembles it from components that already exist in your repo, wires up routes, and writes the file in the correct App Router location.',
                                ],
                                [
                                    'Refactors against real code',
                                    'Rename props, extract a component, change a token. The AI rewrites every call site and ships a single mergeable PR.',
                                ],
                                [
                                    'Visual edits, code source-of-truth',
                                    'Designers move things on the canvas. Engineers see the diff. The two stay in lockstep because both views read the same JSX.',
                                ],
                                [
                                    'Multi-model, your choice',
                                    'Claude, GPT, Gemini, DeepSeek, Mistral, or local Ollama. Switch per project. Bring your own API key in self-host mode.',
                                ],
                                [
                                    'Reasoning effort dial',
                                    'Fast for "tighten this spacing", deep for "rewire auth across five routes". Pay only for the depth you need.',
                                ],
                            ].map(([title, body]) => (
                                <div key={title}>
                                    <h3 className="mb-3 text-2xl font-light">{title}</h3>
                                    <p className="text-foreground-secondary leading-relaxed">
                                        {body}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Comparison */}
                <section className="border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="mb-12 text-4xl font-light md:text-5xl">
                            How it compares to other AI builders
                        </h2>
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
                                            Generative AI builders
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {[
                                        [
                                            'Starting point',
                                            'Your existing React/Next.js repo',
                                            'A blank canvas + a prompt',
                                        ],
                                        [
                                            'Output',
                                            'PR to your GitHub repo',
                                            'New hosted app on the vendor',
                                        ],
                                        [
                                            'Design system',
                                            'AI is constrained to your tokens and components',
                                            'AI invents components and styles each time',
                                        ],
                                        [
                                            'Code ownership',
                                            'Lives in your repo from day one',
                                            'Lives on the vendor — export is an escape hatch',
                                        ],
                                        [
                                            'Model choice',
                                            'Claude, GPT, Gemini, DeepSeek, Mistral, local Ollama',
                                            'Usually one model, vendor-chosen',
                                        ],
                                        [
                                            'Engineer review surface',
                                            'GitHub PR with CI, comments, file-by-file',
                                            'Generated chat thread + preview',
                                        ],
                                        ['Self-host', 'Yes — open source', 'No'],
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
                                href="/compare/lovable"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Lovable →
                            </Link>
                            <Link
                                href="/compare/bolt"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Bolt →
                            </Link>
                            <Link
                                href="/compare/v0"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs v0 →
                            </Link>
                            <Link
                                href="/compare/claude-code"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Claude Code →
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

                {/* Related */}
                <section className="border-foreground-primary/10 border-t px-4 py-20 sm:px-6 md:px-8">
                    <div className="mx-auto max-w-4xl">
                        <p className="text-foreground-tertiary mb-4 text-sm">Related reading</p>
                        <ul className="space-y-3 text-lg">
                            <li>
                                <Link
                                    href="/blog/best-ai-design-tools-2026"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Best AI design tools in 2026 →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/blog/ai-learns-your-design-system"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    How AI learns your design system →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/blog/shipping-faster-with-ai"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Shipping faster with AI →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/features/ai-for-frontend"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    AI for frontend feature page →
                                </Link>
                            </li>
                        </ul>
                    </div>
                </section>

                <FAQSection
                    faqs={FAQS}
                    title={`AI website builder\nFAQ`}
                    buttonText="See all FAQs"
                    buttonHref={Routes.FAQ}
                />

                <CTASection
                    href={Routes.PROJECTS}
                    ctaText={`Constrained AI.\nReviewable diffs.`}
                    buttonText="Try the AI builder"
                />
            </main>
        </WebsiteLayout>
    );
}
