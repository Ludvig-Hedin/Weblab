'use strict';

const { randomUUID } = require('node:crypto');
const { PROFILE } = require('./profile');
const { LIMITS, PARAMETER_TYPES, hash, stable, clone, equal, bounded, refuse, validateDocuments,
    assertBlogBaseline, applySelectedDrafts, deriveBlog } = require('./contract');
const { CHAINS, MIME_EXTENSIONS, imageKey, originalUrl, requiredImages, assertImageBytes, rewriteAssetUrls } = require('./assets');
const { captureSiteContent } = require('./capture');
const { materializeRuntime, artifactDescriptor } = require('./runtime');

const PROFILE_HASH = hash(stable(PROFILE));
const retained = new Map();
const DIGEST = /^[a-f0-9]{64}$/;
function predecessorPins(predecessor) {
    if (predecessor === undefined || predecessor === null) return new Map();
    if (!predecessor || Object.keys(predecessor).sort().join() !== 'manifestHash,targets' || !DIGEST.test(predecessor.manifestHash) ||
        !Array.isArray(predecessor.targets) || predecessor.targets.length > 1024) refuse('invalid previous installation pins.');
    const targets = new Map();
    const fixed = new Set(materializeRuntime({}, '0'.repeat(64), PROFILE.sourcePins).map((file) => file.path));
    for (const file of predecessor.targets) {
        if (!file || Object.keys(file).sort().join() !== 'path,sha256' || !DIGEST.test(file.sha256) || targets.has(file.path) ||
            (!fixed.has(file.path) && !/^public\/weblab-frozen-sanity\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif)$/.test(file.path))) refuse('unsafe previous installation target.');
        targets.set(file.path, file.sha256);
    }
    if ([...fixed].some((path) => !targets.has(path))) refuse('previous installation is incomplete.');
    return targets;
}
function expectedBefore(path, sourceHashes, previous) { return previous.get(path) ?? sourceHashes[path] ?? null; }
function copyArtifact(artifact) {
    const copy = clone(artifactDescriptor(artifact));
    copy.manifestHash = artifact.manifestHash;
    copy.files = artifact.files.map((file) => ({ ...file, bytes: Buffer.from(file.bytes) }));
    return copy;
}
function validateAssetMappings(artifact, candidateDocuments) {
    const payload = artifact.runtimePayload;
    const { assets } = validateDocuments(candidateDocuments.map((doc) => ({ ...doc, _rev: doc._rev ?? 'local-validation' })));
    const fileMap = new Map(artifact.files.filter((file) => file.kind === 'asset').map((file) => [`/${file.path.slice(7)}`, file]));
    const used = new Set();
    function verify(entry) {
        const file = fileMap.get(entry?.path);
        if (!file || entry.sha256 !== file.sha256 || entry.length !== file.bytes.length || entry.mimeType !== file.mimeType) refuse('asset mapping does not match retained bytes.');
        used.add(entry.path);
    }
    const expectedUrls = assets.map((ref) => originalUrl(ref, payload.coordinates)).sort();
    if (!equal(Object.keys(payload.urlMap).sort(), expectedUrls)) refuse('original asset closure is incomplete.');
    for (const [url, entry] of Object.entries(payload.urlMap)) {
        verify(entry);
        if (originalUrl(entry.assetId, payload.coordinates) !== url) refuse('original asset mapping changed.');
        const descriptor = artifact.evidence.assetDocuments.find((doc) => doc._id === entry.assetId);
        if (!descriptor || descriptor.url !== url || !equal(entry.dimensions, descriptor.metadata?.dimensions)) refuse('original image metadata changed.');
    }
    const required = requiredImages(candidateDocuments);
    if (!equal(Object.keys(payload.imageMap).sort(), [...required.keys()].sort())) refuse('derivative asset closure is incomplete.');
    for (const [key, entry] of Object.entries(payload.imageMap)) {
        verify(entry);
        const request = required.get(key);
        if (!equal(entry.source, request.source) || !equal(entry.chain, request.chain) || imageKey(entry.source, entry.chain) !== key ||
            !Object.values(CHAINS).some((chain) => equal(chain, entry.chain))) refuse('unsupported derivative image mapping.');
        let address;
        try { address = new URL(entry.providerUrl); } catch { refuse('invalid derivative provenance.'); }
        const original = new URL(originalUrl(entry.source.asset._ref, payload.coordinates));
        if (address.origin !== original.origin || address.pathname !== original.pathname || address.username || address.password || address.hash) refuse('derivative provenance escaped the source.');
    }
    if (used.size !== fileMap.size || payload.mappingHash !== hash(stable({ urlMap: payload.urlMap, imageMap: payload.imageMap }))) refuse('unexpected or changed image artifact.');
}
function validateMaterializedSiteArtifact(artifact) {
    if (!artifact || artifact.version !== 1 || artifact.adapterId !== PROFILE.id || artifact.profileHash !== PROFILE_HASH ||
        !DIGEST.test(artifact.captureId) || !DIGEST.test(artifact.contentHash) || !DIGEST.test(artifact.draftHash) || !DIGEST.test(artifact.sourceHash) ||
        !DIGEST.test(artifact.originalEvidenceHash) || !DIGEST.test(artifact.manifestHash) || !Array.isArray(artifact.files) || artifact.files.length > 1024) refuse('invalid retained website artifact.');
    if (!artifact.scope || Object.keys(artifact.scope).sort().join() !== 'branchId,projectId,rootPath,userId' ||
        Object.values(artifact.scope).some((value) => typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f]/.test(value)) || !artifact.scope.rootPath.startsWith('/')) refuse('retained owner scope changed.');
    for (const [path, digest] of Object.entries(PROFILE.sourcePins)) if (artifact.sourceHashes?.[path] !== digest) refuse('retained approved source pins changed.');
    const sourceEntries = Object.entries(artifact.sourceHashes ?? {});
    if (sourceEntries.some(([path, digest]) => !path || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..') || !DIGEST.test(digest)) ||
        hash(stable(sourceEntries.sort((a, b) => a[0].localeCompare(b[0])))) !== artifact.sourceHash) refuse('retained source inventory changed.');
    const evidence = artifact.evidence;
    if (!evidence || evidence.coordinates?.projectId !== PROFILE.projectId || evidence.coordinates?.dataset !== PROFILE.dataset || evidence.coordinates?.apiVersion !== PROFILE.apiVersion ||
        hash(bounded(evidence)) !== artifact.captureId || hash(stable({ named: evidence.named, parameterized: evidence.parameterized })) !== artifact.originalEvidenceHash) refuse('provider evidence changed.');
    validateDocuments(evidence.documents);
    if (!equal(evidence.documents.map(({ _id, _type, _rev }) => ({ _id, _type, _rev })), evidence.membership)) refuse('provider membership evidence changed.');
    if (!equal(Object.keys(evidence.named).sort(), Object.keys(PROFILE.queries).filter((name) => !PARAMETER_TYPES[name]).sort()) ||
        !equal(Object.keys(evidence.parameterized).sort(), Object.keys(PARAMETER_TYPES).sort())) refuse('named query coverage is incomplete.');
    for (const [name, type] of Object.entries(PARAMETER_TYPES)) {
        const documents = evidence.documents.filter((doc) => doc._type === type && doc.slug?.current !== undefined && doc.slug?.current !== null);
        if (!equal(Object.keys(evidence.parameterized[name]).sort(), documents.map((doc) => doc.slug.current).sort()) ||
            documents.some((doc) => evidence.parameterized[name][doc.slug.current]?._id !== doc._id)) refuse('parameterized query coverage changed.');
    }
    assertBlogBaseline(evidence.documents, evidence.named, evidence.parameterized);
    const selected = applySelectedDrafts(evidence.documents, artifact.selectedDrafts);
    if (!equal(selected.pins, artifact.draftPins) || hash(stable(selected.pins)) !== artifact.draftHash) refuse('selected draft pins changed.');
    const blog = deriveBlog(selected.documents, evidence.named, evidence.documents);
    const named = clone(evidence.named);
    named.POSTS_QUERY = blog.POSTS_QUERY; named.POST_SLUGS_QUERY = blog.POST_SLUGS_QUERY; named.HOME_QUERY.posts = blog.homePosts;
    const parameterized = { ...clone(evidence.parameterized), POST_BY_SLUG_QUERY: blog.details };
    const payload = artifact.runtimePayload;
    if (!payload || payload.version !== 1 || payload.adapterId !== PROFILE.id || !equal(payload.coordinates, evidence.coordinates) ||
        !equal(payload.queryContract, PROFILE.queries) || !Number.isFinite(Date.parse(payload.capturedAt)) || hash(stable(payload)) !== artifact.contentHash ||
        !equal(payload.named, rewriteAssetUrls(named, payload.urlMap)) || !equal(payload.parameterized, rewriteAssetUrls(parameterized, payload.urlMap))) refuse('runtime projections changed from captured content.');
    const previous = predecessorPins(artifact.predecessor);
    const expectedText = materializeRuntime(payload, artifact.contentHash, artifact.sourceHashes);
    const expected = new Map(expectedText.map((file) => [file.path, file]));
    const seen = new Set();
    let total = 0;
    for (const file of artifact.files) {
        if (!file || seen.has(file.path) || !Buffer.isBuffer(file.bytes) || file.sha256 !== hash(file.bytes) || file.bytes.length > 32 * 1024 * 1024 ||
            file.beforeSha256 !== expectedBefore(file.path, artifact.sourceHashes, previous)) refuse('retained installation bytes or preconditions changed.');
        seen.add(file.path); total += file.bytes.length;
        if (file.kind === 'text') {
            const target = expected.get(file.path);
            if (!target || target.phase !== file.phase || target.sha256 !== file.sha256) refuse('installation adapter is not the approved exact replacement.');
        } else if (file.kind === 'asset') {
            assertImageBytes(file.bytes, file.mimeType);
            if (file.phase !== 'content' || file.path !== `public/weblab-frozen-sanity/${file.sha256}.${MIME_EXTENSIONS[file.mimeType]}`) refuse('unsafe installation asset path.');
        } else refuse('unexpected installation file kind.');
    }
    if ([...expected.keys()].some((path) => !seen.has(path)) || total > LIMITS.artifactBytes) refuse('installation is incomplete or too large.');
    validateAssetMappings(artifact, selected.documents);
    if (hash(stable(artifactDescriptor(artifact))) !== artifact.manifestHash) refuse('retained installation manifest changed.');
    return true;
}
async function captureSite(input, dependencies = {}) {
    const previous = predecessorPins(input.predecessor);
    const capture = await captureSiteContent(input, dependencies);
    const sourceHashes = Object.fromEntries([...capture.source.files].map(([path, bytes]) => [path, hash(bytes)]));
    const files = [...materializeRuntime(capture.runtimePayload, capture.contentHash, sourceHashes), ...capture.assetFiles]
        .map((file) => ({ ...file, beforeSha256: expectedBefore(file.path, sourceHashes, previous) }));
    const artifact = { version: 1, adapterId: PROFILE.id, profileHash: PROFILE_HASH, scope: capture.scope,
        captureId: capture.captureId, contentHash: capture.contentHash, draftHash: capture.draftHash, sourceHashes, sourceHash: capture.source.sourceHash,
        originalEvidenceHash: capture.originalEvidenceHash, runtimePayload: capture.runtimePayload, draftPins: capture.draftPins,
        selectedDrafts: capture.selectedDrafts, evidence: capture.evidence, files,
        ...(input.predecessor ? { predecessor: clone(input.predecessor) } : {}) };
    artifact.manifestHash = hash(stable(artifactDescriptor(artifact)));
    validateMaterializedSiteArtifact(artifact);
    if (retained.size >= 20) refuse('too many retained captures. Close an unused review before preparing another.');
    const handle = randomUUID();
    retained.set(handle, copyArtifact(artifact));
    return handle;
}
function getRetainedSiteArtifact(handle) {
    const artifact = retained.get(handle);
    if (!artifact) refuse('website capture is unavailable. Prepare this version again.');
    validateMaterializedSiteArtifact(artifact);
    return copyArtifact(artifact);
}
function discardRetainedSiteArtifact(handle) { return retained.delete(handle); }

module.exports = { PROFILE, PROFILE_HASH, captureSite, getRetainedSiteArtifact, validateMaterializedSiteArtifact, discardRetainedSiteArtifact, artifactDescriptor };
