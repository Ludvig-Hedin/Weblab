import { CLOUD_PILOT_TEMPLATE, initialPilotContent } from '@convex/lib/cloudPilot';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PilotTemplate } from './template';

describe('fixed pilot template', () => {
    test('renders content as literal text', () => {
        const content = {
            ...initialPilotContent('<script>alert(1)</script>'),
            description: '<img src=x onerror=alert(1)>',
        };
        const html = renderToStaticMarkup(
            <PilotTemplate template={CLOUD_PILOT_TEMPLATE} content={content} />,
        );
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img');
    });

    test('does not render script links or private image URLs from a draft', () => {
        const content = {
            ...initialPilotContent('Safe'),
            imageUrl: 'https://127.0.0.1/private',
            imageAlt: 'Image',
            ctaLabel: 'Go',
            ctaHref: 'javascript:alert(1)',
        };
        const html = renderToStaticMarkup(
            <PilotTemplate template={CLOUD_PILOT_TEMPLATE} content={content} />,
        );
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<a ');
    });

    test('uses the external image directly without a server proxy', () => {
        const content = {
            ...initialPilotContent('Safe'),
            imageUrl: 'https://images.example.com/photo.jpg',
            imageAlt: 'A photo',
            ctaLabel: 'Visit',
            ctaHref: 'https://example.com',
        };
        const html = renderToStaticMarkup(
            <PilotTemplate template={CLOUD_PILOT_TEMPLATE} content={content} />,
        );
        expect(html).toContain('src="https://images.example.com/photo.jpg"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).not.toContain('/_next/image');
    });

    test('rejects an unknown template version', () => {
        expect(() =>
            renderToStaticMarkup(
                <PilotTemplate template="future-v2" content={initialPilotContent('Safe')} />,
            ),
        ).toThrow('PILOT_UNSUPPORTED');
    });
});
