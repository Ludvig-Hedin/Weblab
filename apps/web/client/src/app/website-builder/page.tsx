import Link from 'next/link';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';
import { CTASection } from '../_components/landing-page/cta-section';
import { FAQSection } from '../_components/landing-page/faq-section';
import { WebsiteLayout } from '../_components/website-layout';

const FAQS = [
    {
        question: `What is the best website builder for developers?`,
        answer: `For developers who already write React or Next.js, the best website builder is one that works on your real codebase instead of a walled-garden editor. ${APP_NAME} is a website builder that reads your components, lets you design on a visual canvas, and ships every change as a pull request to your GitHub repo — so you keep the code, the hosting, and the design system you already have.`,
    },
    {
        question: `How is ${APP_NAME} different from Wix, Squarespace, or Webflow?`,
        answer: `Wix, Squarespace, and Webflow host your site on their platform and generate their own markup. ${APP_NAME} works on a React or Next.js codebase you own. The output is code in your repo — reviewable as a PR, deployable anywhere. You're never locked into a proprietary editor or host.`,
    },
    {
        question: `Can I use ${APP_NAME} as a no-code website builder?`,
        answer: `Designers can work entirely on the visual canvas without writing code — drag components, adjust spacing, change tokens. Real code runs underneath. Unlike pure no-code tools, the result is a clean React codebase your engineers can extend by hand whenever they want.`,
    },
    {
        question: `Is ${APP_NAME} a free website builder?`,
        answer: `${APP_NAME} is open source and free to self-host. The hosted cloud version has a free tier with daily limits and paid Pro tiers from $25/month up to enterprise. See the pricing page for the full grid.`,
    },
    {
        question: `What can I build with ${APP_NAME}?`,
        answer: `Marketing sites, landing pages, dashboards, web apps, design systems, and component libraries — anything you'd build in React or Next.js. ${APP_NAME} is a website builder for production codebases, not just static brochure pages.`,
    },
    {
        question: `Do I need to know how to code to use ${APP_NAME}?`,
        answer: `No. The visual canvas uses familiar design tools. But because the output is real code, a developer can step in at any point. It's built for designer + engineer teams working on the same artifact.`,
    },
    {
        question: `Which frameworks does ${APP_NAME} support?`,
        answer: `React and Next.js today, with any CSS approach (Tailwind, CSS modules, styled-components) and any component library (shadcn/ui, Material UI, Chakra, Radix). Vite, Remix, Astro, and TanStack Start support is rolling out.`,
    },
    {
        question: `Who owns the website I build?`,
        answer: `You do. The code lives in your repository from the first edit. Export it, push to GitHub, deploy to Railway, Vercel, or your own infrastructure. No lock-in.`,
    },
];

