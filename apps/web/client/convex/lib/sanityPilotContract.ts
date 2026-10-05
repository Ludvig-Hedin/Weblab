// The supported contract is the existing examples/sanity-pilot schema.
// Arbitrary Studio schemas are not inferred from sample documents.
export const SANITY_PILOT_PROFILE = 'sanity-pilot-v1' as const;
export const SANITY_DOCUMENT_BYTES = 256 * 1024;
export type SanityPilotType = 'pilotHome' | 'pilotPost';
export type SanityDocument = Record<string, unknown> & {
    _id: string;
    _rev: string;
    _type: SanityPilotType;
};

function invalid(message: string): never {
    throw new Error(`BAD_REQUEST: ${message}`);
}

export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object.');
    return value as Record<string, unknown>;
}

export function parseBoundedJson(json: string): Record<string, unknown> {
    if (new TextEncoder().encode(json).byteLength > SANITY_DOCUMENT_BYTES) invalid('Document is too large.');
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { invalid('Invalid document JSON.'); }
    return object(parsed);
}

export function documentId(id: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(id) || /^(drafts|versions)\./.test(id)) {
        invalid('Expected a published document identity.');
    }
    return id;
}

export function revision(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) invalid('Unknown remote revision.');
    return value;
}

function nonblank(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 10_000) invalid(`${name} needs text of at most 10000 characters.`);
    return value;
}

function body(value: unknown): void {
    if (!Array.isArray(value) || !value.length || value.length > 200) invalid('Body needs 1-200 supported blocks.');
    const keys = new Set<string>();
    let spans = 0;
    let hasText = false;
    for (const raw of value) {
        const block = object(raw);
        const key = nonblank(block._key, 'Block key');
        if (keys.has(key)) invalid('Body block keys must be unique.');
        keys.add(key);
        if (block._type !== 'block' || !['normal', 'h2'].includes(String(block.style)) ||
            block.listItem !== undefined || block.level !== undefined ||
            (block.markDefs !== undefined && (!Array.isArray(block.markDefs) || block.markDefs.length !== 0)) ||
            !Array.isArray(block.children) || !block.children.length) invalid('This PortableText structure is not supported by the pilot.');
        const childKeys = new Set<string>();
        for (const rawChild of block.children) {
            if (++spans > 1000) invalid('Body has too many spans.');
            const child = object(rawChild);
            const childKey = nonblank(child._key, 'Span key');
            if (childKeys.has(childKey)) invalid('Span keys must be unique within a block.');
            childKeys.add(childKey);
            if (child._type !== 'span' || typeof child.text !== 'string' || child.text.length > 10_000 ||
                !Array.isArray(child.marks) || child.marks.some((mark) => mark !== 'strong' && mark !== 'em')) {
                invalid('This PortableText span is not supported by the pilot.');
            }
            hasText ||= child.text.trim().length > 0;
        }
    }
    if (!hasText) invalid('Body needs text.');
}

export function validatePilotDocument(value: unknown): Record<string, unknown> {
    const doc = object(value);
    if (new TextEncoder().encode(JSON.stringify(doc)).byteLength > SANITY_DOCUMENT_BYTES) invalid('Document is too large.');
    if (doc._type !== 'pilotHome' && doc._type !== 'pilotPost') invalid('Unsupported Sanity document type.');
    nonblank(doc.title, 'Title');
    if (doc._type === 'pilotHome') {
        nonblank(doc.intro, 'Intro');
        if (doc._id !== 'pilot-home' && doc._id !== 'drafts.pilot-home') invalid('The homepage is a singleton.');
    } else {
        const slug = object(doc.slug);
        if (slug._type !== 'slug' || typeof slug.current !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.current) || slug.current.length > 120) invalid('Invalid post slug.');
        nonblank(doc.excerpt, 'Excerpt');
        nonblank(doc.category, 'Category');
        const date = doc.publishedAt;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(date) ||
            Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date.slice(0, 10)) invalid('Invalid publication date.');
        body(doc.body);
        if (doc.mainImage !== undefined && doc.mainImage !== null) {
            const image = object(doc.mainImage);
            if (image._type !== 'image') invalid('Unsupported image structure.');
            if (image.asset !== undefined) {
                const asset = object(image.asset);
                if (asset._type !== 'reference' || typeof asset._ref !== 'string' || !/^image-[a-zA-Z0-9]+-\d+x\d+-[a-zA-Z0-9]+$/.test(asset._ref)) invalid('Invalid Sanity image reference.');
                nonblank(image.alt, 'Image description');
            }
        }
    }
    return doc;
}

export function remoteDocument(value: unknown, expectedId?: string): SanityDocument {
    const doc = object(value);
    if (typeof doc._id !== 'string') invalid('Remote document identity is missing.');
    const baseId = doc._id.startsWith('drafts.') ? doc._id.slice(7) : doc._id;
    documentId(baseId);
    if (expectedId !== undefined && doc._id !== expectedId) invalid('Unexpected remote document identity.');
    revision(doc._rev);
    if (doc._type !== 'pilotHome' && doc._type !== 'pilotPost') invalid('Unsupported remote document type.');
    return doc as SanityDocument;
}

export function draftChanges(current: SanityDocument, changes: Record<string, unknown>): {
    set: Record<string, unknown>;
    unset: string[];
    expected: Record<string, unknown>;
} {
    const allowed = current._type === 'pilotHome' ? ['title', 'intro'] : ['title', 'slug', 'excerpt', 'category', 'publishedAt', 'body', 'mainImage'];
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
        if (!allowed.includes(key)) invalid(`Field ${key} cannot be changed by this profile.`);
        if (key === 'mainImage') {
            if (value === null) { unset.push(key); continue; }
            const prior = object(current.mainImage);
            const next = object(value);
            // Uploads are private project assets in a separate reviewed slice.
            // This path edits alt text only and preserves crop, hotspot and asset metadata.
            if (Object.keys(next).some((name) => name !== 'alt')) invalid('Image replacement requires the private asset workflow.');
            set.mainImage = { ...prior, alt: nonblank(next.alt, 'Image description') };
        } else if (key === 'slug') {
            const prior = current.slug === undefined ? {} : object(current.slug);
            const next = object(value);
            if (Object.keys(next).some((name) => name !== 'current')) invalid('Only the slug value can be changed.');
            set.slug = { ...prior, _type: 'slug', current: next.current };
        } else {
            set[key] = value;
        }
    }
    if (Object.keys(set).length + unset.length === 0) invalid('No changes were supplied.');
    const expected: Record<string, unknown> = { ...current, ...set };
    for (const key of unset) delete expected[key];
    validatePilotDocument(expected);
    return { set, unset, expected };
}

export function newPost(id: string, values: Record<string, unknown>): Record<string, unknown> {
    documentId(id);
    if (id === 'pilot-home') invalid('The homepage cannot be created as a post.');
    if (Object.keys(values).some((key) => !['title', 'slug', 'excerpt', 'category', 'publishedAt', 'body'].includes(key))) invalid('Unsupported new post field.');
    const slug = object(values.slug);
    if (Object.keys(slug).some((key) => key !== 'current')) invalid('Only the slug value can be supplied.');
    return validatePilotDocument({ ...values, slug: { _type: 'slug', current: slug.current }, _id: `drafts.${id}`, _type: 'pilotPost' });
}
