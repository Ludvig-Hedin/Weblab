import { z } from 'zod';

import type { Blog2Content } from './blocks/blog-2';
import type { Cta1Content } from './blocks/cta-1';
import type { Faq2Content } from './blocks/faq-2';
import type { Feature1Content } from './blocks/feature-1';
import type { FeatureGrid10Content } from './blocks/feature-grid-10';
import type { Footer1Content } from './blocks/footer-1';
import type { Hero1Content } from './blocks/hero-1';
import type { Hero6Content } from './blocks/hero-6';
import type { Logos1Content } from './blocks/logos-1';
import type { LpNavbar1Content } from './blocks/lp-navbar-1';
import type { Pricing2Content } from './blocks/pricing-2';
import type { Process13Content } from './blocks/process-13';
import type { Split2Content } from './blocks/split-2';
import type { Stats2Content } from './blocks/stats-2';
import type { Testimonials1Content } from './blocks/testimonials-1';
import type { BlockCategory, BlockMeta, BlockVariant } from './types';
import { isBlockCategory } from './types';

// Caps keep AI-generated copy inside what each block lays out cleanly (the
// "long copy overflows block" edge case) and bound LLM token spend.
const short = z.string().min(1).max(120);
const line = z.string().min(1).max(240);
const para = z.string().min(1).max(600);
const navLink = z.object({ label: z.string().min(1).max(40), href: z.string().max(200) });

const lpNavbar1: z.ZodType<LpNavbar1Content> = z.object({
    logoText: short,
    links: z.array(navLink).max(8),
    ctaLabel: short,
});

const hero1: z.ZodType<Hero1Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para,
    primaryCtaLabel: short,
    secondaryCtaLabel: short.optional(),
});

const hero6: z.ZodType<Hero6Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para,
    primaryCtaLabel: short,
    secondaryCtaLabel: short.optional(),
});

const logos1: z.ZodType<Logos1Content> = z.object({
    heading: line,
    logos: z.array(short).min(2).max(8),
});

const feature1: z.ZodType<Feature1Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para,
    bullets: z.array(line).min(1).max(6),
    ctaLabel: short.optional(),
});

const featureGrid10: z.ZodType<FeatureGrid10Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para.optional(),
    items: z
        .array(z.object({ title: short, description: para }))
        .min(2)
        .max(9),
});

const split2: z.ZodType<Split2Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para,
    ctaLabel: short.optional(),
    imageSide: z.enum(['left', 'right']),
});

const process13: z.ZodType<Process13Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para.optional(),
    steps: z
        .array(z.object({ title: short, description: para }))
        .min(2)
        .max(6),
});

const pricing2: z.ZodType<Pricing2Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para.optional(),
    plans: z
        .array(
            z.object({
                name: short,
                price: z.string().min(1).max(24),
                period: z.string().max(24).optional(),
                description: line.optional(),
                features: z.array(line).min(1).max(10),
                ctaLabel: short,
                highlighted: z.boolean().optional(),
            }),
        )
        .min(1)
        .max(4),
});

const testimonials1: z.ZodType<Testimonials1Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    testimonials: z
        .array(z.object({ quote: para, author: short, role: short }))
        .min(1)
        .max(6),
});

const stats2: z.ZodType<Stats2Content> = z.object({
    eyebrow: short.optional(),
    heading: line.optional(),
    stats: z
        .array(z.object({ value: z.string().min(1).max(24), label: line }))
        .min(2)
        .max(4),
});

const faq2: z.ZodType<Faq2Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    items: z
        .array(z.object({ question: line, answer: para }))
        .min(1)
        .max(12),
});

const blog2: z.ZodType<Blog2Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para.optional(),
    posts: z
        .array(
            z.object({
                title: line,
                excerpt: para,
                category: short,
                author: short,
                date: z.string().min(1).max(40),
            }),
        )
        .min(1)
        .max(6),
});

const cta1: z.ZodType<Cta1Content> = z.object({
    eyebrow: short.optional(),
    heading: line,
    subheading: para,
    primaryCtaLabel: short,
    secondaryCtaLabel: short.optional(),
});

const footer1: z.ZodType<Footer1Content> = z.object({
    logoText: short,
    tagline: para.optional(),
    columns: z
        .array(z.object({ title: short, links: z.array(navLink).min(1).max(8) }))
        .min(1)
        .max(4),
    note: line,
});

