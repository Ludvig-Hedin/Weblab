import type { DropElementProperties } from '@weblab/models/element';

export type TemplateCategory = 'sections' | 'content' | 'navigation' | 'forms';

export interface ComponentTemplate {
    key: string;
    label: string;
    description: string;
    category: TemplateCategory;
    properties: DropElementProperties;
}

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
    { value: 'sections', label: 'Sections' },
    { value: 'content', label: 'Content' },
    { value: 'navigation', label: 'Navigation' },
    { value: 'forms', label: 'Forms' },
];

export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
    {
        key: 'hero-centered',
        label: 'Hero',
        description: 'Centered hero with heading, body text, and CTA button',
        category: 'sections',
        properties: {
            tagName: 'section',
            styles: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5rem 2rem',
                textAlign: 'center',
                gap: '1.5rem',
            },
            textContent: null,
            children: [
                {
                    tagName: 'h1',
                    styles: { fontSize: '3rem', fontWeight: '700', lineHeight: '1.2' },
                    textContent: 'Build something great',
                },
                {
                    tagName: 'p',
                    styles: { fontSize: '1.125rem', color: '#6b7280', maxWidth: '32rem' },
                    textContent: 'Start with a solid foundation and build your vision faster.',
                },
                {
                    tagName: 'button',
                    styles: {
                        padding: '0.75rem 2rem',
                        backgroundColor: '#000',
                        color: '#fff',
                        borderRadius: '0.5rem',
                        fontSize: '1rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        border: 'none',
                    },
                    textContent: 'Get started',
                    attributes: { type: 'button' },
                },
            ],
        },
    },
    {
        key: 'cta-section',
        label: 'CTA Section',
        description: 'Call-to-action with heading and two buttons',
        category: 'sections',
        properties: {
            tagName: 'section',
            styles: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2rem',
                padding: '4rem 2rem',
                backgroundColor: '#f9fafb',
                textAlign: 'center',
            },
            textContent: null,
            children: [
                {
                    tagName: 'h2',
                    styles: { fontSize: '2.25rem', fontWeight: '700' },
                    textContent: 'Ready to get started?',
                },
                {
                    tagName: 'p',
                    styles: { fontSize: '1rem', color: '#6b7280', maxWidth: '28rem' },
                    textContent: 'Join thousands of teams already using our platform.',
                },
                {
                    tagName: 'div',
                    styles: {
                        display: 'flex',
                        gap: '1rem',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    },
                    textContent: null,
                    children: [
                        {
                            tagName: 'button',
                            styles: {
                                padding: '0.75rem 1.75rem',
                                backgroundColor: '#000',
                                color: '#fff',
                                borderRadius: '0.5rem',
                                fontWeight: '500',
                                border: 'none',
                                cursor: 'pointer',
                            },
                            textContent: 'Start for free',
                            attributes: { type: 'button' },
                        },
                        {
                            tagName: 'button',
                            styles: {
                                padding: '0.75rem 1.75rem',
                                backgroundColor: 'transparent',
                                color: '#000',
                                borderRadius: '0.5rem',
                                fontWeight: '500',
                                border: '1px solid #000',
                                cursor: 'pointer',
                            },
                            textContent: 'Learn more',
                            attributes: { type: 'button' },
                        },
                    ],
                },
            ],
        },
    },
    {
        key: 'feature-card',
        label: 'Feature Card',
        description: 'Card with icon placeholder, title, and description',
        category: 'content',
        properties: {
            tagName: 'div',
            styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                padding: '1.5rem',
                borderRadius: '0.75rem',
                border: '1px solid #e5e7eb',
                backgroundColor: '#fff',
            },
            textContent: null,
            children: [
                {
                    tagName: 'div',
                    styles: {
                        width: '2.5rem',
                        height: '2.5rem',
                        borderRadius: '0.5rem',
                        backgroundColor: '#f3f4f6',
                    },
                    textContent: null,
                },
                {
                    tagName: 'h3',
                    styles: { fontSize: '1.125rem', fontWeight: '600' },
                    textContent: 'Feature title',
                },
                {
                    tagName: 'p',
                    styles: { fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.5' },
                    textContent: 'Describe what makes this feature valuable to your users.',
                },
            ],
        },
    },
    {
        key: 'testimonial-card',
        label: 'Testimonial',
        description: 'Quote with author name, title, and avatar placeholder',
        category: 'content',
        properties: {
            tagName: 'div',
            styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '1.5rem',
                borderRadius: '0.75rem',
                border: '1px solid #e5e7eb',
                backgroundColor: '#fff',
            },
            textContent: null,
            children: [
                {
                    tagName: 'p',
                    styles: {
                        fontSize: '0.875rem',
                        color: '#374151',
                        lineHeight: '1.6',
                        fontStyle: 'italic',
                    },
                    textContent:
                        '"This product completely changed how our team works. Highly recommend."',
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'div',
                            styles: {
                                width: '2.5rem',
                                height: '2.5rem',
                                borderRadius: '50%',
                                backgroundColor: '#e5e7eb',
                            },
                            textContent: null,
                        },
                        {
                            tagName: 'div',
                            styles: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
                            textContent: null,
                            children: [
                                {
                                    tagName: 'span',
                                    styles: { fontSize: '0.875rem', fontWeight: '600' },
                                    textContent: 'Jane Smith',
                                },
                                {
                                    tagName: 'span',
                                    styles: { fontSize: '0.75rem', color: '#9ca3af' },
                                    textContent: 'CEO at Acme',
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        key: 'pricing-card',
        label: 'Pricing Card',
        description: 'Pricing tier with price, features list, and CTA button',
        category: 'content',
        properties: {
            tagName: 'div',
            styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                padding: '2rem',
                borderRadius: '0.75rem',
                border: '1px solid #e5e7eb',
                backgroundColor: '#fff',
                maxWidth: '22rem',
            },
            textContent: null,
            children: [
                {
                    tagName: 'h3',
                    styles: { fontSize: '1.125rem', fontWeight: '600' },
                    textContent: 'Pro',
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', alignItems: 'baseline', gap: '0.25rem' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'span',
                            styles: { fontSize: '2.5rem', fontWeight: '700' },
                            textContent: '$29',
                        },
                        {
                            tagName: 'span',
                            styles: { fontSize: '0.875rem', color: '#6b7280' },
                            textContent: '/month',
                        },
                    ],
                },
                {
                    tagName: 'ul',
                    styles: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.625rem',
                        paddingLeft: '0',
                        listStyle: 'none',
                    },
                    textContent: null,
                    children: [
                        {
                            tagName: 'li',
                            styles: { fontSize: '0.875rem' },
                            textContent: '✓ Unlimited projects',
                        },
                        {
                            tagName: 'li',
                            styles: { fontSize: '0.875rem' },
                            textContent: '✓ Priority support',
                        },
                        {
                            tagName: 'li',
                            styles: { fontSize: '0.875rem' },
                            textContent: '✓ Custom domain',
                        },
                    ],
                },
                {
                    tagName: 'button',
                    styles: {
                        padding: '0.75rem',
                        backgroundColor: '#000',
                        color: '#fff',
                        borderRadius: '0.5rem',
                        fontWeight: '500',
                        border: 'none',
                        cursor: 'pointer',
                        width: '100%',
                    },
                    textContent: 'Get started',
                    attributes: { type: 'button' },
                },
            ],
        },
    },
    {
        key: 'stats-row',
        label: 'Stats Row',
        description: 'Three stat numbers with labels in a row',
        category: 'sections',
        properties: {
            tagName: 'div',
            styles: {
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '2rem',
                padding: '3rem 2rem',
                textAlign: 'center',
            },
            textContent: null,
            children: [
                {
                    tagName: 'div',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'span',
                            styles: { fontSize: '2.25rem', fontWeight: '700' },
                            textContent: '10k+',
                        },
                        {
                            tagName: 'span',
                            styles: { fontSize: '0.875rem', color: '#6b7280' },
                            textContent: 'Users',
                        },
                    ],
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'span',
                            styles: { fontSize: '2.25rem', fontWeight: '700' },
                            textContent: '99%',
                        },
                        {
                            tagName: 'span',
                            styles: { fontSize: '0.875rem', color: '#6b7280' },
                            textContent: 'Uptime',
                        },
                    ],
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'span',
                            styles: { fontSize: '2.25rem', fontWeight: '700' },
                            textContent: '24/7',
                        },
                        {
                            tagName: 'span',
                            styles: { fontSize: '0.875rem', color: '#6b7280' },
                            textContent: 'Support',
                        },
                    ],
                },
            ],
        },
    },
    {
        key: 'simple-navbar',
        label: 'Navbar',
        description: 'Navigation bar with logo placeholder and nav links',
        category: 'navigation',
        properties: {
            tagName: 'nav',
            styles: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 2rem',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#fff',
            },
            textContent: null,
            children: [
                {
                    tagName: 'span',
                    styles: { fontSize: '1.125rem', fontWeight: '700' },
                    textContent: 'Logo',
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', gap: '2rem', alignItems: 'center' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'a',
                            styles: {
                                fontSize: '0.875rem',
                                color: '#374151',
                                textDecoration: 'none',
                            },
                            textContent: 'Features',
                            attributes: { href: '#' },
                        },
                        {
                            tagName: 'a',
                            styles: {
                                fontSize: '0.875rem',
                                color: '#374151',
                                textDecoration: 'none',
                            },
                            textContent: 'Pricing',
                            attributes: { href: '#' },
                        },
                        {
                            tagName: 'a',
                            styles: {
                                fontSize: '0.875rem',
                                color: '#374151',
                                textDecoration: 'none',
                            },
                            textContent: 'Docs',
                            attributes: { href: '#' },
                        },
                        {
                            tagName: 'button',
                            styles: {
                                padding: '0.5rem 1.25rem',
                                backgroundColor: '#000',
                                color: '#fff',
                                borderRadius: '0.375rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                border: 'none',
                                cursor: 'pointer',
                            },
                            textContent: 'Sign up',
                            attributes: { type: 'button' },
                        },
                    ],
                },
            ],
        },
    },
];
