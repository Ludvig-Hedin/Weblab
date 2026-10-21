import { defineArrayMember, defineField, defineType } from 'sanity';
import type { SlugIsUniqueValidator } from 'sanity';

import copy from '../src/lib/copy.json';
import {
    isCanonicalSlug,
    isNonblankText,
    isPublishedDate,
    validateBody,
    validateImage,
} from '../src/lib/content-validation';

export const isUniquePostSlug: SlugIsUniqueValidator = async (slug, context) => {
    const publishedId = (context.document?._id ?? '').replace(/^drafts\./, '');
    const client = context.getClient({ apiVersion: '2025-02-19' }).withConfig({
        perspective: 'raw',
        useCdn: false,
    });
    return client.fetch<boolean>(
        '!defined(*[_type == "pilotPost" && slug.current == $slug && !(_id in [$publishedId, $draftId])][0]._id)',
        { slug, publishedId, draftId: `drafts.${publishedId}` },
    );
};

export const schemaTypes = [
    defineType({
        name: 'pilotHome',
        title: copy.homeTitle,
        type: 'document',
        fields: [
            defineField({
                name: 'title',
                title: copy.titleLabel,
                type: 'string',
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isNonblankText(value) ? true : copy.requiredText,
                    ),
            }),
            defineField({
                name: 'intro',
                title: copy.introLabel,
                type: 'text',
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isNonblankText(value) ? true : copy.requiredText,
                    ),
            }),
        ],
    }),
    defineType({
        name: 'pilotPost',
        title: copy.postTitle,
        type: 'document',
        fields: [
            defineField({
                name: 'title',
                title: copy.titleLabel,
                type: 'string',
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isNonblankText(value) ? true : copy.requiredText,
                    ),
            }),
            defineField({
                name: 'slug',
                title: copy.slugLabel,
                type: 'slug',
                options: { source: 'title', isUnique: isUniquePostSlug },
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isCanonicalSlug(value?.current) ? true : copy.invalidSlug,
                    ),
            }),
            defineField({
                name: 'excerpt',
                title: copy.excerptLabel,
                type: 'text',
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isNonblankText(value) ? true : copy.requiredText,
                    ),
            }),
            defineField({
                name: 'category',
                title: copy.categoryLabel,
                type: 'string',
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isNonblankText(value) ? true : copy.requiredText,
                    ),
            }),
            defineField({
                name: 'publishedAt',
                title: copy.publishedAtLabel,
                type: 'datetime',
                validation: (Rule) =>
                    Rule.required().custom((value) =>
                        isPublishedDate(value) ? true : copy.invalidDate,
                    ),
            }),
            defineField({
                name: 'mainImage',
                title: copy.imageLabel,
                type: 'image',
                validation: (Rule) => Rule.custom(validateImage),
                fields: [defineField({ name: 'alt', title: copy.altLabel, type: 'string' })],
            }),
            defineField({
                name: 'body',
                title: copy.bodyLabel,
                type: 'array',
                validation: (Rule) => Rule.required().custom(validateBody),
                of: [
                    defineArrayMember({
                        type: 'block',
                        styles: [
                            { title: copy.textLabel, value: 'normal' },
                            { title: copy.headingLabel, value: 'h2' },
                        ],
                        lists: [],
                        marks: {
                            decorators: [
                                { title: copy.boldLabel, value: 'strong' },
                                { title: copy.italicLabel, value: 'em' },
                            ],
                            annotations: [],
                        },
                    }),
                ],
            }),
        ],
    }),
];
