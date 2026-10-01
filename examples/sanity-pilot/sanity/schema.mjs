// Add these types to a disposable Sanity Studio's schemaTypes array.
export const schemaTypes = [
    {
        name: 'pilotHome',
        title: 'Startsida',
        type: 'document',
        fields: [
            { name: 'title', title: 'Rubrik', type: 'string' },
            { name: 'intro', title: 'Inledning', type: 'text' },
        ],
    },
    {
        name: 'pilotPost',
        title: 'Blogginlägg',
        type: 'document',
        fields: [
            { name: 'title', title: 'Rubrik', type: 'string' },
            { name: 'slug', title: 'Adress', type: 'slug', options: { source: 'title' } },
            { name: 'excerpt', title: 'Ingress', type: 'text' },
            { name: 'category', title: 'Kategori', type: 'string' },
            { name: 'publishedAt', title: 'Publiceringsdatum', type: 'datetime' },
            {
                name: 'mainImage',
                title: 'Bild',
                type: 'image',
                fields: [{ name: 'alt', title: 'Bildbeskrivning', type: 'string' }],
            },
            {
                name: 'body',
                title: 'Innehåll',
                type: 'array',
                of: [
                    {
                        type: 'block',
                        styles: [
                            { title: 'Text', value: 'normal' },
                            { title: 'Rubrik', value: 'h2' },
                        ],
                        lists: [],
                        marks: {
                            decorators: [
                                { title: 'Fet', value: 'strong' },
                                { title: 'Kursiv', value: 'em' },
                            ],
                            annotations: [],
                        },
                    },
                ],
            },
        ],
    },
];
