import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'one.com',
    competitorSlug: 'one-com',
    competitorTagline: 'Budget hosting and drag-and-drop website builder',
    heroTitle: `${APP_NAME} vs one.com: React visual editor vs budget website builder`,
    heroSubtitle: `one.com is an affordable hosting and website builder for individuals and small businesses — domain, email, and a drag-and-drop builder in one package. ${APP_NAME} is built for software teams with React codebases, giving designers a visual canvas that ships pull requests engineers can merge.`,
    summary: {
        competitorIs:
            'a budget web hosting provider with a built-in drag-and-drop website builder. It targets individuals and small businesses who want an affordable, simple website with domain registration, professional email, SSL, and AI-assisted setup. Plans start under $1/month for the first year.',
        weblabIs: `a visual design editor for React codebases. ${APP_NAME} reads your real components and Tailwind classes, lets your team make visual UI changes on an infinite canvas, and writes every change back to your GitHub repository as a pull request — no terminal required for the designer, no hand-off required for the engineer.`,
        recommendation: `If you are an individual or small business that wants an affordable hosted website with no technical requirements, one.com is a solid and inexpensive choice. If you are a software team with a React product and want visual editing integrated into your engineering workflow, ${APP_NAME} is the right tool — these products do not compete.`,
    },
    comparisonRows: [
        {
            feature: 'Target audience',
            weblab: 'Software engineering teams with React codebases',
            competitor: 'Individuals and small businesses, non-technical users',
        },
        {
            feature: 'Editing interface',
            weblab: 'Infinite visual canvas on your real React components',
            competitor: 'Drag-and-drop website builder with AI setup wizard',
        },
        {
            feature: 'Code ownership',
            weblab: 'Your files, your repo, your pull requests',
            competitor: 'No code ownership — hosted on one.com infrastructure',
        },
        {
            feature: 'React support',
            weblab: 'Native — reads and writes your real React components',
            competitor: 'None — proprietary drag-and-drop markup only',
        },
        {
            feature: 'AI capabilities',
            weblab: 'Design-system-aware AI edits constrained to your codebase',
            competitor: 'AI wizard for initial site setup; AI writing assistant (11 languages)',
        },
        {
            feature: 'Hosting',
            weblab: 'Your existing infrastructure',
            competitor: 'one.com hosting (required)',
        },
        {
            feature: 'Developer tooling',
            weblab: 'GitHub PRs, CI integration, design system enforcement',
            competitor: 'None — designed for non-developers',
        },
        {
            feature: 'Pricing',
            weblab: 'Free to open source; paid plans for teams',
            competitor: 'From $0.99/month first year; standard price higher after renewal',
        },
        {
            feature: 'Open source',
            weblab: 'Yes',
            competitor: 'No',
        },
    ],
    differences: [
        {
            title: 'Developer tool vs consumer product',
            body: `one.com is a consumer product for people who need a website without any technical knowledge. ${APP_NAME} is a developer tool for engineering teams who have a React codebase and want to make it visually editable. There is no meaningful overlap in target audience.`,
        },
        {
            title: 'Code ownership and portability',
            body: `one.com builds your website inside its own platform. If you want to move hosts, you lose your site builder work and start over. ${APP_NAME} produces pull requests in your own GitHub repository — your code is yours, it builds with your CI system, and it deploys to wherever you already deploy.`,
        },
        {
            title: 'AI capabilities — setup wizard vs design system AI',
            body: `one.com uses AI to help set up an initial website based on business information and provides an AI writing assistant in 11 languages. ${APP_NAME}'s AI makes targeted UI edits constrained to your existing design system — it uses your real components and design tokens, not generic templates.`,
        },
        {
            title: 'Engineering workflow',
            body: `one.com has no concept of a GitHub pull request, a design system, or a CI pipeline. It is a standalone website builder. ${APP_NAME} integrates with your existing engineering process — every visual change becomes a PR your team can review, comment on, and merge.`,
        },
    ],
    chooseCompetitorIf: [
        'You want an affordable personal or small business website under $1/month',
        'You are not a developer and do not want to touch code',
        'You need domain registration, professional email, and a website in one package',
        'Simplicity and low cost are the primary requirements',
        'You do not have a codebase or development team',
    ],
    chooseWeblabIf: [
        'You have an existing React or Next.js codebase',
        'Your team includes both designers and engineers who share a repo',
        'You want UI changes to go through GitHub PR review',
        'Your product has a design system the AI must respect',
        'You deploy to Vercel, AWS, or your own infrastructure',
    ],
    faqs: [
        {
            q: `Who is ${APP_NAME} for compared to one.com?`,
            a: `${APP_NAME} is for software teams — designers and engineers collaborating on a React product codebase. one.com is for individuals and small businesses who want a simple, affordable hosted website without any coding. The audiences are completely different, so this comparison is mostly useful for people deciding whether they need a website builder or a developer tool.`,
        },
        {
            q: 'Does one.com support React development?',
            a: `one.com does not support React development. It has a drag-and-drop builder and basic hosting. You cannot connect an external React project, use your component library, or generate pull requests. For React development, ${APP_NAME} is built specifically for this use case.`,
        },
        {
            q: 'Can I use one.com for a professional web app?',
            a: `one.com is designed for simple websites — portfolios, small business sites, blogs. It lacks the developer tooling, CI integration, design system support, and code ownership that professional web applications require. ${APP_NAME} is designed for professional engineering teams building production React applications.`,
        },
        {
            q: 'Is one.com really $0.99/month?',
            a: "one.com frequently advertises $0.99/month as an introductory first-year price. After the first year, the price increases substantially. Standard pricing varies by plan. Check one.com's pricing page for current renewal rates before committing.",
        },
    ],
};

export default function CompareOneComPage() {
    return <ComparisonPage content={content} />;
}