// ── Default content (also the generation seed + fallback) ───────────────────
// Typed against each block's interface so a drift between schema and component
// is a compile error. `registry.test.ts` additionally asserts each default
// parses against its schema.

const defaults = {
    'lp-navbar-1': {
        logoText: 'Acme',
        links: [
            { label: 'Product', href: '#product' },
            { label: 'Pricing', href: '#pricing' },
            { label: 'About', href: '#about' },
        ],
        ctaLabel: 'Get started',
    } satisfies LpNavbar1Content,
    'hero-1': {
        eyebrow: 'Introducing Acme',
        heading: 'The headline that states your core promise',
        subheading:
            'One or two sentences that explain what you do, who it is for, and why it matters — concrete, not generic.',
        primaryCtaLabel: 'Get started',
        secondaryCtaLabel: 'See how it works',
    } satisfies Hero1Content,
    'hero-6': {
        eyebrow: 'Introducing Acme',
        heading: 'A bold, centered statement of value',
        subheading:
            'A short supporting line that adds specifics and earns the click. Keep it tight and confident.',
        primaryCtaLabel: 'Get started',
        secondaryCtaLabel: 'Talk to sales',
    } satisfies Hero6Content,
    'logos-1': {
        heading: 'Trusted by teams at',
        logos: ['Northwind', 'Globex', 'Initech', 'Umbrella', 'Soylent', 'Hooli'],
    } satisfies Logos1Content,
    'feature-1': {
        eyebrow: 'Why teams choose us',
        heading: 'A capability that solves a real problem',
        subheading: 'Explain the outcome this unlocks and the friction it removes.',
        bullets: [
            'A concrete benefit stated plainly',
            'A second differentiator that matters',
            'A third reason to believe',
        ],
        ctaLabel: 'Learn more',
    } satisfies Feature1Content,
    'feature-grid-10': {
        eyebrow: 'Capabilities',
        heading: 'Everything you need, nothing you do not',
        subheading: 'A short framing line for the grid of features below.',
        items: [
            { title: 'First capability', description: 'What it does and why it helps.' },
            { title: 'Second capability', description: 'What it does and why it helps.' },
            { title: 'Third capability', description: 'What it does and why it helps.' },
        ],
    } satisfies FeatureGrid10Content,
    'split-2': {
        eyebrow: 'How it works',
        heading: 'A focused look at one part of the product',
        subheading: 'Pair the image with a clear explanation of this specific capability.',
        ctaLabel: 'Explore',
        imageSide: 'right',
    } satisfies Split2Content,
    'process-13': {
        eyebrow: 'How it works',
        heading: 'From start to result in three steps',
        subheading: 'Walk through the journey so it feels effortless.',
        steps: [
            { title: 'Step one', description: 'What the user does first.' },
            { title: 'Step two', description: 'What happens next.' },
            { title: 'Step three', description: 'The outcome they get.' },
        ],
    } satisfies Process13Content,
    'pricing-2': {
        eyebrow: 'Pricing',
        heading: 'Simple, transparent pricing',
        subheading: 'Pick the plan that fits. Upgrade anytime.',
        plans: [
            {
                name: 'Starter',
                price: '$0',
                period: '/mo',
                description: 'For getting started',
                features: ['Core features', 'Community support', '1 project'],
                ctaLabel: 'Start free',
            },
            {
                name: 'Pro',
                price: '$29',
                period: '/mo',
                description: 'For growing teams',
                features: ['Everything in Starter', 'Unlimited projects', 'Priority support'],
                ctaLabel: 'Start trial',
                highlighted: true,
            },
            {
                name: 'Enterprise',
                price: 'Custom',
                description: 'For scale',
                features: ['SSO & SAML', 'Dedicated support', 'Custom limits'],
                ctaLabel: 'Contact sales',
            },
        ],
    } satisfies Pricing2Content,
    'testimonials-1': {
        eyebrow: 'Testimonials',
        heading: 'What our customers say',
        testimonials: [
            {
                quote: 'A specific, believable result this delivered for us.',
                author: 'Alex Doe',
                role: 'VP, Northwind',
            },
            {
                quote: 'Concrete praise that mentions an outcome, not vibes.',
                author: 'Sam Lee',
                role: 'Founder, Globex',
            },
            {
                quote: 'A third quote that reinforces the core value.',
                author: 'Jo Park',
                role: 'Lead, Initech',
            },
        ],
    } satisfies Testimonials1Content,
    'stats-2': {
        eyebrow: 'By the numbers',
        heading: 'Results that speak for themselves',
        stats: [
            { value: '99.9%', label: 'Uptime' },
            { value: '2.4M', label: 'Requests / day' },
            { value: '4.8/5', label: 'Customer rating' },
            { value: '+38%', label: 'Faster delivery' },
        ],
    } satisfies Stats2Content,
    'faq-2': {
        eyebrow: 'FAQ',
        heading: 'Frequently asked questions',
        items: [
            {
                question: 'A common question your buyers ask?',
                answer: 'A clear, reassuring answer.',
            },
            { question: 'A second objection to address?', answer: 'A concise, honest response.' },
            {
                question: 'A third thing people want to know?',
                answer: 'The detail that removes doubt.',
            },
        ],
    } satisfies Faq2Content,
    'blog-2': {
        eyebrow: 'Blog',
        heading: 'Latest from the team',
        subheading: 'Ideas, updates, and lessons from building the product.',
        posts: [
            {
                title: 'A post that demonstrates expertise',
                excerpt: 'A one-line summary.',
                category: 'Product',
                author: 'Alex Doe',
                date: 'May 2026',
            },
            {
                title: 'A second helpful article',
                excerpt: 'A one-line summary.',
                category: 'Engineering',
                author: 'Sam Lee',
                date: 'Apr 2026',
            },
            {
                title: 'A third worth reading',
                excerpt: 'A one-line summary.',
                category: 'Company',
                author: 'Jo Park',
                date: 'Mar 2026',
            },
        ],
    } satisfies Blog2Content,
    'cta-1': {
        eyebrow: undefined,
        heading: 'Ready to get started?',
        subheading: 'A short, confident closing line that prompts the next step.',
        primaryCtaLabel: 'Get started',
        secondaryCtaLabel: 'Book a demo',
    } satisfies Cta1Content,
    'footer-1': {
        logoText: 'Acme',
        tagline: 'A one-line description of the company or product.',
        columns: [
            {
                title: 'Product',
                links: [
                    { label: 'Features', href: '#' },
                    { label: 'Pricing', href: '#' },
                ],
            },
            {
                title: 'Company',
                links: [
                    { label: 'About', href: '#' },
                    { label: 'Blog', href: '#' },
                ],
            },
            {
                title: 'Legal',
                links: [
                    { label: 'Privacy', href: '#' },
                    { label: 'Terms', href: '#' },
                ],
            },
        ],
        note: '© 2026 Acme, Inc. All rights reserved.',
    } satisfies Footer1Content,
} as const;

