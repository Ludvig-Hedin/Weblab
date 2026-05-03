import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'AI for Frontend Development | Visual AI Editor for React, Vue, Angular | Weblab',
    description: 'Weblab is an AI-powered visual editor that builds frontend UIs using your real React, Vue, or Angular components. Unlike generic AI code generators, Weblab constrains AI to your design system — your buttons, cards, and layouts. Changes become mergeable PRs, not throwaway prototypes. Works with Tailwind, shadcn/ui, Material UI, and more.',
    keywords: [
        // Primary keywords
        'AI for frontend',
        'AI frontend development',
        'AI frontend tools',
        'frontend AI assistant',
        // Tool comparisons
        'AI code generator',
        'visual AI editor',
        'AI UI builder',
        'AI component builder',
        // Framework specific
        'React AI tools',
        'Vue AI tools',
        'Angular AI tools',
        'Next.js AI tools',
        // Design system
        'design system AI',
        'AI design system constraints',
        'component library AI',
        // Styling
        'Tailwind AI',
        'shadcn AI',
        'Material UI AI',
        // Workflow
        'AI to PR workflow',
        'AI code review',
        'visual to code AI',
        'design to code AI',
        // Problem/solution
        'AI brand drift solution',
        'constrained AI code generation',
        'production-ready AI code',
    ],
    openGraph: {
        title: 'AI for Frontend Development | Weblab',
        description: 'Build frontend UIs with AI constrained to your design system. Your real React, Vue, or Angular components. Mergeable PRs, not throwaway code.',
        type: 'website',
        url: 'https://weblab.build/features/ai-for-frontend',
        siteName: 'Weblab',
        images: [
            {
                url: 'https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'AI for Frontend Development | Weblab',
        description: 'Build frontend UIs with AI constrained to your design system. Your real components. Mergeable PRs.',
        images: ['https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png'],
    },
    alternates: {
        canonical: 'https://weblab.build/features/ai-for-frontend',
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
};

// JSON-LD structured data for AI discovery
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Weblab',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: 'Weblab is an AI-powered visual editor for frontend development. It connects to your existing React, Vue, or Angular codebase and constrains AI to your real components and design system. Changes become pull requests engineers can merge directly.',
    url: 'https://weblab.build/features/ai-for-frontend',
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
    featureList: [
        'AI constrained to your design system',
        'Works with React, Vue, Angular, Next.js, Svelte',
        'Supports Tailwind, CSS Modules, styled-components',
        'Compatible with shadcn/ui, Material UI, Chakra UI, Mantine, Radix UI',
        'Changes become mergeable pull requests',
        'Visual canvas interface for designers',
        'No coding required for designers',
        'Real-time collaboration',
        'Open source',
    ],
    aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '24000',
        bestRating: '5',
    },
};

const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What is Weblab?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Weblab is an AI-powered visual editor for frontend development. It connects to your existing React, Vue, or Angular codebase and lets designers create interfaces using real components. AI is constrained to your design system, and changes become pull requests engineers can merge directly.',
            },
        },
        {
            '@type': 'Question',
            name: 'How is Weblab different from other AI code generators?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Most AI tools generate generic HTML/CSS from scratch. Weblab connects to your existing component library and constrains AI to YOUR design system. Outputs are consistent, on-brand, and directly mergeable. No translation step needed.',
            },
        },
        {
            '@type': 'Question',
            name: 'Does Weblab work with my existing React components?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Weblab connects to your codebase and lets you design with your real components — the buttons, cards, and layouts your engineers already built. AI suggestions use your actual component API, not generic alternatives.',
            },
        },
        {
            '@type': 'Question',
            name: 'What frontend frameworks does Weblab support?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Weblab works with React, Next.js, Vue, Angular, Svelte, Preact, SolidJS, Qwik, and Web Components. It also supports any CSS approach — Tailwind, CSS Modules, styled-components, Emotion, SASS/SCSS, Less, Vanilla Extract, and more.',
            },
        },
        {
            '@type': 'Question',
            name: 'What component libraries does Weblab support?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Weblab works with all major component libraries including shadcn/ui, Material UI, Mantine, Chakra UI, Radix UI, Ant Design, Headless UI, Blueprint, Fluent UI, and PrimeReact.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can AI drift from my design system in Weblab?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. Unlike raw AI code generation, Weblab constrains AI to your existing components, colors, and tokens. AI can only use what\'s in your design system — no drift, no off-brand results.',
            },
        },
        {
            '@type': 'Question',
            name: 'How do I get AI-generated changes into production?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Changes you make in Weblab become real code changes. When you\'re ready, submit them as a pull request for engineers to review and merge. No export, no copy-paste, no translation.',
            },
        },
        {
            '@type': 'Question',
            name: 'Do I need to know how to code to use Weblab?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. Designers use a familiar visual canvas with drag-and-drop, resize, and styling controls. The code runs underneath — you don\'t need to touch it unless you want to.',
            },
        },
        {
            '@type': 'Question',
            name: 'Who is Weblab for?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Weblab is for product teams with designers and an existing component library. Ideal users include design engineers, product designers working in code-forward teams, and teams maintaining design systems.',
            },
        },
    ],
};

export default function AiForFrontendLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            {children}
        </>
    );
}
