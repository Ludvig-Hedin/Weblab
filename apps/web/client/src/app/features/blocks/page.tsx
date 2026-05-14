'use client';

import { ChangelogGrid } from '../../_components/changelog-grid';
import { AiFeaturesHero } from '../../_components/hero/ai-features-hero';
import { AiFrontendHero } from '../../_components/hero/ai-frontend-hero';
import { BuilderFeaturesHero } from '../../_components/hero/builder-features-hero';
import { ClaudeCodeHero } from '../../_components/hero/claude-code-hero';
import { CodexHero } from '../../_components/hero/codex-hero';
import { FeaturesHero } from '../../_components/hero/features-hero';
import { UnicornBackground } from '../../_components/hero/unicorn-background';
import { ComparisonTeaserSection } from '../../_components/landing-page/comparison-teaser-section';
import { CTASection } from '../../_components/landing-page/cta-section';
import { DigitalSolutionsSection } from '../../_components/landing-page/digital-solutions-section';
import { FAQSection } from '../../_components/landing-page/faq-section';
import { ModelAgnosticSection } from '../../_components/landing-page/model-agnostic-section';
import { ResponsiveMockupSection } from '../../_components/landing-page/responsive-mockup-section';
import { ScrollingVelocitySection } from '../../_components/landing-page/scrolling-velocity-section';
import { TerminalSection } from '../../_components/landing-page/terminal-section';
import { UseCasesSection } from '../../_components/landing-page/use-cases-section';
import { WhatCanWeblabDoSectionV2 } from '../../_components/landing-page/what-can-weblab-do-section-v2';

function BlockLabel({ name, path }: { name: string; path: string }) {
    return (
        <div className="bg-background border-foreground-primary/10 sticky top-0 z-50 flex items-center justify-between border-b px-6 py-3">
            <div className="flex items-center gap-4 font-mono text-sm">
                <span className="text-foreground-primary font-semibold">{name}</span>
                <span className="text-foreground-tertiary">{path}</span>
            </div>
        </div>
    );
}

export default function BlocksPage() {
    return (
        <div className="min-h-screen">
            <div className="border-foreground-primary/10 bg-background border-b px-6 py-8">
                <h1 className="text-2xl font-semibold">Blocks</h1>
                <p className="text-foreground-secondary mt-1 text-sm">
                    All marketing sections. Localhost only.
                </p>
            </div>

            {/* UnicornBackground */}
            <BlockLabel
                name="UnicornBackground"
                path="app/_components/hero/unicorn-background.tsx"
            />
            <div className="relative h-[60vh] w-full overflow-hidden">
                <UnicornBackground />
            </div>

            {/* FeaturesHero */}
            <BlockLabel name="FeaturesHero" path="app/_components/hero/features-hero.tsx" />
            <div className="h-screen w-full">
                <FeaturesHero />
            </div>

            {/* ClaudeCodeHero */}
            <BlockLabel name="ClaudeCodeHero" path="app/_components/hero/claude-code-hero.tsx" />
            <div className="h-screen w-full">
                <ClaudeCodeHero />
            </div>

            {/* CodexHero */}
            <BlockLabel name="CodexHero" path="app/_components/hero/codex-hero.tsx" />
            <div className="h-screen w-full">
                <CodexHero />
            </div>

            {/* AiFeaturesHero */}
            <BlockLabel name="AiFeaturesHero" path="app/_components/hero/ai-features-hero.tsx" />
            <div className="h-screen w-full">
                <AiFeaturesHero />
            </div>

            {/* AiFrontendHero */}
            <BlockLabel name="AiFrontendHero" path="app/_components/hero/ai-frontend-hero.tsx" />
            <div className="h-screen w-full">
                <AiFrontendHero />
            </div>

            {/* BuilderFeaturesHero */}
            <BlockLabel
                name="BuilderFeaturesHero"
                path="app/_components/hero/builder-features-hero.tsx"
            />
            <div className="h-screen w-full">
                <BuilderFeaturesHero />
            </div>

            {/* ResponsiveMockupSection */}
            <BlockLabel
                name="ResponsiveMockupSection"
                path="app/_components/landing-page/responsive-mockup-section.tsx"
            />
            <ResponsiveMockupSection />

            {/* DigitalSolutionsSection */}
            <BlockLabel
                name="DigitalSolutionsSection"
                path="app/_components/landing-page/digital-solutions-section.tsx"
            />
            <DigitalSolutionsSection />

            {/* UseCasesSection */}
            <BlockLabel
                name="UseCasesSection"
                path="app/_components/landing-page/use-cases-section.tsx"
            />
            <UseCasesSection />

            {/* WhatCanWeblabDoSectionV2 */}
            <BlockLabel
                name="WhatCanWeblabDoSectionV2"
                path="app/_components/landing-page/what-can-weblab-do-section-v2.tsx"
            />
            <WhatCanWeblabDoSectionV2 />

            {/* ModelAgnosticSection */}
            <BlockLabel
                name="ModelAgnosticSection"
                path="app/_components/landing-page/model-agnostic-section.tsx"
            />
            <ModelAgnosticSection />

            {/* TerminalSection */}
            <BlockLabel
                name="TerminalSection"
                path="app/_components/landing-page/terminal-section.tsx"
            />
            <TerminalSection />

            {/* ScrollingVelocitySection */}
            <BlockLabel
                name="ScrollingVelocitySection"
                path="app/_components/landing-page/scrolling-velocity-section.tsx"
            />
            <ScrollingVelocitySection />

            {/* FAQSection */}
            <BlockLabel name="FAQSection" path="app/_components/landing-page/faq-section.tsx" />
            <FAQSection />

            {/* ChangelogGrid */}
            <BlockLabel name="ChangelogGrid" path="app/_components/changelog-grid.tsx" />
            <ChangelogGrid limit={4} />

            {/* CTASection */}
            <BlockLabel name="CTASection" path="app/_components/landing-page/cta-section.tsx" />
            <CTASection href="/projects" />

            {/* ComparisonTeaserSection */}
            <BlockLabel
                name="ComparisonTeaserSection"
                path="app/_components/landing-page/comparison-teaser-section.tsx"
            />
            <ComparisonTeaserSection />
        </div>
    );
}
