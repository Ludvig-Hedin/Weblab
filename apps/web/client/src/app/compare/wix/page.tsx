import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'Wix',
    competitorSlug: 'wix',
    competitorTagline: 'Drag-and-drop website builder for small businesses',
    heroTitle: `${APP_NAME} vs Wix: React codebase editor vs small-business website builder`,
    heroSubtitle: `Wix is the world's most popular website builder, with AI generation via Wix Harmony and a drag-and-drop editor for small businesses. ${APP_NAME} is built for software teams — connecting to your React codebase, visual canvas editing, and shipping changes as GitHub pull requests.`,
    summary: {
        competitorIs:
            "a drag-and-drop website builder for small businesses and individuals. Wix Harmony (launched January 2026) adds an AI agent called Aria that generates site sections from natural language. Sites live on Wix's infrastructure, and there is no code ownership or external codebase integration.",
        weblabIs: `a visual editor for software engineering teams with React codebases. ${APP_NAME} reads your real components and design tokens, provides an infinite canvas for visual editing, and writes every change back to your repository as a pull request. It bridges design and engineering without either side losing control.`,
        recommendation: `If you are a small business owner, freelancer, or non-technical user who wants a website fast without touching code, Wix is an excellent and affordable option. If you are a software team with a React product and an engineering culture, ${APP_NAME} is designed for your workflow.`,
    },
    comparisonRows: [
        {
            feature: 'Target audience',
            weblab: 'Software teams with React codebases',
            competitor: 'Small businesses, freelancers, non-technical users',
        },
        {
            feature: 'Editing interface',
            weblab: 'Infinite visual canvas on your real React components',
            competitor: 'Drag-and-drop editor with Wix AI (Aria agent)',
        },
        {
            feature: 'Code ownership',
            weblab: 'Your files, your repo, your pull requests',
            competitor: 'No — Wix owns the code; no external repo integration',
        },
        {
            feature: 'React support',
            weblab: 'Native — reads and edits your real React components',
            competitor: 'None — Wix generates proprietary markup',
        },
        {
            feature: 'Design system',
            weblab: 'AI constrained to your existing tokens and components',
            competitor: "Wix's own design system and templates",
        },
        {
            feature: 'Hosting',
            weblab: 'Your existing infrastructure',
            competitor: 'Wix-hosted (required)',
        },
        {
            feature: 'AI capabilities',
            weblab: 'Design-system-aware AI edits constrained to your codebase',
            competitor: 'Wix Harmony: Aria agent for natural-language site generation',
        },
        {
            feature: 'eCommerce',
            weblab: 'Bring your own (Shopify, Stripe, etc.)',
            competitor: 'Built-in Wix eCommerce and payments',
        },
        {
            feature: 'Pricing',
            weblab: 'Free to open source; paid plans for teams',
            competitor: 'From $17/month (Light) to $159/month (Business Elite) billed annually',
        },
        {
            feature: 'Open source',
            weblab: 'Yes',
            competitor: 'No',
        },
    ],
    differences: [
        {
            title: 'Product audience — the key divide',
            body: `Wix serves small business owners who want a website without technical skills. ${APP_NAME} serves software teams who already have React codebases and want design and engineering to collaborate without the hand-off tax. These audiences barely overlap. The right tool depends entirely on which scenario describes you.`,
        },
        {
            title: 'Code ownership',
            body: `With Wix, your site is hosted on Wix's infrastructure and built with Wix's proprietary tools. You cannot export your site and take it to a different host in a usable format. ${APP_NAME} produces pull requests in your existing GitHub repository. You always own the code.`,
        },
        {
            title: 'Wix Harmony vs design system AI',
            body: `Wix Harmony's Aria agent generates website sections from natural language using Wix's own design components. ${APP_NAME}'s AI is constrained to your existing design system — it can only use the Button, Card, and Input components your engineers already maintain. No brand drift, no new dependencies.`,
        },
        {
            title: 'Engineering workflow integration',
            body: `Wix has no concept of a pull request, a CI pipeline, or a code review. Changes go live immediately on Wix hosting. ${APP_NAME} changes go through your normal engineering process — GitHub PR, CI checks, code review, merge. The two tools exist in different workflow worlds.`,
        },
    ],
    chooseCompetitorIf: [
        'You are a small business owner without technical skills',
        'You want a website without writing any code',
        'You need built-in eCommerce, booking, and payment tools',
        'Affordability is the primary concern (from $17/month)',
        'You want everything — domain, hosting, email, CMS — in one place',
    ],
    chooseWeblabIf: [
        'You have an existing React or Next.js codebase',
        'Your team has engineers who review and merge code via GitHub',
        'You have a design system the AI must follow',
        'Designers need a visual editing layer that integrates with engineering',
        'You deploy to your own infrastructure (Vercel, AWS, etc.)',
    ],
    faqs: [
        {
            q: `Is ${APP_NAME} a Wix alternative for developers?`,
            a: `${APP_NAME} and Wix do not compete for the same users. Wix is for non-technical small business owners. ${APP_NAME} is for software engineering teams with React codebases. If you are a developer looking for a visual editor for your React project, ${APP_NAME} is the right tool. Wix is not designed for this use case.`,
        },
        {
            q: 'Can developers use Wix for React projects?',
            a: "Wix does not support external React codebases. It generates its own markup inside Wix's platform. If you have a React component library and design system, Wix cannot access or use it. Weblab is designed specifically for this integration.",
        },
        {
            q: 'What is Wix Harmony?',
            a: "Wix Harmony is Wix's AI-powered site builder launched in January 2026. It combines an AI agent called Aria (which understands natural language instructions) with traditional drag-and-drop editing. It is designed for non-technical users building Wix-hosted websites, not for developers working on React codebases.",
        },
        {
            q: 'Is Wix cheaper than Weblab?',
            a: `Wix plans start at $17/month for basic features. ${APP_NAME} is open source and free to self-host, with paid plans for team features. The cost comparison depends on team size and requirements, but the more important comparison is which tool solves your actual workflow problem.`,
        },
    ],
};

export default function CompareWixPage() {
    return <ComparisonPage content={content} />;
}
