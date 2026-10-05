'use strict';

const https = require('node:https');
const { lookup } = require('node:dns/promises');
const { isIP, BlockList } = require('node:net');
const { PROFILE } = require('./profile');
const { TYPES, LIMITS, PARAMETER_TYPES, refuse, stable, hash, clone, equal, bounded, id, validateDocuments,
    assertSource, applySelectedDrafts, assertBlogBaseline, deriveBlog } = require('./contract');
const { loadImageSdk, resolveAssets, rewriteAssetUrls } = require('./assets');

const FILTER = `_type in ${JSON.stringify(TYPES)} && !(_id in path("drafts.**")) && !(_id in path("versions.**"))`;
const COUNT_QUERY = `count(*[${FILTER}])`;
const MEMBERS_QUERY = `*[${FILTER} && _id > $after] | order(_id asc)[0...${LIMITS.pageSize}]{_id,_type,_rev}`;
const DOCUMENTS_QUERY = `*[${FILTER} && _id > $after] | order(_id asc)[0...${LIMITS.pageSize}]`;
const ASSETS_QUERY = '*[_type == "sanity.imageAsset" && _id in $ids && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_id asc){_id,_type,_rev,url,mimeType,metadata{dimensions}}';
function publicAddress(value) {
    if (isIP(value) === 4) {
        const [a, b, c] = value.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 2, 168].includes(b)) ||
            (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
    }
    if (isIP(value) !== 6 || !/^[23]/i.test(value)) return false;
    const blocked = new BlockList();
    for (const [address, mask] of [['2001:db8::', 32], ['2001::', 32], ['2001:10::', 28], ['2001:20::', 28], ['2002::', 16]]) blocked.addSubnet(address, mask, 'ipv6');
    return !blocked.check(value, 'ipv6');
}
async function readGet({ url, method, maxBytes, headers = {}, signal }) {
    if (!(url instanceof URL) || method !== 'GET' || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        ![`${PROFILE.projectId}.api.sanity.io`, 'cdn.sanity.io'].includes(url.hostname)) refuse('unsupported content transport.');
    if (signal?.aborted) refuse('content preparation was cancelled.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    try {
        const addresses = await Promise.race([lookup(url.hostname, { all: true }), new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('Frozen website: content GET timed out or was cancelled.')), { once: true });
        })]);
        const address = addresses.find((entry) => entry.family === 4 && publicAddress(entry.address));
        if (!address || addresses.some((entry) => !publicAddress(entry.address))) refuse('content host did not resolve to a supported public address.');
        return await new Promise((resolve, reject) => {
        const request = https.request(url, { method: 'GET', headers, family: 4, autoSelectFamily: false,
            lookup: (_host, _options, callback) => callback(null, address.address, 4), signal: controller.signal }, (response) => {
            if (response.statusCode !== 200 || response.headers.location) { response.destroy(); reject(new Error('Frozen website: public content GET was refused.')); return; }
            const declared = response.headers['content-length'];
            if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) { response.destroy(); reject(new Error('Frozen website: content GET exceeds the size bound.')); return; }
            let length = 0;
            const chunks = [];
            response.on('data', (chunk) => {
                length += chunk.length;
                if (length > maxBytes) response.destroy(new Error('Frozen website: content GET exceeds the size bound.'));
                else chunks.push(chunk);
            });
            response.once('error', reject);
            response.once('end', () => resolve({ bytes: Buffer.concat(chunks), mimeType: response.headers['content-type'] }));
        });
        request.once('error', reject);
        request.end();
        });
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}
async function defaultJson(request) {
    const response = await readGet({ ...request, headers: { Accept: 'application/json' } });
    if (!/^application\/json(?:;|$)/i.test(response.mimeType ?? '')) refuse('content GET returned an unsupported response.');
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.bytes)); }
    catch { refuse('content GET returned invalid JSON.'); }
}
function coordinates(value) {
    if (!value || value.projectId !== PROFILE.projectId || value.dataset !== PROFILE.dataset || value.apiVersion !== PROFILE.apiVersion || Object.keys(value).some((key) => !['projectId', 'dataset', 'apiVersion'].includes(key))) refuse('provider coordinates changed from the approved profile.');
    return clone(value);
}
function scope(value) {
    if (!value || Object.keys(value).sort().join() !== ['branchId', 'projectId', 'rootPath', 'userId'].sort().join() ||
        Object.values(value).some((entry) => typeof entry !== 'string' || !entry || entry.length > 4096 || /[\u0000-\u001f]/.test(entry)) || !value.rootPath.startsWith('/')) refuse('native owner and private-copy scope are required.');
    return clone(value);
}
async function captureSiteContent(input, dependencies = {}) {
    const source = assertSource(input.sourceFiles);
    const pinnedCoordinates = coordinates(input.coordinates);
    const pinnedScope = scope(input.scope);
    const sdk = loadImageSdk(dependencies.imageSdk); // Refuse before any GET.
    const getJson = dependencies.getJson ?? defaultJson;
    const getBytes = dependencies.getBytes ?? readGet;
    let requestCount = 0;
    let totalJsonBytes = 0;
    const signal = dependencies.signal;
    const nextRequest = () => {
        if (signal?.aborted) refuse('content preparation was cancelled.');
        if (++requestCount > LIMITS.requests) refuse('capture request limit exceeded.');
    };
    async function query(text, params = {}, maxBytes = LIMITS.jsonBytes) {
        nextRequest();
        const url = new URL(`https://${pinnedCoordinates.projectId}.api.sanity.io/v${pinnedCoordinates.apiVersion}/data/query/${pinnedCoordinates.dataset}`);
        url.searchParams.set('query', text); url.searchParams.set('perspective', 'published');
        for (const [key, value] of Object.entries(params)) url.searchParams.set(`$${key}`, JSON.stringify(value));
        const result = await getJson({ url, method: 'GET', maxBytes, signal });
        totalJsonBytes += Buffer.byteLength(bounded(result, maxBytes));
        if (totalJsonBytes > LIMITS.totalJsonBytes) refuse('total capture JSON exceeds the supported bound.');
        if (!result || !Object.hasOwn(result, 'result')) refuse('query result is missing.');
        return clone(result.result);
    }
    async function pages(text, expectedCount) {
        const output = [];
        let after = '';
        for (;;) {
            const page = await query(text, { after });
            if (!Array.isArray(page) || page.length > LIMITS.pageSize) refuse('invalid captured page.');
            for (const doc of page) {
                id(doc?._id);
                if (doc._id <= after || !TYPES.includes(doc._type) || typeof doc._rev !== 'string' || !doc._rev) refuse('invalid captured document order or revision.');
                after = doc._id;
                output.push(doc);
            }
            if (output.length > LIMITS.documents || output.length > expectedCount) refuse('provider membership changed during capture.');
            if (page.length < LIMITS.pageSize) break;
        }
        if (output.length !== expectedCount) refuse('provider membership is incomplete or changed.');
        return output;
    }
    async function membership() {
        const count = await query(COUNT_QUERY, {}, 16384);
        if (!Number.isInteger(count) || count < 0 || count > LIMITS.documents) refuse('published document count exceeds the supported bound.');
        return pages(MEMBERS_QUERY, count);
    }
    const before = await membership();
    const documents = await pages(DOCUMENTS_QUERY, before.length);
    if (!equal(documents.map(({ _id, _type, _rev }) => ({ _id, _type, _rev })), before)) refuse('provider revisions changed during capture.');
    const graph = validateDocuments(documents);
    const named = {};
    const parameterized = {};
    for (const [name, text] of Object.entries(PROFILE.queries)) {
        const type = PARAMETER_TYPES[name];
        if (!type) named[name] = await query(text);
        else {
            parameterized[name] = {};
            for (const doc of documents.filter((item) => item._type === type && item.slug?.current !== undefined && item.slug?.current !== null)) {
                const result = await query(text, { slug: doc.slug.current });
                if (!result || result._id !== doc._id) refuse('parameterized query does not match captured route membership.');
                parameterized[name][doc.slug.current] = result;
            }
        }
    }
    assertBlogBaseline(documents, named, parameterized);
    const selected = applySelectedDrafts(documents, input.selectedDrafts ?? []);
    bounded({ documents, named, parameterized });
    const candidateGraph = validateDocuments(selected.documents.map((doc) => ({ ...doc, _rev: doc._rev ?? 'local-validation' })));
    // New image references are not an authoring capability in this profile.
    if (candidateGraph.assets.some((ref) => !graph.assets.includes(ref))) refuse('draft introduces an unapproved image reference.');
    async function assetMetadata() {
        const rows = [];
        for (let offset = 0; offset < graph.assets.length; offset += 20) {
            const wanted = graph.assets.slice(offset, offset + 20);
            const result = await query(ASSETS_QUERY, { ids: wanted });
            if (!Array.isArray(result) || result.length !== wanted.length || result.some((doc) => !wanted.includes(doc?._id))) refuse('image metadata closure is incomplete.');
            rows.push(...result);
        }
        rows.sort((a, b) => a._id < b._id ? -1 : 1);
        if (new Set(rows.map((doc) => doc._id)).size !== graph.assets.length) refuse('duplicate image metadata.');
        return rows;
    }
    const assetDocuments = await assetMetadata();
    const assetResult = await resolveAssets({ documents: selected.documents, references: candidateGraph.assets,
        assetDocuments: assetDocuments.filter((doc) => candidateGraph.assets.includes(doc._id)), coordinates: pinnedCoordinates, imageSdk: sdk,
        getBytes: async (request) => { nextRequest(); return getBytes({ ...request, signal }); } });
    const afterAssets = await assetMetadata();
    const after = await membership();
    if (!equal(before, after) || !equal(assetDocuments, afterAssets)) refuse('provider content changed during preparation. Review again.');
    const candidateBlog = deriveBlog(selected.documents, named, documents);
    const candidateNamed = clone(named);
    candidateNamed.POSTS_QUERY = candidateBlog.POSTS_QUERY;
    candidateNamed.POST_SLUGS_QUERY = candidateBlog.POST_SLUGS_QUERY;
    candidateNamed.HOME_QUERY.posts = candidateBlog.homePosts;
    const candidateParameterized = { ...clone(parameterized), POST_BY_SLUG_QUERY: candidateBlog.details };
    const evidence = { coordinates: pinnedCoordinates, membership: before, documents, named, parameterized, assetDocuments };
    const captureId = hash(bounded(evidence));
    const runtimePayload = { version: 1, adapterId: PROFILE.id, coordinates: pinnedCoordinates,
        capturedAt: (dependencies.now ?? (() => new Date().toISOString()))(), queryContract: PROFILE.queries,
        named: rewriteAssetUrls(candidateNamed, assetResult.urlMap), parameterized: rewriteAssetUrls(candidateParameterized, assetResult.urlMap),
        imageMap: assetResult.imageMap, urlMap: assetResult.urlMap, mappingHash: assetResult.mappingHash };
    if (typeof runtimePayload.capturedAt !== 'string' || !Number.isFinite(Date.parse(runtimePayload.capturedAt))) refuse('invalid capture timestamp.');
    bounded(runtimePayload, 4 * 1024 * 1024);
    return { source, scope: pinnedScope, captureId, contentHash: hash(stable(runtimePayload)), draftHash: hash(stable(selected.pins)), draftPins: selected.pins,
        selectedDrafts: clone(input.selectedDrafts ?? []),
        originalEvidenceHash: hash(stable({ named, parameterized })), evidence, runtimePayload, assetFiles: assetResult.files };
}

module.exports = { COUNT_QUERY, MEMBERS_QUERY, DOCUMENTS_QUERY, ASSETS_QUERY, FILTER, readGet, captureSiteContent };
