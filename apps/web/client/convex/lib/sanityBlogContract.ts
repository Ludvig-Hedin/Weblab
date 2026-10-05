// Exact customer blogPost schema. Keep provider metadata; edit only named fields.
export const BLOG_PROFILE = 'sanity-blog-v1' as const;
export const SANITY_BLOG_MAX_BYTES = 256 * 1024;
export type BlogSummary = {
    documentId: string;
    title: string;
    slug: string;
    excerpt: string;
    publishedAt: string;
};
export const BLOG_TEXT_STYLES = ['normal', 'h2', 'h3', 'h4', 'blockquote'] as const;
export type BlogTextStyle = typeof BLOG_TEXT_STYLES[number];
export type BlogStructuralOperation =
    | { kind: 'appendText'; blockKey: string; spanKey: string }
    | { kind: 'blockStyle'; blockKey: string; style: BlogTextStyle }
    | { kind: 'decorator'; blockKey: string; spanKey: string; decorator: 'strong' | 'em'; enabled: boolean };
export type BlogOperation =
    | BlogStructuralOperation
    | { kind: 'set'; field: 'title' | 'slug' | 'excerpt' | 'publishedAt' | 'author'; value: string }
    | { kind: 'categories'; value: string[] }
    | { kind: 'span'; blockKey: string; spanKey: string; text: string }
    | { kind: 'link'; blockKey: string; markKey: string; href: string }
    | { kind: 'imageText'; blockKey: string; field: 'alt' | 'caption'; value: string };

