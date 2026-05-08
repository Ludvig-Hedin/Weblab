import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'Lovable',
    competitorSlug: 'lovable',
    competitorTagline: 'Chat-based AI app builder',
    heroTitle: `${APP_NAME} vs Lovable: edit your real codebase or generate a new one`,
    heroSubtitle: `Lovable spins up new apps from a prompt. ${APP_NAME} connects to your existing React codebase, lets you design with your real components on an infinite canvas, and ships changes as pull requests.`,
    summary: {
        competitorIs:
            'a chat-driven AI app builder. You describe what you want, Lovable generates a new app, and you iterate in a chat. The output is a Lovable-hosted app you can deploy or export.',
        weblabIs: `a visual editor for an existing React codebase. ${APP_NAME} reads your real components, lets designers and developers edit them on an infinite canvas, and writes the diff back as a pull request your engineers can merge.`,
        recommendation: `If you are starting from zero, prototyping fast, and the output is the deliverable, Lovable is a strong choice. If you already have a React codebase, a design system, and engineers who own the code, ${APP_NAME} is built for you.`,
    },
    comparisonRows: [
        {
            feature: 'Primary input',
            weblab: 'Your existing React codebase',
            competitor: 'Natural-language prompts',
        },
        {
            feature: 'Editing surface',
            weblab: 'Infinite visual canvas with your real components',
            competitor: 'Chat thread + live preview',
        },
        {
            feature: 'Output',
            weblab: 'Pull request to your GitHub repository',
            competitor: 'Hosted Lovable app, optional code export',
        },
        {
            feature: 'Design-system awareness',
            weblab: 'AI is constrained to your tokens, components, and conventions',
            competitor: 'AI generates new components and styles per request',
        },
        {
            feature: 'Team collaboration',
            weblab: 'Designed for design + engineering teams editing together',
            competitor: 'Mostly solo workflow',
        },
        {
            feature: 'Frameworks',
            weblab: 'React, Next.js (Babel JSX/TSX parser)',
            competitor: 'Lovable’s own runtime / framework',
        },
        {
            feature: 'Hosting',
            weblab: 'Wherever you already deploy',
            competitor: 'Lovable-hosted by default',
        },
        {
            feature: 'Open source',
            weblab: 'Yes',
            competitor: 'No',
        },
    ],
    differences: [
        {
            title: 'Real components vs. fresh code from a prompt',
            body: `Lovable’s strength is going from idea to working app in minutes — but the code is generated from scratch each time. ${APP_NAME} starts from your real components, so the things you design are the things your engineers already maintain. There is no translation step between mock and code.`,
        },
        {
            title: 'PRs vs. a hosted app',
            body: `Lovable produces an app you can iterate on in their environment. ${APP_NAME} produces a pull request against your repository. That means your existing CI, code review, design-system rules, and deployment pipelines all stay in place.`,
        },
        {
            title: 'Constrained AI vs. open AI generation',
            body: `${APP_NAME} constrains the AI to your design system — it can only use the components, tokens, and patterns that already exist in your codebase. That eliminates brand drift and keeps outputs mergeable. Lovable’s AI is freer to invent new UI, which is great for net-new apps and less great when you have a design system to defend.`,
        },
        {
            title: 'Team vs. solo workflow',
            body: `Lovable is optimized for a single maker iterating quickly. ${APP_NAME} is designed for designers and engineers working on the same React codebase, so reviews, comments, and shared canvases are first-class.`,
        },
    ],
    chooseCompetitorIf: [
        'You are starting from zero and need a working app fast',
        'You do not yet have a React codebase or design system',
        'A hosted prototype is an acceptable end-state',
        'You are a solo maker, designer, or PM exploring an idea',
    ],
    chooseWeblabIf: [
        'You have an existing React or Next.js codebase',
        'You have a design system you want the AI to respect',
        'Engineers need to merge the output as a real pull request',
        'Designers and developers will collaborate on the same canvas',
        'You care about open source and self-hosting',
    ],
    faqs: [
        {
            q: `Is ${APP_NAME} a true Lovable alternative?`,
            a: `${APP_NAME} and Lovable solve adjacent problems. ${APP_NAME} edits an existing React codebase visually and ships pull requests. Lovable generates new apps from prompts. They overlap when you want a visual layer for AI-built UIs, but the workflows around team collaboration, design systems, and engineering review are very different.`,
        },
        {
            q: 'Can I use both Lovable and Weblab?',
            a: `Yes. A common pattern is using Lovable to prototype something quickly, then porting the idea into your real codebase and finishing it in ${APP_NAME} so it follows your design system and ships as a PR.`,
        },
        {
            q: `Does ${APP_NAME} support Lovable-style natural-language prompts?`,
            a: `${APP_NAME} includes AI-assisted editing constrained to your design system. You can describe a change and ${APP_NAME} applies it using your real components. The output is a diff against your repo, not a hosted app.`,
        },
        {
            q: 'Where can I read the full feature set?',
            a: `See the ${APP_NAME} features overview at /features and the AI workflow details at /features/ai.`,
        },
    ],
};

export default function CompareLovablePage() {
    return <ComparisonPage content={content} />;
}
