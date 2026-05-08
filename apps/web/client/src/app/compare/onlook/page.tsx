import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'Onlook',
    competitorSlug: 'onlook',
    competitorTagline: 'Open-source visual editor for React',
    heroTitle: `Looking for an Onlook alternative? Try ${APP_NAME}.`,
    heroSubtitle: `${APP_NAME} is a visual editor for React built on the same open-source foundations as Onlook (Apache 2.0), extended with new workflows for Claude Code and vibe coding, design-system-aware AI, and team collaboration.`,
    summary: {
        competitorIs:
            'an open-source visual editor for React. Onlook pioneered the idea of designing on a canvas with real components and writing changes back to code.',
        weblabIs: `a continuation built on the same Apache 2.0 foundations, with additional workflows, deeper design-system constraints, and a focus on teams shipping pull requests on a real product.`,
        recommendation: `If you have been using or evaluating Onlook and want active development, expanded AI workflows, and team collaboration features, ${APP_NAME} is the natural next step.`,
    },
    comparisonRows: [
        {
            feature: 'Foundation',
            weblab: 'Apache-2.0 fork of Onlook',
            competitor: 'Apache-2.0 original',
        },
        {
            feature: 'Editing surface',
            weblab: 'Infinite canvas with your real components',
            competitor: 'Visual editor with real components',
        },
        {
            feature: 'AI workflow',
            weblab: 'AI constrained to your design system; Claude Code & vibe-coding workflows',
            competitor: 'AI editing surface',
        },
        {
            feature: 'Output',
            weblab: 'Pull request to your GitHub repository',
            competitor: 'Code changes in your project',
        },
        {
            feature: 'Team collaboration',
            weblab: 'Shared canvas, real-time editing, spatial comments',
            competitor: 'Single-user editing',
        },
        {
            feature: 'Frameworks',
            weblab: 'React, Next.js (Babel JSX/TSX parser)',
            competitor: 'React',
        },
        {
            feature: 'Hosted version',
            weblab: 'weblab.build + desktop apps',
            competitor: 'Self-hosted',
        },
        {
            feature: 'License',
            weblab: 'Apache 2.0 (with attribution to Onlook)',
            competitor: 'Apache 2.0',
        },
    ],
    differences: [
        {
            title: 'Active product, not just a project',
            body: `${APP_NAME} is shipped as a maintained product with regular releases on the web and desktop. The core editor is the same lineage as Onlook, with active development on integrations, AI workflows, and the design surface.`,
        },
        {
            title: 'Design-system-aware AI',
            body: `${APP_NAME} constrains AI to your real design tokens and components. The AI cannot invent new buttons or colors — it only uses what already exists in your codebase. That keeps outputs on-brand and mergeable.`,
        },
        {
            title: 'Workflows for Claude Code and vibe coding',
            body: `${APP_NAME} ships first-class workflows for pairing with Claude Code and vibe-coding tools — adding a visual canvas layer to AI-built UIs and giving design teams a way to collaborate on the output.`,
        },
        {
            title: 'Built for teams',
            body: `${APP_NAME} treats team collaboration as the primary use case: a shared canvas, spatial comments, and review-friendly pull requests. Designers and engineers can work side by side on the same React codebase.`,
        },
        {
            title: 'Attribution and licensing',
            body: `${APP_NAME} respects Onlook’s Apache 2.0 license and preserves attribution to On Off, Inc. — see the LICENSE file in the repository for details.`,
        },
    ],
    chooseCompetitorIf: [
        'You want to use the original upstream project',
        'You only need a self-hosted single-user editor',
        'You do not need design-system-constrained AI or team workflows',
    ],
    chooseWeblabIf: [
        'You want active development and product support',
        'You want AI that is constrained to your real design system',
        'You want first-class Claude Code and vibe-coding workflows',
        'You want shared canvas + spatial comments for your team',
        'You prefer a hosted experience with optional desktop apps',
    ],
    faqs: [
        {
            q: `Is ${APP_NAME} a fork of Onlook?`,
            a: `${APP_NAME} is built on the same Apache 2.0 foundations as Onlook, with attribution to the original Onlook team (On Off, Inc.) preserved in the repository. It extends those foundations with new workflows, AI features, and team collaboration.`,
        },
        {
            q: `Can I migrate an Onlook project to ${APP_NAME}?`,
            a: `${APP_NAME} works directly against your React codebase, so there is no project lock-in to migrate. Point ${APP_NAME} at the same repository you used with Onlook and you can keep going.`,
        },
        {
            q: `Is ${APP_NAME} open source?`,
            a: `Yes. The ${APP_NAME} repository is at github.com/Ludvig-Hedin/Weblab. ${APP_NAME} is Apache-2.0 licensed and respects the original Onlook attribution.`,
        },
        {
            q: 'Why fork Onlook in the first place?',
            a: `${APP_NAME} extends Onlook’s vision in a specific direction: design-system-aware AI, Claude Code and vibe-coding workflows, and team collaboration on a shared canvas. The fork model lets us move quickly on those areas while preserving compatibility with the upstream foundations.`,
        },
    ],
};

export default function CompareOnlookPage() {
    return <ComparisonPage content={content} />;
}