function invalid(message: string): never {
    throw new Error(`BAD_REQUEST: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object.');
    return value as Record<string, unknown>;
}
function boundedJson(json: string): unknown {
    if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > SANITY_BLOG_MAX_BYTES) invalid('Blog document is too large.');
    try { return JSON.parse(json); } catch { invalid('Invalid blog JSON.'); }
}
function text(value: unknown, name: string, limit = 10_000, required = false): string {
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) invalid(`Invalid ${name}.`);
    return value;
}
export function sanitizeSanityCoordinates(projectId: string, dataset: string): { projectId: string; dataset: string } {
    if (typeof projectId !== 'string' || !/^[a-z0-9]{1,32}$/.test(projectId) ||
        typeof dataset !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset)) invalid('Invalid Sanity project or dataset.');
    return { projectId, dataset };
}
function identity(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value) || /^(drafts|versions)\./.test(value)) invalid('Expected a published blog document identity.');
    return value;
}
function slug(value: unknown): string {
    if (typeof value !== 'string' || value.length > 96 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) invalid('Invalid blog slug.');
    return value;
}
function sourceSlug(value: unknown): string {
    if (typeof value !== 'string' || !value.includes('%')) return slug(value);
    // Older published paths include percent-encoded Unicode, including an
    // emoji. Keep that exact URL while refusing path delimiters or traversal.
    if (value.length > 96 || !/^(?:[a-z0-9-]|%[a-fA-F0-9]{2})+$/.test(value)) invalid('Invalid blog source slug.');
    let decoded: string;
    try { decoded = decodeURIComponent(value); } catch { invalid('Invalid blog source slug encoding.'); }
    if (!/^[\p{L}\p{N}\p{M}\p{S}]+(?:-[\p{L}\p{N}\p{M}\p{S}]+)*$/u.test(decoded) ||
        Array.from(decoded).some((character) => character.charCodeAt(0) <= 127 && !/^[a-zA-Z0-9-]$/.test(character))) invalid('Invalid blog source slug.');
    return value;
}
function publicationDate(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) invalid('Invalid publication date.');
    // Date.parse accepts rolled-over dates such as February 30.
    const calendar = value.slice(0, 10);
    if (new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar || Number(value.slice(11, 13)) > 23) invalid('Invalid publication date.');
    return value;
}
function categories(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 100) invalid('Invalid blog categories.');
    return value.map((entry) => text(entry, 'category', 120, true));
}
function localIdentity(value: string): boolean {
    return /^weblab-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}
export function parseBlogDocument(json: string): Record<string, unknown> {
    const doc = object(boundedJson(json));
    const id = identity(doc._id);
    if (doc._type !== 'blogPost') invalid('Unsupported blog document type.');
    if (doc._rev === undefined) {
        if (!localIdentity(id)) invalid('Blog source revision is missing.');
    } else if (typeof doc._rev !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(doc._rev)) invalid('Invalid blog source revision.');
    text(doc.title, 'title', 10_000, true);
    const slugValue = object(doc.slug);
    if (slugValue._type !== 'slug') invalid('Invalid blog slug structure.');
    sourceSlug(slugValue.current);
    publicationDate(doc.publishedAt);
    if (doc.excerpt !== undefined && doc.excerpt !== null) text(doc.excerpt, 'excerpt', 280);
    if (doc.author !== undefined && doc.author !== null) text(doc.author, 'author', 1000);
    if (doc.categories !== undefined && doc.categories !== null) categories(doc.categories);
    if (doc.content !== undefined && doc.content !== null && !Array.isArray(doc.content)) invalid('Invalid blog content.');
    if (doc.heroImage !== undefined && doc.heroImage !== null && object(doc.heroImage)._type !== 'image') invalid('Invalid hero image.');
    if (doc.seo !== undefined && doc.seo !== null) object(doc.seo);
    return doc;
}
function key(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) invalid('Invalid content key.');
    return value;
}
function href(value: unknown): string {
    const address = text(value, 'link', 4096, true);
    if (/\s|[\u0000-\u001f\u007f]/.test(address)) invalid('Invalid link destination.');
    let url: URL;
    try { url = new URL(address); } catch { invalid('Invalid link destination.'); }
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) || url.username || url.password ||
        ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname) || !url.pathname && !url.hostname) invalid('Unsupported link destination.');
    return address;
}
function exact(operation: Record<string, unknown>, keys: string[]): void {
    if (Object.keys(operation).some((name) => !keys.includes(name)) || keys.some((name) => !Object.hasOwn(operation, name))) invalid('Unsupported blog operation fields.');
}
export function parseBlogOperations(json: string): BlogOperation[] {
    const operations = boundedJson(json);
    if (!Array.isArray(operations) || !operations.length || operations.length > 1000) invalid('Supply 1-1000 blog operations.');
    return operations.map((raw): BlogOperation => {
        const operation = object(raw);
        switch (operation.kind) {
            case 'appendText':
            case 'blockStyle':
            case 'decorator':
                return parseStructuralOperation(operation);
            case 'set': {
                exact(operation, ['kind', 'field', 'value']);
                const field = operation.field;
                if (field !== 'title' && field !== 'slug' && field !== 'excerpt' && field !== 'publishedAt' && field !== 'author') invalid('Unsupported blog field.');
                const value = field === 'slug' ? slug(operation.value) : field === 'publishedAt' ? publicationDate(operation.value)
                    : text(operation.value, field, field === 'excerpt' ? 280 : field === 'author' ? 1000 : 10_000, field === 'title');
                return { kind: 'set', field, value };
            }
            case 'categories':
                exact(operation, ['kind', 'value']);
                return { kind: 'categories', value: categories(operation.value) };
            case 'span':
                exact(operation, ['kind', 'blockKey', 'spanKey', 'text']);
                return { kind: 'span', blockKey: key(operation.blockKey), spanKey: key(operation.spanKey), text: text(operation.text, 'span') };
            case 'link':
                exact(operation, ['kind', 'blockKey', 'markKey', 'href']);
                return { kind: 'link', blockKey: key(operation.blockKey), markKey: key(operation.markKey), href: href(operation.href) };
            case 'imageText': {
                exact(operation, ['kind', 'blockKey', 'field', 'value']);
                if (operation.field !== 'alt' && operation.field !== 'caption') invalid('Unsupported image field.');
                return { kind: 'imageText', blockKey: key(operation.blockKey), field: operation.field, value: text(operation.value, operation.field) };
            }
            default: invalid('Unsupported blog operation.');
        }
    });
}
function keyedEntries(values: unknown): Record<string, unknown>[] {
    if (!Array.isArray(values)) invalid('Content structure is read-only.');
    const keys = new Set<string>();
    return values.map((value) => {
        const entry = object(value);
        const entryKey = key(entry._key);
        if (keys.has(entryKey)) invalid('Content keys must be unique.');
        keys.add(entryKey);
        return entry;
    });
}
function uniqueTarget(values: unknown, target: string): Record<string, unknown> {
    const match = keyedEntries(values).find((entry) => entry._key === target);
    if (!match) invalid('Content key is missing. Reload before editing.');
    return match;
}
function editableTextBlock(block: Record<string, unknown>): void {
    if (block._type !== 'block' || !BLOG_TEXT_STYLES.some((style) => style === (block.style ?? 'normal')) ||
        (block.listItem !== undefined && block.listItem !== 'bullet' && block.listItem !== 'number') ||
        (block.level !== undefined && (typeof block.level !== 'number' || !Number.isInteger(block.level) || block.level < 1)) ||
        !Array.isArray(block.children) || !Array.isArray(block.markDefs ?? [])) invalid('This content block is read-only.');
    const links = new Set<string>();
    for (const raw of (block.markDefs ?? []) as unknown[]) {
        const mark = object(raw);
        const markKey = key(mark._key);
        if (links.has(markKey)) invalid('Content keys must be unique.');
        links.add(markKey);
        if (mark._type !== 'link' || typeof mark.href !== 'string') invalid('This content block is read-only.');
    }
    const spans = new Set<string>();
    for (const raw of block.children) {
        const span = object(raw);
        const spanKey = key(span._key);
        if (spans.has(spanKey)) invalid('Content keys must be unique.');
        spans.add(spanKey);
        if (span._type !== 'span' || typeof span.text !== 'string' || !Array.isArray(span.marks) ||
            span.marks.some((mark) => mark !== 'strong' && mark !== 'em' && (typeof mark !== 'string' || !links.has(mark)))) invalid('This content block is read-only.');
    }
}
function parseStructuralOperation(raw: unknown): BlogStructuralOperation {
    const operation = object(raw);
    switch (operation.kind) {
        case 'appendText':
            exact(operation, ['kind', 'blockKey', 'spanKey']);
            return { kind: 'appendText', blockKey: key(operation.blockKey), spanKey: key(operation.spanKey) };
        case 'blockStyle':
            exact(operation, ['kind', 'blockKey', 'style']);
            if (!BLOG_TEXT_STYLES.some((style) => style === operation.style)) invalid('Unsupported text style.');
            return { kind: 'blockStyle', blockKey: key(operation.blockKey), style: operation.style as BlogTextStyle };
        case 'decorator':
            exact(operation, ['kind', 'blockKey', 'spanKey', 'decorator', 'enabled']);
            if ((operation.decorator !== 'strong' && operation.decorator !== 'em') || typeof operation.enabled !== 'boolean') invalid('Unsupported text decorator.');
            return { kind: 'decorator', blockKey: key(operation.blockKey), spanKey: key(operation.spanKey), decorator: operation.decorator, enabled: operation.enabled };
        default: invalid('Unsupported structural operation.');
    }
}

/** Shape-only checks allow incomplete scalar/link typing without relaxing saves. */
export function blogEditableTextKeys(doc: Record<string, unknown>): Set<string> {
    const keys = new Set<string>();
    let blocks: Record<string, unknown>[];
    try { blocks = keyedEntries(doc.content ?? []); } catch { return keys; }
    for (const block of blocks) {
        try { editableTextBlock(block); keys.add(key(block._key)); } catch { /* Preserve unsupported blocks. */ }
    }
    return keys;
}

/** The same exact keyed structural edit is used for local recovery and saves. */
export function applyBlogStructuralOperation(doc: Record<string, unknown>, raw: unknown): void {
    const operation = parseStructuralOperation(raw);
    const blocks = keyedEntries(doc.content ?? []);
    if (operation.kind === 'appendText') {
        if (blocks.some((block) => block._key === operation.blockKey)) invalid('Content keys must be unique.');
        doc.content = [...blocks, { _type: 'block', _key: operation.blockKey, style: 'normal', markDefs: [],
            children: [{ _type: 'span', _key: operation.spanKey, text: '', marks: [] }] }];
        return;
    }
    const block = uniqueTarget(blocks, operation.blockKey);
    editableTextBlock(block);
    if (operation.kind === 'blockStyle') { block.style = operation.style; return; }
    if ((block.markDefs as unknown[] | undefined)?.some((mark) => {
        const definition = object(mark);
        return definition._key === 'strong' || definition._key === 'em';
    })) invalid('Reserved decorator annotation keys are read-only.');
    const span = uniqueTarget(block.children, operation.spanKey);
    const marks = span.marks as string[];
    span.marks = operation.enabled ? (marks.includes(operation.decorator) ? marks : [...marks, operation.decorator])
        : marks.filter((mark) => mark !== operation.decorator);
}
export function applyBlogOperations(originalJson: string, operationsJson: string): string {
    const doc = parseBlogDocument(originalJson);
    for (const operation of parseBlogOperations(operationsJson)) {
        if (operation.kind === 'appendText' || operation.kind === 'blockStyle' || operation.kind === 'decorator') {
            applyBlogStructuralOperation(doc, operation);
        } else if (operation.kind === 'set') {
            if (operation.field === 'slug') doc.slug = { ...object(doc.slug), current: operation.value };
            else doc[operation.field] = operation.value;
        } else if (operation.kind === 'categories') doc.categories = operation.value;
        else {
            const block = uniqueTarget(doc.content, operation.blockKey);
            if (operation.kind === 'imageText') {
                if (block._type !== 'image') invalid('This content block is read-only.');
                block[operation.field] = operation.value;
            } else {
                editableTextBlock(block);
                if (operation.kind === 'span') uniqueTarget(block.children, operation.spanKey).text = operation.text;
                else uniqueTarget(block.markDefs, operation.markKey).href = operation.href;
            }
        }
    }
    const result = JSON.stringify(doc);
    parseBlogDocument(result);
    return result;
}
export function newBlogDocument(documentId: string, title: string, newSlug: string, publishedAt: string): string {
    if (!localIdentity(documentId)) invalid('New blog documents need a local UUID identity.');
    slug(newSlug);
    const json = JSON.stringify({ _id: documentId, _type: 'blogPost', title, slug: { _type: 'slug', current: newSlug }, publishedAt, excerpt: '', author: '', categories: [],
        content: [{ _type: 'block', _key: 'block-new', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 'span-new', text: '', marks: [] }] }],
    });
    parseBlogDocument(json);
    return json;
}
export function blogSummary(json: string): BlogSummary {
    const doc = parseBlogDocument(json);
    return { documentId: doc._id as string, title: doc.title as string, slug: object(doc.slug).current as string, excerpt: typeof doc.excerpt === 'string' ? doc.excerpt : '', publishedAt: doc.publishedAt as string };
}
