import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Rule, SlugIsUniqueValidator, ValidationContext } from 'sanity';

import { createStudioConfig } from '../sanity/config';
import { isUniquePostSlug, schemaTypes } from '../sanity/schema';
import StudioLayout from '../src/app/(studio)/layout';
import StudioPage, { metadata } from '../src/app/(studio)/studio/[[...tool]]/page';
import { SAMPLE_CONTENT } from '../src/lib/content';
import { studioConnectionFromEnvironment } from '../src/lib/studio-config';

// Execute the validators attached to the actual schema without creating a Sanity project.
function fieldValidation(type: string, name: string) {
    const field = schemaTypes
        .find((schema) => schema.name === type)
        ?.fields.find((field) => field.name === name);
    if (!field || typeof field.validation !== 'function')
        throw new Error('Missing field validator');
    let required = false;
    let validator: ((value: unknown, context: ValidationContext) => unknown) | undefined;
    const rule = {
        required() {
            required = true;
            return rule;
        },
        custom(callback: typeof validator) {
            validator = callback;
            return rule;
        },
    };
    (field.validation as unknown as (rule: Rule) => unknown)(rule as unknown as Rule);
    return {
        required,
        validate: (value: unknown) => {
            if (!validator) throw new Error('Missing custom validator');
            return validator(value, {} as ValidationContext);
        },
    };
}

describe('Studio schema matches the published website', () => {
    test('requires nonblank homepage and article text', () => {
        for (const [type, fields] of [
            ['pilotHome', ['title', 'intro']],
            ['pilotPost', ['title', 'excerpt', 'category']],
        ] as const) {
            for (const field of fields) {
                const validation = fieldValidation(type, field);
                expect(validation.required).toBe(true);
                expect(validation.validate('Text')).toBe(true);
                for (const value of [undefined, '', '   ']) {
                    expect(validation.validate(value)).not.toBe(true);
                }
            }
        }
    });

    test('accepts canonical slugs and real publication dates', () => {
        const slug = fieldValidation('pilotPost', 'slug');
        const date = fieldValidation('pilotPost', 'publishedAt');
        expect(slug.required).toBe(true);
        expect(date.required).toBe(true);
        expect(slug.validate({ current: 'en-artikel-2' })).toBe(true);
        for (const current of ['Uppercase', 'two--hyphens', '../secret', '', 'trailing-']) {
            expect(slug.validate({ current })).not.toBe(true);
        }
        expect(date.validate('2026-10-01T12:30:00.000Z')).toBe(true);
        for (const value of [undefined, '', 'not-a-date', '2026-02-30T12:00:00Z']) {
            expect(date.validate(value)).not.toBe(true);
        }
    });

    test('requires image descriptions only when an asset is selected', () => {
        const image = fieldValidation('pilotPost', 'mainImage');
        expect(image.required).toBe(false);
        expect(image.validate(undefined)).toBe(true);
        expect(image.validate({})).toBe(true);
        expect(image.validate({ asset: { _ref: 'image-id' }, alt: 'En bild' })).toBe(true);
        expect(image.validate({ asset: { _ref: 'image-id' }, alt: ' ' })).not.toBe(true);
    });

    test('requires supported nonempty body text and rejects lists and annotations', () => {
        const body = fieldValidation('pilotPost', 'body');
        expect(body.required).toBe(true);
        expect(body.validate(SAMPLE_CONTENT.posts[0].body)).toBe(true);
        const block = SAMPLE_CONTENT.posts[0].body[0];
        for (const value of [
            undefined,
            [],
            [{ ...block, listItem: 'bullet' }],
            [
                {
                    ...block,
                    markDefs: [{ _key: 'link', _type: 'link', href: 'https://example.com' }],
                },
            ],
            [
                {
                    ...block,
                    children: [{ _key: 's', _type: 'span', text: ' ', marks: [] }],
                },
            ],
            [
                {
                    ...block,
                    children: [{ _key: 's', _type: 'span', text: 'Text', marks: ['link'] }],
                },
            ],
        ]) {
            expect(body.validate(value)).not.toBe(true);
        }
    });

    test('slug uniqueness reads the dataset and excludes the same document draft', async () => {
        for (const unique of [true, false]) {
            let queried = false;
            const client = {
                withConfig(options: unknown) {
                    expect(options).toEqual({ perspective: 'raw', useCdn: false });
                    return client;
                },
                async fetch(query: string, params: unknown) {
                    queried = true;
                    expect(query).toContain('_type == "pilotPost"');
                    expect(query).toContain('slug.current == $slug');
                    expect(params).toEqual({
                        slug: 'en-artikel',
                        publishedId: 'article-one',
                        draftId: 'drafts.article-one',
                    });
                    return unique;
                },
            };
            const context = {
                document: { _id: 'drafts.article-one' },
                getClient(options: unknown) {
                    expect(options).toEqual({ apiVersion: '2025-02-19' });
                    return client;
                },
            } as unknown as Parameters<SlugIsUniqueValidator>[1];
            expect(await isUniquePostSlug('en-artikel', context)).toBe(unique);
            expect(queried).toBe(true);
        }
    });
});