export default function WebsiteBuilderPage() {
    return (
        <WebsiteLayout showFooter={true}>
            {/* sr-only summary for AI/answer engines */}
            <section className="sr-only" aria-label="Website Builder Summary">
                <h2>{APP_NAME}: Website Builder for Teams Who Own a Codebase</h2>
                <p>
                    {APP_NAME} is a website builder for React and Next.js teams. Instead of a
                    walled-garden editor, it works on the codebase you already own: design on a
                    visual canvas with your real components, let AI assist within your design
                    system, and ship every change as a pull request to GitHub. Open source and free
                    to self-host. Marketing sites, web apps, dashboards, and design systems — all in
                    real code you keep.
                </p>
            </section>

            <main className="text-foreground-primary bg-background">
                {/* Hero */}
                <section className="px-4 pt-32 pb-24 sm:px-6 md:px-8 md:pt-40 md:pb-32">
                    <div className="mx-auto max-w-6xl">
                        <p className="text-foreground-tertiary mb-6 text-xs font-medium tracking-widest uppercase">
                            Website Builder
                        </p>
                        <h1 className="mb-8 max-w-4xl text-5xl leading-[1.05] font-light text-balance md:text-7xl">
                            The website builder for teams who own a codebase
                        </h1>
                        <p className="text-foreground-secondary mb-12 max-w-2xl text-lg md:text-xl">
                            Most website builders trap your site inside their platform.{' '}
                            {APP_NAME} is different: a visual canvas, real React components, AI
                            assistance, and pull-request output — on the codebase you already own.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild size="lg">
                                <Link href={Routes.PROJECTS}>Start building</Link>
                            </Button>
                            <Button asChild size="lg" variant="secondary">
                                <Link href={Routes.PRICING}>See pricing</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                {/* The problem */}
                <section className="border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-4xl">
                        <h2 className="mb-10 text-4xl font-light md:text-5xl">
                            Most website builders make you choose
                        </h2>
                        <div className="space-y-6 text-lg leading-relaxed">
                            <p className="text-foreground-secondary">
                                Drag-and-drop builders are fast but lock you in: proprietary markup,
                                proprietary hosting, no real components, no git. The moment you
                                outgrow them, you're rebuilding from scratch in code.
                            </p>
                            <p className="text-foreground-secondary">
                                Code is powerful but slow to iterate on visually — every spacing
                                tweak is a round trip through an editor, a dev server, and a review.
                            </p>
                            <p className="text-foreground-secondary">
                                {APP_NAME} removes the trade-off. You get drag-and-drop speed on a
                                visual canvas, and the output is real code in your repo. Design fast,
                                own everything.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Three pillars */}
                <section className="bg-foreground-primary/[0.02] border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-6xl">
                        <h2 className="mb-16 text-4xl font-light md:text-5xl">
                            One builder, three ways to work
                        </h2>
                        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
                            <div>
                                <h3 className="mb-3 text-2xl font-light">Visual</h3>
                                <p className="text-foreground-secondary mb-4 leading-relaxed">
                                    Drag your real components onto an infinite canvas. Adjust
                                    spacing, swap variants, edit tokens — all visually, all backed
                                    by code.
                                </p>
                                <Link
                                    href="/visual-site-builder"
                                    className="text-foreground-secondary hover:text-foreground-primary text-sm underline underline-offset-4 transition-colors"
                                >
                                    Visual site builder →
                                </Link>
                            </div>
                            <div>
                                <h3 className="mb-3 text-2xl font-light">AI</h3>
                                <p className="text-foreground-secondary mb-4 leading-relaxed">
                                    Describe the change. AI edits your real components within your
                                    design system and writes a clean diff — never generative slop.
                                </p>
                                <Link
                                    href="/ai-website-builder"
                                    className="text-foreground-secondary hover:text-foreground-primary text-sm underline underline-offset-4 transition-colors"
                                >
                                    AI website builder →
                                </Link>
                            </div>
                            <div>
                                <h3 className="mb-3 text-2xl font-light">Code</h3>
                                <p className="text-foreground-secondary mb-4 leading-relaxed">
                                    Drop into the code whenever you want. Canvas and code stay in
                                    sync because both read the same JSX. Ship as a GitHub pull
                                    request.
                                </p>
                                <Link
                                    href={Routes.FEATURES_BUILDER}
                                    className="text-foreground-secondary hover:text-foreground-primary text-sm underline underline-offset-4 transition-colors"
                                >
                                    Visual builder features →
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Comparison */}
                <section className="border-foreground-primary/10 border-t px-4 py-24 sm:px-6 md:px-8 md:py-32">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="mb-12 text-4xl font-light md:text-5xl">
                            {APP_NAME} vs traditional website builders
                        </h2>
                        <div className="border-foreground-primary/10 overflow-x-auto rounded-lg border">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-foreground-primary/10 bg-foreground-primary/[0.03] border-b">
                                        <th className="px-6 py-4 text-sm font-normal tracking-widest uppercase">
                                            Capability
                                        </th>
                                        <th className="text-foreground-primary px-6 py-4 text-sm font-normal tracking-widest uppercase">
                                            {APP_NAME}
                                        </th>
                                        <th className="text-foreground-tertiary px-6 py-4 text-sm font-normal tracking-widest uppercase">
                                            Wix / Squarespace / Webflow
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {[
                                        [
                                            'Output',
                                            'Real React/Next.js code in your repo',
                                            'Proprietary markup on the vendor',
                                        ],
                                        [
                                            'Hosting',
                                            'Anywhere — Railway, Vercel, your VPS',
                                            'Locked to the platform',
                                        ],
                                        [
                                            'Components',
                                            'Your real design system',
                                            'The platform’s generic blocks',
                                        ],
                                        [
                                            'Version control',
                                            'Native git + pull requests',
                                            'None / proprietary history',
                                        ],
                                        [
                                            'AI assistance',
                                            'Constrained to your components',
                                            'Generic template generation',
                                        ],
                                        [
                                            'Extensibility',
                                            'Full code access, any npm package',
                                            'Plugin marketplace limits',
                                        ],
                                        [
                                            'Lock-in',
                                            'None — you own the code',
                                            'High — export is an escape hatch',
                                        ],
                                        [
                                            'Open source',
                                            'Yes — self-host free',
                                            'No',
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
                                href="/compare/wix"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Wix →
                            </Link>
                            <Link
                                href="/compare/framer"
                                className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                            >
                                {APP_NAME} vs Framer →
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

                {/* Related reading */}
                <section className="border-foreground-primary/10 border-t px-4 py-20 sm:px-6 md:px-8">
                    <div className="mx-auto max-w-4xl">
                        <p className="text-foreground-tertiary mb-4 text-sm tracking-widest uppercase">
                            Related reading
                        </p>
                        <ul className="space-y-3 text-lg">
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
                                    href="/blog/best-visual-editor-react-2026"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Best visual editor for React in 2026 →
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/blog/best-ai-design-tools-2026"
                                    className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-4 transition-colors"
                                >
                                    Best AI design tools in 2026 →
                                </Link>
                            </li>
                        </ul>
                    </div>
                </section>

                <FAQSection
                    faqs={FAQS}
                    title={`Website builder\nFAQ`}
                    buttonText="See all FAQs"
                    buttonHref={Routes.FAQ}
                />

                <CTASection
                    href={Routes.PROJECTS}
                    ctaText={`Build on a real codebase.\nShip pull requests.`}
                    buttonText="Start building"
                />
            </main>
        </WebsiteLayout>
    );
}
