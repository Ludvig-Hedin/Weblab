'use client';

// Assembled landing page built from the exact Watermelon UI components the
// product owner requested — composed, not modified. Rendered inside the editor
// canvas of the homepage hero mockup (see weblab-interface-mockup.tsx).
import type { CSSProperties } from 'react';
import { FiCreditCard, FiHelpCircle, FiZap } from 'react-icons/fi';

import { Cta1 } from './cta-1';
import FAQ2 from './faq-2';
import Features4 from './feature-4';
import Features5 from './feature-5';
import { Footer10 } from './footer-10';
import { Hero9 } from './hero-9';

const FOOTER_LINK_COLUMNS = [
    {
        title: 'Platform',
        links: [
            { label: 'Overview', href: '#' },
            { label: 'Features', href: '#' },
            { label: 'Integrations', href: '#' },
            { label: 'Pricing', href: '#' },
        ],
    },
    {
        title: 'Resources',
        links: [
            { label: 'Documentation', href: '#' },
            { label: 'Blog', href: '#' },
            { label: 'Community', href: '#' },
            { label: 'Support', href: '#' },
        ],
    },
    {
        title: 'Company',
        links: [
            { label: 'About Us', href: '#' },
            { label: 'Careers', href: '#' },
            { label: 'Press', href: '#' },
            { label: 'Contact', href: '#' },
        ],
    },
    {
        title: 'Legal',
        links: [
            { label: 'Privacy Policy', href: '#' },
            { label: 'Terms of Service', href: '#' },
            { label: 'Cookie Policy', href: '#' },
        ],
    },
];

// The watermelon components mix hardcoded colors (hero-9) with shadcn theme
// tokens (feature/faq/cta/footer use bg-background, bg-primary, …). The app
// runs dark, so those tokens would resolve to Weblab's dark palette. We scope a
// clean shadcn *light* theme here via CSS custom properties so the site renders
// as designed — without editing any component. `@weblab/ui` already maps
// --color-* → var(--token), so overriding the raw tokens on this wrapper
// cascades to every descendant utility (bg-background, text-muted-foreground…).
const LIGHT_THEME = {
    '--background': '#ffffff',
    '--foreground': '#0a0a0a',
    '--card': '#ffffff',
    '--card-foreground': '#0a0a0a',
    '--popover': '#ffffff',
    '--popover-foreground': '#0a0a0a',
    '--primary': '#2563eb',
    '--primary-foreground': '#ffffff',
    '--secondary': '#f4f4f5',
    '--secondary-foreground': '#18181b',
    '--muted': '#f4f4f5',
    '--muted-foreground': '#71717a',
    '--accent': '#f4f4f5',
    '--accent-foreground': '#18181b',
    '--border': '#e4e4e7',
    '--input': '#e4e4e7',
    '--ring': '#2563eb',
} as CSSProperties;

const FAQ_CATEGORIES = [
    {
        id: 'general',
        label: 'General',
        icon: <FiHelpCircle />,
        items: [
            {
                question: 'What is this platform built for?',
                answer: 'A next-generation cloud platform delivering speed, security, and scale — designed for developers and engineered for production teams.',
            },
            {
                question: 'Do I need a credit card to start?',
                answer: 'No. You can start for free and explore every core feature without entering payment details.',
            },
        ],
    },
    {
        id: 'pricing',
        label: 'Pricing',
        icon: <FiCreditCard />,
        items: [
            {
                question: 'How does billing work?',
                answer: 'Plans are billed monthly or yearly. You can upgrade, downgrade, or cancel at any time from your dashboard.',
            },
            {
                question: 'Is there a discount for annual plans?',
                answer: 'Yes — annual billing saves you two months compared to paying month to month.',
            },
        ],
    },
    {
        id: 'performance',
        label: 'Performance',
        icon: <FiZap />,
        items: [
            {
                question: 'How fast is deployment?',
                answer: 'Most deployments complete in under a minute, with instant global edge propagation.',
            },
            {
                question: 'What about uptime?',
                answer: 'We target 99.99% uptime backed by redundant infrastructure and real-time monitoring.',
            },
            {
                question: 'Can I invite my whole team?',
                answer: 'Yes — every plan includes seats for your team, with role-based access controls on Pro and above.',
            },
            {
                question: 'Can I change plans later?',
                answer: 'Anytime. Upgrades take effect immediately; downgrades apply at the start of your next billing cycle.',
            },
            {
                question: 'Where is my data stored?',
                answer: 'Your data lives in the region you choose, encrypted at rest and in transit, with automatic backups.',
            },
            {
                question: 'Do you integrate with our existing tools?',
                answer: 'Connect Slack, webhooks, and our REST API in minutes — no migration or heavy setup required.',
            },
        ],
    },
];

// Type consistency across the composed sections: one font family, semibold
// headings, no bold/light extremes, and a single section-heading scale. Scoped
// to .watermelon-site so it can't leak into the surrounding editor UI.
const TYPE_CONSISTENCY_CSS = `
.watermelon-site { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.watermelon-site :is(h1, h2, h3, h4) { font-weight: 600; letter-spacing: -0.02em; }
.watermelon-site .font-bold, .watermelon-site .font-extrabold { font-weight: 600; }
.watermelon-site .font-light, .watermelon-site .font-thin { font-weight: 400; }
.watermelon-site section h2 { font-size: clamp(1.875rem, 2.6vw, 2.5rem); line-height: 1.12; }
.watermelon-site .rounded-3xl, .watermelon-site .rounded-2xl { border-radius: 0.625rem; }
.watermelon-site .rounded-xl { border-radius: 0.5rem; }
`;

export function WatermelonSite({ showFeatures = true }: { showFeatures?: boolean } = {}) {
    return (
        <div className="watermelon-site w-full bg-white text-slate-950" style={LIGHT_THEME}>
            <style>{TYPE_CONSISTENCY_CSS}</style>
            <Hero9
                logoText="Halcyon"
                title={'Clarity for\nyour entire stack'}
                description={
                    'Real-time analytics that turn raw activity into\ndecisions your team can act on.'
                }
                eyebrowText="Trusted by 1,000+ teams"
                ctaText="Book a demo"
                submitText="Start for free"
            />
            {/* 3-column feature section — added live by the demo AI chat, so it
                stays hidden until that step fires. */}
            {showFeatures && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <Features4 />
                </div>
            )}
            <Features5 />
            <FAQ2 categories={FAQ_CATEGORIES} />
            <div className="flex w-full justify-center px-4">
                <Cta1
                    title="See your data clearly"
                    description="Turn raw activity into decisions with real-time analytics built for fast-moving teams."
                    buttonText="Start for free"
                />
            </div>
            <Footer10 linkColumns={FOOTER_LINK_COLUMNS} />
        </div>
    );
}
