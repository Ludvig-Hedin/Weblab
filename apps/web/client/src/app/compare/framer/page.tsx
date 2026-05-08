import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'Framer',
    competitorSlug: 'framer',
    competitorTagline: 'Design-first site builder with AI',
    heroTitle: `${APP_NAME} vs Framer: edit your codebase or build on Framer's platform`,
    heroSubtitle: `Framer is a beautiful site builder loved by designers, with AI layout generation and fast Framer hosting. ${APP_NAME} connects to your existing React codebase, gives designers an infinite canvas on top of real components, and ships every change as a pull request.`,
    summary: {
        competitorIs:
            "a design-first website builder. You create pages inside Framer's editor, use Framer's own React-based component system, and publish to Framer's hosting. AI tools help generate layouts from prompts. Code export is available but limited in portability.",
        weblabIs: `a visual editor for your existing React codebase. ${APP_NAME} reads your real components and design tokens, lets designers and engineers edit together on an infinite canvas, and writes changes back to your repository as pull requests — using your file structure, your naming conventions, and your design system.`,
        recommendation: `If you are building a new marketing site or landing page and want Framer's polished AI-assisted design workflow with instant publishing, Framer is excellent. If your team has an existing React product and wants design changes to flow through code review as PRs, ${APP_NAME} is built for that workflow.`,
    },
    comparisonRows: [
        {
            feature: 'Input',
            weblab: 'Your existing React / Next.js codebase',
            competitor: "Framer's own editor and component system",
        },
        {
            feature: 'Output',
            weblab: 'Pull request to your GitHub repository (JSX/TSX)',
            competitor: 'Framer-hosted site; limited code export',
        },
        {
            feature: 'React',
            weblab: 'Native — edits your real React components',
            competitor: 'Built on React internally, but not your React codebase',
        },
        {
            feature: 'Design system',
            weblab: 'AI constrained to your existing tokens, components, and styles',
            competitor: "Framer's own component library; no import of your tokens",
        },
        {
            feature: 'AI capabilities',
            weblab: 'AI edits constrained to your design system to prevent drift',
            competitor: 'AI Wireframer, AI Workshop, AI translation (layout-gen focus)',
        },
        {
            feature: 'Hosting',
            weblab: 'Your existing deployment (Vercel, AWS, etc.)',
            competitor: 'Framer hosting (CDN, custom domains)',
        },
        {
            feature: 'Collaboration',
            weblab: 'Designers and engineers on the same canvas with PR review',
            competitor: 'Real-time co-editing within Framer',
        },
        {
            feature: 'CMS',
            weblab: 'Bring your own (Contentful, Sanity, Next.js MDX, etc.)',
            competitor: 'Framer CMS built-in',
        },
        {
            feature: 'Open source',
            weblab: 'Yes',
            competitor: 'No',
        },
        {
            feature: 'Pricing',
            weblab: 'Free to open source; paid plans for teams',
            competitor: 'From $10/month (Basic) to $100/month (Scale), billed annually',
        },
    ],
    differences: [
        {
            title: "Your design system vs Framer's design system",
            body: `Framer has its own component library and style system. You cannot import your existing Button, Input, or Card components from your codebase into Framer. ${APP_NAME} reads your real components, so the AI and your designers always work with the same primitives your engineers ship.`,
        },
        {
            title: 'Pull requests vs Framer publish',
            body: `When you make a change in Framer, you publish to Framer hosting. When you make a change in ${APP_NAME}, you get a pull request in your GitHub repository. Your engineers see a normal PR, run CI, and merge — the same workflow as any other code change.`,
        },
        {
            title: 'Design-first vs design-and-engineering',
            body: `Framer is optimized for designers working independently on standalone sites. ${APP_NAME} is optimized for mixed design-engineering teams working on a shared product codebase. Designers get a visual canvas; engineers get a PR they can review and merge.`,
        },
        {
            title: 'AI that drifts vs AI that stays in-system',
            body: `Framer's AI tools generate new layouts and wireframes using Framer's component palette. ${APP_NAME}'s AI is constrained to your existing codebase — it can only use the components, colors, and spacing that already exist in your design system. That prevents brand drift and keeps every AI-generated change mergeable.`,
        },
    ],
    chooseCompetitorIf: [
        'You are building a new marketing site or landing page from scratch',
        "You want Framer's beautiful motion and animation tools",
        'Your designer works independently without a shared React codebase',
        'You need quick publishing to Framer hosting without engineering involvement',
        "You are comfortable with Framer's ecosystem and pricing",
    ],
    chooseWeblabIf: [
        'You have an existing React or Next.js product codebase',
        'Design changes need to go through your GitHub PR workflow',
        'Designers and engineers share a component library and design tokens',
        'You want AI assistance constrained to your design system',
        'You deploy to your own infrastructure, not Framer hosting',
    ],
    faqs: [
        {
            q: `Is ${APP_NAME} better than Framer for React teams?`,
            a: `For teams with existing React codebases, ${APP_NAME} is a fundamentally different tool — it connects to your repo and ships PRs, while Framer builds in its own environment. For standalone marketing sites or landing pages with a designer-led workflow, Framer is excellent. For product teams with a shared codebase, ${APP_NAME} integrates with your engineering process.`,
        },
        {
            q: 'Does Framer work with an existing React codebase?',
            a: `Framer does not import or connect to external React projects. It manages its own component system internally. You can use React code components inside Framer, but you cannot open your existing codebase in Framer and edit it visually. ${APP_NAME} is designed exactly for that scenario.`,
        },
        {
            q: `Does ${APP_NAME} have Framer's AI layout generation?`,
            a: `${APP_NAME} includes AI-assisted editing that generates UI changes using your existing components and design tokens. The key difference is that ${APP_NAME}'s AI is constrained to your codebase — it cannot introduce new components or styles that do not already exist in your project. Framer's AI can generate freely within Framer's own component set.`,
        },
        {
            q: 'Can I migrate a Framer site to React?',
            a: `Framer's code export produces React-based code in Framer's component format. Migration to a standard React codebase requires manual work to replace Framer-specific APIs. ${APP_NAME} operates on standard React from the start, so there is nothing to migrate.`,
        },
    ],
};

export default function CompareFramerPage() {
    return <ComparisonPage content={content} />;
}
