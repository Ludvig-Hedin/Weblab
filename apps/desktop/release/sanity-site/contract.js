'use strict';

const { createHash } = require('node:crypto');
const { PROFILE } = require('./profile');

const TYPES = Object.freeze(['siteSettings', 'service', 'review', 'blogPost', 'ekoStambyte', 'faq', 'area', 'product', 'teamMember']);
const LIMITS = Object.freeze({ documents: 1000, assets: 512, selectedDrafts: 8, jsonBytes: 8 * 1024 * 1024, totalJsonBytes: 32 * 1024 * 1024,
    documentBytes: 256 * 1024, imageBytes: 16 * 1024 * 1024, artifactBytes: 100 * 1024 * 1024, requests: 2500, pageSize: 50 });
const PARAMETER_TYPES = Object.freeze({ SERVICE_BY_SLUG_QUERY: 'service', AREA_BY_SLUG_QUERY: 'area', POST_BY_SLUG_QUERY: 'blogPost' });
function refuse(message) { throw new Error(`Frozen website: ${message}`); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function stable(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    }
    refuse('unsupported JSON value.');
}
function clone(value) { return JSON.parse(stable(value)); }
function equal(a, b) { return stable(a) === stable(b); }
function bounded(value, max = LIMITS.jsonBytes) {
    const json = stable(value);
    if (Buffer.byteLength(json) > max) refuse('content exceeds the supported size.');
    return json;
}
function id(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value) || /^(drafts|versions)\./.test(value)) refuse('unsupported published identity.');
    return value;
}
function slug(value) {
    if (typeof value !== 'string' || !value || value.length > 96 || !/^(?:[a-z0-9-]|%[a-fA-F0-9]{2})+$/.test(value)) refuse('unsupported source address.');
    let decoded;
    try { decoded = decodeURIComponent(value); } catch { refuse('invalid source address encoding.'); }
    if (!/^[\p{L}\p{N}\p{M}\p{S}]+(?:-[\p{L}\p{N}\p{M}\p{S}]+)*$/u.test(decoded) || /[/?#\\.\u0000-\u0020\u007f]/.test(decoded)) refuse('unsafe source address.');
    return value;
}
function walk(value, visit, depth = 0, budget = { nodes: 0 }) {
    if (depth > 40 || ++budget.nodes > 150000) refuse('content graph exceeds the supported bound.');
    if (!value || typeof value !== 'object') return;
    visit(value);
    for (const child of Object.values(value)) walk(child, visit, depth + 1, budget);
}
function validatePortableText(value) {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value) || value.length > 5000) refuse('unsupported rich text.');
    const keys = new Set();
    for (const block of value) {
        if (!block || typeof block !== 'object' || typeof block._key !== 'string' || keys.has(block._key)) refuse('invalid rich-text keys.');
        keys.add(block._key);
        if (block._type === 'image') continue;
        if (block._type !== 'block' || !['normal', 'h2', 'h3', 'h4', 'blockquote'].includes(block.style ?? 'normal') ||
            (block.listItem !== undefined && !['bullet', 'number'].includes(block.listItem)) ||
            (block.level !== undefined && (!Number.isInteger(block.level) || block.level < 1 || block.level > 20)) || !Array.isArray(block.children)) refuse('unsupported rich-text block.');
        const definitions = new Map();
        for (const mark of block.markDefs ?? []) {
            if (!mark || mark._type !== 'link' || typeof mark._key !== 'string' || definitions.has(mark._key) || typeof mark.href !== 'string') refuse('unsupported rich-text annotation.');
            let address;
            try { address = new URL(mark.href); } catch { refuse('unsupported rich-text link.'); }
            if (!['http:', 'https:', 'mailto:', 'tel:'].includes(address.protocol) || address.username || address.password) refuse('unsafe rich-text link.');
            definitions.set(mark._key, mark);
        }
        const spans = new Set();
        for (const span of block.children) {
            if (!span || span._type !== 'span' || typeof span._key !== 'string' || spans.has(span._key) || typeof span.text !== 'string' || !Array.isArray(span.marks) ||
                span.marks.some((mark) => !['strong', 'em'].includes(mark) && !definitions.has(mark))) refuse('unsupported rich-text span.');
            spans.add(span._key);
        }
    }
}
function validateDocuments(docs) {
    if (!Array.isArray(docs) || docs.length > LIMITS.documents) refuse('document limit exceeded.');
    const documents = new Map();
    const slugs = new Map();
    for (const doc of docs) {
        if (!doc || !TYPES.includes(doc._type) || typeof doc._rev !== 'string' || !doc._rev) refuse('invalid published document.');
        id(doc._id);
        if (documents.has(doc._id)) refuse('duplicate published document.');
        bounded(doc, LIMITS.documentBytes);
        documents.set(doc._id, doc);
        if (['blogPost', 'area', 'service'].includes(doc._type) && doc.slug?.current !== undefined && doc.slug?.current !== null) {
            const address = slug(doc.slug.current);
            const key = `${doc._type}:${address}`;
            if (slugs.has(key)) refuse('duplicate published address.');
            slugs.set(key, doc._id);
        }
        validatePortableText(doc.content);
        validatePortableText(doc.body);
    }
    for (const type of ['siteSettings', 'ekoStambyte']) if (docs.filter((doc) => doc._type === type).length > 1) refuse('ambiguous singleton content.');
    const assets = new Set();
    for (const doc of docs) walk(doc, (value) => {
        if (value._ref === undefined) return;
        id(value._ref);
        if (/^image-[a-f0-9]+-\d+x\d+-[a-z0-9]+$/.test(value._ref)) { assets.add(value._ref); return; }
        const target = documents.get(value._ref);
        if (!target || target._type !== 'service') refuse('unresolved or unsupported content reference.');
    });
    if (assets.size > LIMITS.assets) refuse('asset limit exceeded.');
    return { documents, assets: [...assets].sort() };
}
function sourceMap(files) {
    if (!Array.isArray(files) || !files.length || files.length > 10000) refuse('invalid source inventory.');
    const map = new Map();
    for (const file of files) {
        if (!file || typeof file.path !== 'string' || file.path.includes('\\') || file.path.split('/').some((part) => !part || part === '.' || part === '..') || map.has(file.path) || !Buffer.isBuffer(file.bytes)) refuse('unsafe source inventory.');
        map.set(file.path, Buffer.from(file.bytes));
    }
    return map;
}
function assertSource(files) {
    const map = sourceMap(files);
    for (const [path, expected] of Object.entries(PROFILE.sourcePins)) if (!map.has(path) || hash(map.get(path)) !== expected) refuse(`approved source changed: ${path}`);
    for (const [path, bytes] of map) {
        if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) || Object.hasOwn(PROFILE.sourcePins, path)) continue;
        if (/sanityFetch|freshClient|urlFor|createClient|next-sanity|(?:@|\/)sanity\/|cdn\.sanity\.io|api\.sanity\.io|\bfetch\s*\(|XMLHttpRequest|\bWebSocket\s*\(/.test(bytes.toString('utf8'))) refuse(`unapproved content caller: ${path}`);
    }
    return { files: map, sourceHash: hash(stable([...map].map(([path, bytes]) => [path, hash(bytes)]).sort((a, b) => a[0].localeCompare(b[0])))) };
}
function pick(doc, fields) { return Object.fromEntries(fields.map((field) => [field, doc[field] === undefined ? null : clone(doc[field])])); }
function postProjection(doc, variant) {
    const fields = ['_id', 'title', 'excerpt', 'publishedAt', 'heroImage'];
    if (variant !== 'home') fields.push('author', 'categories');
    if (variant === 'detail') fields.push('content', 'seo');
    return { ...pick(doc, fields), slug: doc.slug?.current ?? null };
}
function applySelectedDrafts(docs, selectedDrafts) {
    if (!Array.isArray(selectedDrafts) || selectedDrafts.length > LIMITS.selectedDrafts) refuse('selected draft limit exceeded.');
    const candidate = new Map(docs.map((doc) => [doc._id, clone(doc)]));
    const seen = new Set();
    const pins = [];
    for (const draft of selectedDrafts) {
        if (!draft || seen.has(draft.documentId) || !Number.isInteger(draft.revision) || draft.revision < 1 || typeof draft.archived !== 'boolean') refuse('invalid selected draft.');
        id(draft.documentId); seen.add(draft.documentId);
        let original, edited;
        try { original = JSON.parse(draft.originalJson); edited = JSON.parse(draft.documentJson); } catch { refuse('invalid selected draft JSON.'); }
        bounded(original, LIMITS.documentBytes); bounded(edited, LIMITS.documentBytes);
        if (original._id !== draft.documentId || edited._id !== draft.documentId || original._type !== 'blogPost' || edited._type !== 'blogPost') refuse('selected draft identity changed.');
        const current = candidate.get(draft.documentId);
        if (draft.providerRevision === null) {
            if (current || !/^weblab-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(draft.documentId) || original._rev !== undefined || edited._rev !== undefined) refuse('new post already exists or has provider metadata.');
            if (docs.some((doc) => doc._type === 'blogPost' && doc.slug?.current === edited.slug?.current)) refuse('new post address already exists.');
        } else if (!current || current._rev !== draft.providerRevision || original._rev !== draft.providerRevision || !equal(current, original)) refuse('selected draft baseline changed.');
        if (typeof edited.title !== 'string' || !edited.title.trim() || edited.title.length > 10000 || typeof edited.publishedAt !== 'string' || !Number.isFinite(Date.parse(edited.publishedAt))) refuse('invalid edited post.');
        slug(edited.slug?.current);
        if (draft.providerRevision !== null && edited.slug.current !== original.slug?.current) refuse('published post addresses cannot change in this frozen website profile.');
        if (draft.providerRevision === null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edited.slug.current)) refuse('new post addresses must use the approved canonical form.');
        if (draft.providerRevision === null || edited.publishedAt !== original.publishedAt) {
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(edited.publishedAt) ||
                new Date(`${edited.publishedAt.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== edited.publishedAt.slice(0, 10) || Number(edited.publishedAt.slice(11, 13)) > 23) refuse('invalid edited publication date.');
        }
        if ((edited.excerpt !== undefined && edited.excerpt !== null && (typeof edited.excerpt !== 'string' || edited.excerpt.length > 280)) ||
            (edited.author !== undefined && edited.author !== null && (typeof edited.author !== 'string' || edited.author.length > 1000)) ||
            (edited.categories !== undefined && edited.categories !== null && (!Array.isArray(edited.categories) || edited.categories.length > 100 || edited.categories.some((value) => typeof value !== 'string' || !value.trim() || value.length > 120)))) refuse('invalid edited blog fields.');
        if (draft.providerRevision !== null && edited._rev !== original._rev) refuse('provider metadata changed in a draft.');
        const editable = new Set(['title', 'slug', 'excerpt', 'publishedAt', 'author', 'categories', 'content']);
        for (const key of new Set([...Object.keys(original), ...Object.keys(edited)])) {
            if (!editable.has(key) && (Object.hasOwn(original, key) !== Object.hasOwn(edited, key) || !equal(original[key], edited[key]))) refuse('unapproved field changed in a draft.');
        }
        if (draft.archived) candidate.delete(draft.documentId); else candidate.set(draft.documentId, edited);
        pins.push({ documentId: draft.documentId, providerRevision: draft.providerRevision, revision: draft.revision,
            originalHash: hash(stable(original)), documentHash: hash(stable(edited)), archived: draft.archived });
    }
    const output = [...candidate.values()];
    // New local posts have no provider revision; validate their content graph with
    // a temporary validation revision without changing retained document bytes.
    validateDocuments(output.map((doc) => ({ ...doc, _rev: doc._rev ?? 'local-validation' })));
    return { documents: output, pins: pins.sort((a, b) => a.documentId.localeCompare(b.documentId)) };
}
function deriveBlog(docs, evidence, rankDocs = docs) {
    const posts = docs.filter((doc) => doc._type === 'blogPost');
    const dated = posts.filter((doc) => doc.publishedAt !== undefined && doc.publishedAt !== null);
    if (dated.some((doc) => typeof doc.publishedAt !== 'string')) refuse('unsupported blog ordering value.');
    const list = evidence.POSTS_QUERY;
    const slugList = evidence.POST_SLUGS_QUERY;
    if (!Array.isArray(list) || !Array.isArray(slugList)) refuse('blog projection evidence is missing.');
    const rank = new Map(list.map((doc, index) => [doc._id, index]));
    const baseline = new Map(rankDocs.filter((doc) => doc._type === 'blogPost').map((doc) => [doc._id, doc]));
    for (const doc of dated) {
        const previous = baseline.get(doc._id);
        if (!previous || previous.publishedAt !== doc.publishedAt) {
            if (dated.some((other) => other._id !== doc._id && other.publishedAt === doc.publishedAt)) refuse('new publication date creates an unsupported ordering tie.');
        }
    }
    dated.sort((a, b) => a.publishedAt === b.publishedAt ? (rank.get(a._id) ?? -1) - (rank.get(b._id) ?? -1) : a.publishedAt > b.publishedAt ? -1 : 1);
    const addresses = posts.filter((doc) => doc.slug?.current !== undefined && doc.slug?.current !== null);
    // Unordered original GROQ follows dataset document order. Provider evidence
    // pins that order; creation is supported only after _id-order equivalence.
    const baselineAddresses = rankDocs.filter((doc) => doc._type === 'blogPost' && doc.slug?.current !== undefined && doc.slug?.current !== null).sort((a, b) => a._id < b._id ? -1 : 1);
    if (!equal(baselineAddresses.map((doc) => ({ slug: doc.slug.current })), slugList)) refuse('unsupported provider slug ordering.');
    addresses.sort((a, b) => a._id < b._id ? -1 : 1);
    return { POSTS_QUERY: dated.map((doc) => postProjection(doc, 'list')), POST_SLUGS_QUERY: addresses.map((doc) => ({ slug: doc.slug.current })),
        homePosts: dated.slice(0, 3).map((doc) => postProjection(doc, 'home')),
        details: Object.fromEntries(addresses.map((doc) => [doc.slug.current, postProjection(doc, 'detail')])) };
}
function assertBlogBaseline(docs, evidence, parameterized) {
    const projected = deriveBlog(docs, evidence);
    if (!equal(projected.POSTS_QUERY, evidence.POSTS_QUERY) || !equal(projected.POST_SLUGS_QUERY, evidence.POST_SLUGS_QUERY) || !equal(projected.homePosts, evidence.HOME_QUERY?.posts)) refuse('blog baseline does not match provider query evidence.');
    if (!equal(projected.details, parameterized.POST_BY_SLUG_QUERY)) refuse('blog details do not match provider query evidence.');
    return projected;
}

module.exports = { TYPES, LIMITS, PARAMETER_TYPES, refuse, hash, stable, clone, equal, bounded, id, slug, walk, validateDocuments,
    assertSource, postProjection, applySelectedDrafts, deriveBlog, assertBlogBaseline };
