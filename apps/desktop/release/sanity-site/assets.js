'use strict';

const { PROFILE } = require('./profile');
const { LIMITS, hash, stable, clone, refuse, walk } = require('./contract');

const CHAINS = Object.freeze({
    hero: [['width', 1600], ['height', 900], ['fit', 'crop']],
    blog: [['width', 1280], ['height', 720], ['fit', 'crop']],
    product: [['width', 640], ['height', 480], ['fit', 'crop']],
    portable: [['width', 1280], ['auto', 'format']],
    seo: [['width', 1200], ['height', 630], ['fit', 'crop']],
});
const MIME_EXTENSIONS = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' });
function loadImageSdk(adapter) {
    if (adapter) {
        if (adapter.version !== PROFILE.sdkVersion || typeof adapter.buildUrl !== 'function') refuse('the approved image SDK is not available.');
        return adapter;
    }
    try {
        const sdk = require('@sanity/image-url');
        const manifest = require('@sanity/image-url/package.json');
        if (manifest.version !== PROFILE.sdkVersion || typeof sdk.createImageUrlBuilder !== 'function') throw new Error('SDK version');
        return { version: manifest.version, buildUrl(source, chain, coordinates) {
            let builder = sdk.createImageUrlBuilder({ projectId: coordinates.projectId, dataset: coordinates.dataset }).image(source);
            for (const [method, value] of chain) builder = builder[method](value);
            return builder.url();
        } };
    } catch { refuse(`image preparation needs the approved @sanity/image-url ${PROFILE.sdkVersion} SDK. No content was downloaded or installed.`); }
}
function imageKey(source, chain) { return hash(stable({ source, chain })); }
function originalUrl(ref, coordinates) {
    const match = /^image-([a-f0-9]+)-(\d+x\d+)-([a-z0-9]+)$/.exec(ref);
    if (!match) refuse('unsupported image identity.');
    return `https://cdn.sanity.io/images/${coordinates.projectId}/${coordinates.dataset}/${match[1]}-${match[2]}.${match[3]}`;
}
function assertImageUrl(value, coordinates, ref) {
    let url;
    try { url = new URL(value); } catch { refuse('image SDK returned an invalid URL.'); }
    const original = new URL(originalUrl(ref, coordinates));
    if (url.origin !== original.origin || url.pathname !== original.pathname || url.username || url.password || url.hash || url.port) refuse('image escaped the approved source.');
    const allowed = new Set(['w', 'h', 'fit', 'auto', 'rect', 'crop', 'fp-x', 'fp-y', 'fm']);
    for (const [key, parameter] of url.searchParams) if (!allowed.has(key) || !parameter || parameter.length > 128) refuse('unsupported image transformation.');
    return url.href;
}
function validateImage(source) {
    if (!source || source._type !== 'image' || !source.asset || typeof source.asset._ref !== 'string') refuse('invalid image source.');
    for (const [name, fields] of [['crop', ['top', 'bottom', 'left', 'right']], ['hotspot', ['x', 'y', 'width', 'height']]]) {
        if (source[name] === undefined) continue;
        if (!source[name] || fields.some((key) => typeof source[name][key] !== 'number' || !Number.isFinite(source[name][key]) || source[name][key] < 0 || source[name][key] > 1)) refuse(`invalid image ${name}.`);
    }
    if (source.crop && (source.crop.top + source.crop.bottom >= 1 || source.crop.left + source.crop.right >= 1)) refuse('empty image crop.');
}
function requiredImages(documents) {
    const required = new Map();
    const add = (source, chain) => {
        if (source === undefined || source === null) return;
        validateImage(source);
        required.set(imageKey(source, chain), { source: clone(source), chain: clone(chain) });
    };
    for (const doc of documents) {
        if (['service', 'ekoStambyte'].includes(doc._type)) add(doc.heroImage, CHAINS.hero);
        if (doc._type === 'blogPost') add(doc.heroImage, CHAINS.blog);
        if (doc._type === 'product') add(doc.image, CHAINS.product);
        add(doc.seo?.ogImage, CHAINS.seo);
        add(doc.defaultSeo?.ogImage, CHAINS.seo);
        for (const value of [doc.content, doc.body]) walk(value, (node) => { if (node._type === 'image') add(node, CHAINS.portable); });
        // Unrendered selected images still retain original bytes through the raw
        // reference closure; only actual supported runtime calls need derivatives.
    }
    return required;
}
function assertImageBytes(bytes, mimeType) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > LIMITS.imageBytes || !MIME_EXTENSIONS[mimeType]) refuse('invalid or unsupported image bytes.');
    const matches = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : mimeType === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
                : mimeType === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))
                    : bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 32));
    if (!matches) refuse('image MIME does not match its bytes.');
}
async function resolveAssets({ documents, references, assetDocuments, coordinates, getBytes, imageSdk }) {
    const sdk = loadImageSdk(imageSdk);
    const descriptors = new Map(assetDocuments.map((doc) => [doc._id, doc]));
    if (descriptors.size !== references.length || references.some((ref) => !descriptors.has(ref))) refuse('asset reference closure is incomplete.');
    const files = new Map();
    const urlMap = {};
    const imageMap = {};
    const downloads = new Map();
    let total = 0;
    async function download(url) {
        if (downloads.has(url)) return downloads.get(url);
        const response = await getBytes({ url: new URL(url), method: 'GET', maxBytes: LIMITS.imageBytes,
            headers: { Accept: 'image/webp,image/png,image/jpeg,image/avif,image/gif;q=0.8' } });
        const bytes = Buffer.from(response.bytes ?? []);
        const mimeType = response.mimeType?.split(';')[0].trim().toLowerCase();
        assertImageBytes(bytes, mimeType);
        total += bytes.length;
        if (total > LIMITS.artifactBytes) refuse('asset bytes exceed the release limit.');
        const digest = hash(bytes);
        const path = `public/weblab-frozen-sanity/${digest}.${MIME_EXTENSIONS[mimeType]}`;
        const entry = { path, bytes, sha256: digest, kind: 'asset', phase: 'content', beforeSha256: null, mimeType };
        files.set(path, entry);
        const result = { path: `/${path.slice(7)}`, sha256: digest, mimeType, length: bytes.length };
        downloads.set(url, result);
        return result;
    }
    for (const ref of references) {
        const descriptor = descriptors.get(ref);
        const url = originalUrl(ref, coordinates);
        if (descriptor._type !== 'sanity.imageAsset' || descriptor.url !== url || typeof descriptor._rev !== 'string' || !descriptor._rev ||
            !Number.isFinite(descriptor.metadata?.dimensions?.width) || !Number.isFinite(descriptor.metadata?.dimensions?.height) || descriptor.metadata.dimensions.width < 1 || descriptor.metadata.dimensions.height < 1) refuse('invalid source image metadata.');
        urlMap[url] = { ...(await download(url)), assetId: ref, dimensions: clone(descriptor.metadata.dimensions) };
    }
    for (const [key, required] of requiredImages(documents)) {
        if (!descriptors.has(required.source.asset._ref)) refuse('derivative image reference is missing.');
        const url = assertImageUrl(sdk.buildUrl(required.source, required.chain, coordinates), coordinates, required.source.asset._ref);
        imageMap[key] = { ...(await download(url)), source: required.source, chain: required.chain, providerUrl: url };
    }
    return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), urlMap, imageMap,
        mappingHash: hash(stable({ urlMap, imageMap })) };
}
function rewriteAssetUrls(value, urlMap) {
    const output = clone(value);
    function rewriteRows(rows, field) {
        if (!Array.isArray(rows)) refuse('invalid raw image projection rows.');
        for (const row of rows) {
            if (!row || typeof row !== 'object') refuse('invalid raw image projection row.');
            const url = row[field];
            if (url === undefined || url === null) continue;
            if (typeof url !== 'string' || !Object.hasOwn(urlMap, url)) refuse('raw image projection contains an uncaptured image URL.');
            row[field] = urlMap[url].path;
        }
    }
    if (Object.hasOwn(output, 'TEAM_QUERY')) rewriteRows(output.TEAM_QUERY, 'photo');
    if (Object.hasOwn(output, 'REVIEWS_QUERY')) rewriteRows(output.REVIEWS_QUERY, 'logo');
    if (Object.hasOwn(output, 'HOME_QUERY')) rewriteRows(output.HOME_QUERY.reviews, 'logo');
    return output;
}

module.exports = { CHAINS, MIME_EXTENSIONS, loadImageSdk, imageKey, originalUrl, validateImage, requiredImages, assertImageBytes, resolveAssets, rewriteAssetUrls };