export type WireframeBlockId = keyof typeof defaults;

interface RawMeta {
    id: WireframeBlockId;
    name: string;
    category: BlockCategory;
    tags: string[];
    useCases: string[];
    contentSchema: z.ZodType;
}

const RAW: RawMeta[] = [
    {
        id: 'lp-navbar-1',
        name: 'Navbar',
        category: 'navbar',
        tags: ['header', 'navigation'],
        useCases: ['Top of every page'],
        contentSchema: lpNavbar1,
    },
    {
        id: 'hero-1',
        name: 'Hero with media',
        category: 'hero',
        tags: ['hero', 'image', 'split'],
        useCases: ['Homepage hero with a product visual'],
        contentSchema: hero1,
    },
    {
        id: 'hero-6',
        name: 'Hero centered',
        category: 'hero',
        tags: ['hero', 'centered'],
        useCases: ['Punchy text-first hero, no image'],
        contentSchema: hero6,
    },
    {
        id: 'logos-1',
        name: 'Logo cloud',
        category: 'logos',
        tags: ['social proof', 'logos'],
        useCases: ['Trusted-by strip under the hero'],
        contentSchema: logos1,
    },
    {
        id: 'feature-1',
        name: 'Feature with bullets',
        category: 'feature',
        tags: ['feature', 'benefits', 'image'],
        useCases: ['Deep-dive on one capability'],
        contentSchema: feature1,
    },
    {
        id: 'feature-grid-10',
        name: 'Feature grid',
        category: 'feature',
        tags: ['feature', 'grid'],
        useCases: ['Overview of several capabilities'],
        contentSchema: featureGrid10,
    },
    {
        id: 'split-2',
        name: 'Split feature',
        category: 'split',
        tags: ['split', 'image', 'alternating'],
        useCases: ['Alternating image/text capability rows'],
        contentSchema: split2,
    },
    {
        id: 'process-13',
        name: 'Process steps',
        category: 'process',
        tags: ['process', 'steps', 'how it works'],
        useCases: ['Explain a 3-step workflow'],
        contentSchema: process13,
    },
    {
        id: 'pricing-2',
        name: 'Pricing tiers',
        category: 'pricing',
        tags: ['pricing', 'plans'],
        useCases: ['Pricing page tiers'],
        contentSchema: pricing2,
    },
    {
        id: 'testimonials-1',
        name: 'Testimonials grid',
        category: 'testimonials',
        tags: ['social proof', 'quotes'],
        useCases: ['Customer quotes with ratings'],
        contentSchema: testimonials1,
    },
    {
        id: 'stats-2',
        name: 'Stats band',
        category: 'stats',
        tags: ['metrics', 'numbers'],
        useCases: ['Headline metrics / impact numbers'],
        contentSchema: stats2,
    },
    {
        id: 'faq-2',
        name: 'FAQ accordion',
        category: 'faq',
        tags: ['faq', 'questions'],
        useCases: ['Answer common objections'],
        contentSchema: faq2,
    },
    {
        id: 'blog-2',
        name: 'Blog list',
        category: 'blog',
        tags: ['blog', 'articles', 'cards'],
        useCases: ['Latest posts grid'],
        contentSchema: blog2,
    },
    {
        id: 'cta-1',
        name: 'CTA banner',
        category: 'cta',
        tags: ['cta', 'conversion'],
        useCases: ['Closing call to action'],
        contentSchema: cta1,
    },
    {
        id: 'footer-1',
        name: 'Footer',
        category: 'footer',
        tags: ['footer', 'navigation'],
        useCases: ['Bottom of every page'],
        contentSchema: footer1,
    },
];

