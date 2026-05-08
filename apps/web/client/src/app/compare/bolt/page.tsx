import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'Bolt',
    competitorSlug: 'bolt',
    competitorTagline: 'In-browser AI full-stack builder',
    heroTitle: `${APP_NAME} vs Bolt: visual canvas for real codebases vs chat for new apps`,
    heroSubtitle: `Bolt is an AI agent that builds full-stack apps in a sandboxed browser environment. ${APP_NAME} is a visual editor that connects to your real React codebase and ships pull requests engineers can merge.`,
    summary: {
        competitorIs:
            'a chat-first AI builder that runs your app in the browser via WebContainers and lets the agent edit, install, and run code in a sandbox.',
        weblabIs: `a visual editor for an existing React codebase. Designers edit real components on an infinite canvas; ${APP_NAME} writes the diff back as a pull request against your repository.`,
        recommendation: `Use Bolt to bootstrap a new full-stack app from a prompt. Use ${APP_NAME} when the codebase already exists, the design system is real, and the engineering team needs to review every change.`,
    },
    comparisonRows: [
        {
            feature: 'Primary input',
            weblab: 'Your existing repository + visual canvas',
            competitor: 'Natural-language prompts in chat',
        },
        {
            feature: 'Editing surface',
            weblab: 'Infinite canvas with your real components',
            competitor: 'Code editor + chat + live preview',
        },
        {
            feature: 'Output',
            weblab: 'Pull request to GitHub',
            competitor: 'Sandboxed app, optional deploy or export',
        },
        {
            feature: 'Design-system awareness',
            weblab: 'AI constrained to your tokens and components',
            competitor: 'AI generates new code each iteration',
        },
        {
            feature: 'Best for',
            weblab: 'Teams iterating on a real product',
            competitor: 'Bootstrapping new apps quickly',
        },
        {
            feature: 'Frameworks',
            weblab: 'React, Next.js',
            competitor: 'Anything Bolt’s container can run',
        },
        {
            feature: 'Open source',
            weblab: 'Yes',
            competitor: 'No',
        },
    ],
    differences: [
        {
            title: 'Design surface vs. code surface',
            body: `Bolt is built around chat and a code editor. ${APP_NAME} is built around an infinite design canvas where the components are real React components — what you place on the canvas IS what gets shipped.`,
        },
        {
            title: 'Sandbox vs. your repo',
            body: `Bolt runs your app in a sandboxed environment in the browser. ${APP_NAME} works against your real repository, so the work product is a normal pull request and your existing CI, design-system rules, and code-review workflow apply.`,
        },
        {
            title: 'New apps vs. existing apps',
            body: `Bolt shines when you are starting from zero — describe an idea and get a working app. ${APP_NAME} is built for the long tail: extending and refining an app that is already in production.`,
        },
        {
            title: 'Solo agent vs. team canvas',
            body: `Bolt is essentially a solo AI agent in a window. ${APP_NAME} treats team collaboration as the primary use case — designers and engineers can work on the same canvas, leave spatial comments, and review changes together.`,
        },
    ],
    chooseCompetitorIf: [
        'You are bootstrapping a new full-stack app from scratch',
        'You want the AI to install dependencies and run servers for you',
        'A sandbox or hosted Bolt environment is acceptable',
        'You are exploring an idea, not committing to a long-term codebase',
    ],
    chooseWeblabIf: [
        'You have an existing React or Next.js application',
        'You need every change to land as a pull request',
        'You have a design system the AI must respect',
        'Designers and developers will work side by side',
        'You want open source and the option to self-host',
    ],
    faqs: [
        {
            q: `Is ${APP_NAME} an alternative to Bolt for building full-stack apps?`,
            a: `If you are starting from zero, Bolt is faster — it scaffolds front-end, back-end, and a runtime in one go. ${APP_NAME} is the better fit when the codebase already exists and you want to extend it visually with AI that respects your conventions.`,
        },
        {
            q: 'Can Weblab and Bolt be used together?',
            a: `Yes. Use Bolt to spin up an idea, then move the code into your real repository and use ${APP_NAME} to extend it visually with your team and your design system.`,
        },
        {
            q: `Does ${APP_NAME} run my app like Bolt’s WebContainer does?`,
            a: `${APP_NAME} works alongside your existing dev environment rather than replacing it. You can preview changes in the canvas while your app continues to run in your normal tooling.`,
        },
    ],
};

export default function CompareBoltPage() {
    return <ComparisonPage content={content} />;
}
