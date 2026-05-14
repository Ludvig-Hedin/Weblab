'use client';

import { CreateManagerProvider } from '@/components/store/create';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { Routes } from '@/utils/constants';
import { FeaturesHero } from '../_components/hero/features-hero';
import { BenefitsSection } from '../_components/landing-page/benefits-section';
import { CTASection } from '../_components/landing-page/cta-section';
import { FAQSection } from '../_components/landing-page/faq-section';
import { FeaturesGridSection } from '../_components/landing-page/features-grid-section';
import { FeaturesIntroSection } from '../_components/landing-page/features-intro-section';
import { ResponsiveMockupSection } from '../_components/landing-page/responsive-mockup-section';
import { WebsiteLayout } from '../_components/website-layout';
import { ComparisonMatrixSection } from '../compare/_components/comparison-matrix-section';

const featuresFaqs = [
    {
        question: 'What is Weblab?',
        answer: 'Weblab is a visual design canvas that connects to your existing codebase. Designers drag real components onto an infinite canvas, make changes visually, and submit pull requests — no coding required.',
    },
    {
        question: 'How is Weblab different from other design tools?',
        answer: 'Traditional design tools create static mockups that must be rebuilt in code. Weblab works with your real components — what you design IS the code. Changes become PRs, not handoff specs.',
    },
    {
        question: 'How is Weblab different from AI code generators?',
        answer: 'AI generators create new code from scratch. Weblab constrains AI to YOUR existing components, so outputs match your design system. No translation, no drift.',
    },
    {
        question: 'Do I need to know how to code?',
        answer: "No. Designers use a visual canvas with familiar tools. Real code runs underneath — you don't need to touch it unless you want to.",
    },
    {
        question: 'Can my team collaborate?',
        answer: 'Yes. Share your canvas, leave spatial comments, and work together in real-time. Changes sync to code and can be submitted as PRs for engineers to review.',
    },
    {
        question: 'What tech stack does Weblab support?',
        answer: 'React-based frameworks — Next.js, Vite, Remix, Astro, TanStack Start, and static HTML. Any CSS approach (Tailwind, CSS modules, styled-components, Emotion, SASS). Works with any React component library — shadcn/ui, Radix, Material UI, Mantine, Chakra UI, Ant Design.',
    },
    {
        question: 'What can the AI actually do inside Weblab?',
        answer: 'Beyond chat: generate and edit images, search the web for context (Exa), read and write files in your project, scrape URLs, run typecheck and error checks, and switch between Ask, Build, and Plan modes. Plan mode drafts the work before any edits land so you can review before code changes.',
    },
    {
        question: 'Which AI models can I use?',
        answer: 'Claude Opus 4.7, Sonnet 4.6, Haiku 4.5, GPT-5.5, Gemini 3.1 Pro/Flash, DeepSeek V4, Mistral Codestral, Moonshot Kimi, plus local models via Ollama. Switch any time. Dial reasoning effort from Fast to Deep.',
    },
];

export default function FeaturesPage() {
    return (
        <CreateManagerProvider>
            <WebsiteLayout showFooter={true}>
                {/* AI-Friendly Summary Section */}
                <section className="sr-only" aria-label="Features Summary">
                    <h2>Weblab Features: Design with Your Real Components</h2>
                    <p>
                        Weblab is a visual design canvas that connects to your existing codebase.
                        Design with your real components on an infinite canvas. AI is constrained to
                        your design system — no brand drift, no throwaway code. Changes become
                        mergeable pull requests.
                    </p>
                    <h3>Key Features</h3>
                    <ul>
                        <li>
                            Your Real Components — design with the buttons, cards, and layouts your
                            engineers built
                        </li>
                        <li>
                            AI constrained to your design system — uses your colors, fonts, and
                            tokens
                        </li>
                        <li>
                            Multi-provider AI — Claude Opus 4.7, GPT-5.5, Gemini 3.1 Pro, DeepSeek,
                            Mistral, or local Ollama
                        </li>
                        <li>
                            Reasoning effort control — dial AI from Fast to Deep depending on the
                            task
                        </li>
                        <li>
                            Ask, Build, and Plan modes — review the AI's plan before any code
                            changes land
                        </li>
                        <li>
                            AI tools — image generation and editing, web search (Exa), file
                            read/write, URL scraping, typecheck
                        </li>
                        <li>
                            Website clone — recreate any site from a URL or screenshot as an
                            editable React or static HTML project
                        </li>
                        <li>
                            Frame breakpoints — design responsive layouts per frame, classes rebase
                            automatically
                        </li>
                        <li>
                            Restore last position — editor reopens with last frame and selection
                        </li>
                        <li>Built for Teams — real-time collaboration with spatial comments</li>
                        <li>Ship PRs, Not Prototypes — changes become mergeable pull requests</li>
                        <li>Canvas manipulation — drag, resize, arrange elements visually</li>
                        <li>Layer management — navigate your React component tree visually</li>
                        <li>Version history — roll back to any previous version</li>
                        <li>
                            Works with your codebase — Next.js, Vite, Remix, Astro, TanStack Start,
                            static HTML
                        </li>
                        <li>
                            Direct GitHub integration — push changes directly to your repository
                        </li>
                        <li>
                            Pairs with Claude Code via MCP — visual canvas + agent on the same
                            project
                        </li>
                    </ul>
                </section>

                <div className="flex w-full items-center justify-center pt-20 pb-10 md:pt-24 md:pb-12" id="hero">
                    <FeaturesHero />
                </div>
                <ResponsiveMockupSection />
                <BenefitsSection />
                <FeaturesIntroSection />
                <FeaturesGridSection />
                <ComparisonMatrixSection />
                <FAQSection faqs={featuresFaqs} />
                <CTASection
                    ctaText={`Ready to stop rebuilding?`}
                    buttonText="Get Started"
                    href={Routes.PROJECTS}
                />
                <NonProjectSettingsModal />
                <SubscriptionModal />
            </WebsiteLayout>
        </CreateManagerProvider>
    );
}
