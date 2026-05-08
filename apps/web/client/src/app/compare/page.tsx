import Link from 'next/link';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

import { CTASection } from '../_components/landing-page/cta-section';
import { WebsiteLayout } from '../_components/website-layout';
import { ComparisonMatrixSection } from './_components/comparison-matrix-section';

const competitors = [
    {
        slug: 'lovable',
        name: 'Lovable',
        tagline: 'Chat-based AI app builder',
        oneLiner: `${APP_NAME} works with your existing React codebase and ships PRs. Lovable creates new apps from prompts.`,
    },
    {
        slug: 'bolt',
        name: 'Bolt',
        tagline: 'In-browser AI full-stack builder',
        oneLiner: `${APP_NAME} pairs an infinite design canvas with your real components. Bolt builds new apps end-to-end from a chat.`,
    },
    {
        slug: 'v0',
        name: 'v0 by Vercel',
        tagline: 'AI component generator',
        oneLiner: `${APP_NAME} edits your existing components on a canvas. v0 generates new component snippets from prompts.`,
    },
    {
        slug: 'webflow',
        name: 'Webflow',
        tagline: 'No-code visual website builder',
        oneLiner: `${APP_NAME} edits your real React codebase and ships PRs. Webflow generates its own HTML/CSS in a no-code environment.`,
    },
    {
        slug: 'framer',
        name: 'Framer',
        tagline: 'Design-first site builder with AI',
        oneLiner: `${APP_NAME} connects to your existing codebase and ships PRs. Framer builds sites in its own hosted environment.`,
    },
    {
        slug: 'replit',
        name: 'Replit',
        tagline: 'Browser IDE with AI agent',
        oneLiner: `${APP_NAME} is a visual canvas for existing React codebases. Replit is a cloud IDE where an AI agent builds and deploys apps from prompts.`,
    },
    {
        slug: 'claude-code',
        name: 'Claude Code',
        tagline: "Anthropic's AI terminal CLI",
        oneLiner: `${APP_NAME} gives designers a visual canvas; Claude Code gives engineers an AI terminal. They are complementary.`,
    },
    {
        slug: 'emergent',
        name: 'Emergent',
        tagline: 'Multi-agent AI full-stack app builder',
        oneLiner: `${APP_NAME} edits an existing React codebase visually. Emergent builds full-stack apps from scratch via a multi-agent system.`,
    },
    {
        slug: 'wix',
        name: 'Wix',
        tagline: 'Small-business website builder',
        oneLiner: `${APP_NAME} is for engineering teams with React codebases. Wix is for small businesses who want a website without code.`,
    },
    {
        slug: 'one-com',
        name: 'one.com',
        tagline: 'Budget hosting and website builder',
        oneLiner: `${APP_NAME} is a developer tool for React teams. one.com is a budget host for individuals who want a simple website.`,
    },
    {
        slug: 'onlook',
        name: 'Onlook',
        tagline: 'Open-source visual editor for React',
        oneLiner: `${APP_NAME} extends the same foundations with workflows, AI integrations, and team collaboration.`,
    },
];

export default function CompareIndexPage() {
    return (
        <WebsiteLayout showFooter={true}>
            <section className="sr-only" aria-label="Compare Weblab to AI design tools">
                <p>
                    Compare {APP_NAME} to Lovable, Bolt, v0, Webflow, Framer, Replit, Claude Code,
                    Emergent, Wix, one.com, and Onlook — pick the right tool for your team.
                </p>
            </section>

            <main className="bg-background text-foreground-primary">
                <section className="bg-black py-40">
                    <div className="mx-auto max-w-6xl px-8">
                        <h1 className="mb-8 text-5xl leading-tight font-light md:text-6xl">
                            {APP_NAME} vs everyone else
                        </h1>
                        <p className="text-foreground-secondary max-w-2xl text-lg md:text-xl">
                            Most AI design tools generate new code from scratch. {APP_NAME} edits
                            your real React components on a visual canvas and ships pull requests
                            engineers can merge.
                        </p>
                        <div className="mt-12">
                            <Button asChild>
                                <Link href="/projects">Try {APP_NAME}</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                <ComparisonMatrixSection />

                <section className="border-foreground-tertiary/10 border-t py-32">
                    <div className="mx-auto max-w-6xl px-8">
                        <h2 className="mb-16 text-4xl font-light md:text-5xl">Pick a comparison</h2>
                        <ul className="grid gap-6 md:grid-cols-2">
                            {competitors.map((c) => (
                                <li key={c.slug}>
                                    <Link
                                        href={`/compare/${c.slug}`}
                                        className="border-foreground-tertiary/30 hover:border-foreground-primary/60 group block rounded border p-8 transition-colors"
                                    >
                                        <p className="text-foreground-tertiary mb-2 text-sm tracking-wide uppercase">
                                            {c.tagline}
                                        </p>
                                        <h3 className="mb-3 text-2xl font-light md:text-3xl">
                                            {APP_NAME} vs {c.name}
                                        </h3>
                                        <p className="text-foreground-secondary text-base">
                                            {c.oneLiner}
                                        </p>
                                        <p className="text-foreground-primary mt-4 text-sm">
                                            Read the comparison →
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <CTASection
                    href="/projects"
                    ctaText={`See for yourself.\nOpen ${APP_NAME} on your repo.`}
                    buttonText="Get Started"
                />
            </main>
        </WebsiteLayout>
    );
}