export const BLOCKS_META: BlockMeta[] = RAW.map((m) => ({
    ...m,
    defaultContent: defaults[m.id],
}));

const BY_ID = new Map<string, BlockMeta>(BLOCKS_META.map((m) => [m.id, m]));

export const WIREFRAME_BLOCK_IDS: string[] = BLOCKS_META.map((m) => m.id);

export function isWireframeBlockId(id: string): id is WireframeBlockId {
    return BY_ID.has(id);
}

export function getBlockMeta(id: string): BlockMeta | undefined {
    return BY_ID.get(id);
}

export function blockIdsForCategory(category: BlockCategory): string[] {
    return BLOCKS_META.filter((m) => m.category === category).map((m) => m.id);
}

/** First registered block for a category; falls back to the feature grid. */
export function defaultBlockForCategory(category: BlockCategory): string {
    return blockIdsForCategory(category)[0] ?? 'feature-grid-10';
}

/**
 * Map an arbitrary (possibly AI-suggested) block id or category name onto a real
 * registered block id. Guarantees the result is always a valid block — the
 * "no hallucinated blocks" + "selected block no longer exists" safety net.
 */
export function coerceBlockId(idOrCategory: string, fallbackCategory?: BlockCategory): string {
    if (isWireframeBlockId(idOrCategory)) return idOrCategory;
    if (isBlockCategory(idOrCategory)) return defaultBlockForCategory(idOrCategory);
    if (fallbackCategory) return defaultBlockForCategory(fallbackCategory);
    return 'feature-grid-10';
}

/** Sibling blocks in the same category the user can swap to. */
export function variantsForBlock(id: string): BlockVariant[] {
    const meta = BY_ID.get(id);
    if (!meta) return [];
    return BLOCKS_META.filter((m) => m.category === meta.category).map((m) => ({
        id: m.id,
        label: m.name,
    }));
}

/** Compact catalog injected into the wireframe-generation prompt. */
export function blockCatalogForPrompt(): Array<{
    id: string;
    category: BlockCategory;
    name: string;
    useCases: string[];
}> {
    return BLOCKS_META.map((m) => ({
        id: m.id,
        category: m.category,
        name: m.name,
        useCases: m.useCases,
    }));
}