describe('embedded Studio integration', () => {
    test('only sends validated public identifiers to the Studio', () => {
        const env = {
            SANITY_PROJECT_ID: 'abc12345',
            SANITY_DATASET: 'production',
            SANITY_READ_TOKEN: 'must-stay-on-server',
        };
        expect(studioConnectionFromEnvironment(env)).toEqual({
            projectId: 'abc12345',
            dataset: 'production',
        });
        expect(studioConnectionFromEnvironment({})).toBeNull();
        expect(
            studioConnectionFromEnvironment({
                ...env,
                SANITY_PROJECT_ID: 'host.example',
            }),
        ).toBeNull();
        expect(
            studioConnectionFromEnvironment({ ...env, SANITY_DATASET: '../private' }),
        ).toBeNull();
    });

    test('homepage creation and destructive actions are removed from Studio menus', () => {
        const config = createStudioConfig({
            projectId: 'abc12345',
            dataset: 'production',
        });
        expect(config.basePath).toBe('/studio');
        const templates = config.schema?.templates;
        const newDocumentOptions = config.document?.newDocumentOptions;
        const actions = config.document?.actions;
        if (
            typeof templates !== 'function' ||
            typeof newDocumentOptions !== 'function' ||
            typeof actions !== 'function'
        ) {
            throw new Error('Missing singleton menu restrictions');
        }
        const availableTemplates = [
            { id: 'pilotHome', title: 'Home', schemaType: 'pilotHome', value: {} },
            { id: 'pilotPost', title: 'Post', schemaType: 'pilotPost', value: {} },
        ];
        expect(templates(availableTemplates).map((item) => item.id)).toEqual(['pilotPost']);
        const options = [{ templateId: 'pilotHome' }, { templateId: 'pilotPost' }];
        expect(newDocumentOptions(options)).toEqual([options[1]]);
        const allowedActions = [
            'publish',
            'discardChanges',
            'restore',
            'duplicate',
            'delete',
            'unpublish',
        ].map((action) => Object.assign(() => null, { action })) as unknown as Parameters<
            typeof actions
        >[0];
        const homeContext = { schemaType: 'pilotHome' } as Parameters<typeof actions>[1];
        expect(actions(allowedActions, homeContext).map((action) => action.action)).toEqual([
            'publish',
            'discardChanges',
            'restore',
        ]);
        expect(actions(allowedActions, { ...homeContext, schemaType: 'pilotPost' })).toEqual(
            allowedActions,
        );
    });

    test('renders setup help without samples and keeps Studio outside website chrome', () => {
        const previous = process.env.SANITY_PROJECT_ID;
        try {
            delete process.env.SANITY_PROJECT_ID;
            const html = renderToStaticMarkup(<StudioLayout>{StudioPage()}</StudioLayout>);
            expect(html).toContain('Studio är inte anslutet.');
            expect(html).toContain('SANITY_PROJECT_ID');
            expect(html).not.toContain('<header');
            expect(html).not.toContain('Exempelinnehåll');
            expect(metadata.robots).toBe('noindex');
        } finally {
            if (previous === undefined) delete process.env.SANITY_PROJECT_ID;
            else process.env.SANITY_PROJECT_ID = previous;
        }
    });
});
