const { describe, expect, test } = require('bun:test');
const { PROFILE, captureSite, getRetainedSiteArtifact, validateMaterializedSiteArtifact, artifactDescriptor, discardRetainedSiteArtifact } = require('./index');
const { COUNT_QUERY, MEMBERS_QUERY, DOCUMENTS_QUERY, ASSETS_QUERY } = require('./capture');
const { stable, hash } = require('./contract');
const { originalUrl, rewriteAssetUrls } = require('./assets');

function fixtureInput(drafts = []) {
    return { sourceFiles: Object.entries(PROFILE.approvedSources).map(([path, text]) => ({ path, bytes: Buffer.from(text) })),
        coordinates: { projectId: PROFILE.projectId, dataset: PROFILE.dataset, apiVersion: PROFILE.apiVersion },
        scope: { userId: 'owner', projectId: 'project', branchId: 'branch', rootPath: '/private/test-copy/project' }, selectedDrafts: drafts };
}
function fixtureCaptureTransport({ docs = [], named: overrides = {}, parameterized = {}, assetDocuments = [], drift = false } = {}) {
    const named = { SITE_SETTINGS_QUERY: null, HOME_QUERY: { settings: null, services: [], reviews: [], posts: [], eko: null },
        SERVICES_QUERY: [], SERVICE_SLUGS_QUERY: [], EKOSTAMBYTE_QUERY: null, FAQS_QUERY: [], AREAS_QUERY: [], AREA_SLUGS_QUERY: [],
        PRODUCTS_QUERY: [], POSTS_QUERY: [], POST_SLUGS_QUERY: [], TEAM_QUERY: [], REVIEWS_QUERY: [], ...overrides };
    const calls = [];
    let memberships = 0;
    return { calls, now: () => '2026-10-03T00:00:00.000Z', imageSdk: { version: '2.1.1', buildUrl(source, chain, coordinates) {
        const url = new URL(originalUrl(source.asset._ref, coordinates));
        for (const [method, value] of chain) url.searchParams.set({ width: 'w', height: 'h', fit: 'fit', auto: 'auto' }[method], String(value));
        return url.href;
    } }, async getJson(request) {
        expect(request.method).toBe('GET');
        expect(request.url.searchParams.get('perspective')).toBe('published');
        calls.push(request.url.href);
        const text = request.url.searchParams.get('query');
        let result;
        if (text === COUNT_QUERY) result = docs.length;
        else if (text === MEMBERS_QUERY) {
            memberships++;
            const after = JSON.parse(request.url.searchParams.get('$after'));
            result = docs.filter(doc => doc._id > after).slice(0, 50).map(({ _id, _type, _rev }) => ({ _id, _type, _rev: drift && memberships > 1 ? 'changed' : _rev }));
        } else if (text === DOCUMENTS_QUERY) {
            const after = JSON.parse(request.url.searchParams.get('$after'));
            result = docs.filter(doc => doc._id > after).slice(0, 50);
        } else if (text === ASSETS_QUERY) {
            const ids = JSON.parse(request.url.searchParams.get('$ids'));
            result = assetDocuments.filter(doc => ids.includes(doc._id));
        } else {
            const name = Object.keys(PROFILE.queries).find(name => PROFILE.queries[name] === text);
            if (!name) throw new Error('Unexpected fixture query');
            result = parameterized[name] ? parameterized[name][JSON.parse(request.url.searchParams.get('$slug'))] : named[name];
        }
        return { result: JSON.parse(JSON.stringify(result)) };
    }, async getBytes(request) {
        expect(request.method).toBe('GET'); calls.push(request.url.href);
        return { bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), mimeType: 'image/png' };
    } };
}
function blogFixture() {
    const doc = { _id: 'post-a', _type: 'blogPost', _rev: 'rev1', title: 'Captured', slug: { _type: 'slug', current: 'captured' },
        excerpt: 'Original', publishedAt: '2026-10-01T10:00:00Z', author: 'Team', categories: ['tips'], heroImage: null, content: [], seo: null,
        customMetadata: { preserve: 'opaque' } };
    const list = { _id: 'post-a', title: 'Captured', slug: 'captured', excerpt: 'Original', publishedAt: '2026-10-01T10:00:00Z', author: 'Team', categories: ['tips'], heroImage: null };
    const home = { _id: 'post-a', title: 'Captured', slug: 'captured', excerpt: 'Original', publishedAt: '2026-10-01T10:00:00Z', heroImage: null };
    return { doc, list, home, transport() { return fixtureCaptureTransport({ docs: [doc], named: {
        POSTS_QUERY: [list], POST_SLUGS_QUERY: [{ slug: doc.slug.current }], HOME_QUERY: { settings: null, services: [], reviews: [], posts: [home], eko: null },
    }, parameterized: { POST_BY_SLUG_QUERY: { [doc.slug.current]: { ...list, content: [], seo: null } } } }); } };
}
function draftFor(doc, edit = {}) { return { documentId: doc._id, providerRevision: doc._rev, revision: 1, archived: false,
    originalJson: JSON.stringify(doc), documentJson: JSON.stringify({ ...doc, ...edit }) }; }
function rehash(artifact) { artifact.manifestHash = hash(stable(artifactDescriptor(artifact))); return artifact; }

describe('fixed whole-site content freeze', () => {
    test('covers the exact16 queries and emits writer-first adapters with no live fallback', async () => {
        const transport = fixtureCaptureTransport();
        const handle = await captureSite(fixtureInput(), transport);
        const artifact = getRetainedSiteArtifact(handle);
        expect(validateMaterializedSiteArtifact(artifact)).toBe(true);
        expect(Object.keys(artifact.runtimePayload.queryContract)).toHaveLength(16);
        expect(artifact.files[0].phase).toBe('disable');
        expect(artifact.files.find(file => file.path.endsWith('/fetch.ts')).bytes.toString()).not.toContain('catch');
        for (const path of ['tjanster', 'omraden', 'blogg']) {
            const text = artifact.files.find(file => file.path === `src/app/(site)/${path}/[slug]/page.tsx`).bytes.toString();
            expect(text).not.toContain('freshClient');
            const staticParams = text.split('export async function generateStaticParams() {')[1]?.split('export async function generateMetadata')[0];
            expect(staticParams).toBeDefined(); expect(staticParams).not.toContain('catch'); expect(text).toContain('dynamicParams = false');
        }
        expect(artifact.files.find(file => file.path.endsWith('/sitemap.ts')).bytes.toString()).not.toContain('catch');
        expect(artifact.files.find(file => file.path.endsWith('/contact-form.tsx')).bytes.toString()).toContain('inte tillgängligt');
        expect(artifact.files.find(file => file.path.endsWith('/Studio.tsx')).bytes.toString()).not.toContain('next-sanity');
        discardRetainedSiteArtifact(handle);
    });
    test('refuses changed provider/source pins before a content request', async () => {
        const transport = fixtureCaptureTransport();
        const input = fixtureInput(); input.coordinates.dataset = 'other';
        await expect(captureSite(input, transport)).rejects.toThrow('coordinates');
        expect(transport.calls).toHaveLength(0);
        const source = fixtureInput(); source.sourceFiles.find(file => file.path.endsWith('/queries.ts')).bytes = Buffer.from('changed');
        await expect(captureSite(source, transport)).rejects.toThrow('approved source changed');
        expect(transport.calls).toHaveLength(0);
    });
    test('missing or wrong SDK refuses before GET even on a site without images', async () => {
        const transport = fixtureCaptureTransport(); transport.imageSdk.version = 'other';
        await expect(captureSite(fixtureInput(), transport)).rejects.toThrow('approved image SDK'); expect(transport.calls).toHaveLength(0);
    });
    test('checks baseline provider projections before accepting an edited post', async () => {
        const fixture = blogFixture();
        const transport = fixture.transport();
        const getJson = transport.getJson;
        transport.getJson = async request => {
            const result = await getJson(request);
            if (request.url.searchParams.get('query') === PROFILE.queries.POSTS_QUERY) result.result[0].title = 'Provider projection mismatch';
            return result;
        };
        await expect(captureSite(fixtureInput([draftFor(fixture.doc, { title: 'Edited' })]), transport)).rejects.toThrow('baseline does not match');
    });
    test('retains untouched non-blog outputs and applies only selected CAS drafts', async () => {
        const fixture = blogFixture();
        const handle = await captureSite(fixtureInput([draftFor(fixture.doc, { title: 'Edited' })]), fixture.transport());
        const artifact = getRetainedSiteArtifact(handle);
        expect(artifact.runtimePayload.named.POSTS_QUERY[0].title).toBe('Edited');
        expect(artifact.runtimePayload.named.HOME_QUERY.posts[0].title).toBe('Edited');
        expect(artifact.runtimePayload.named.HOME_QUERY.settings).toBeNull();
        expect(artifact.evidence.named.POSTS_QUERY[0].title).toBe('Captured');
        expect(artifact.evidence.documents[0].customMetadata).toEqual({ preserve: 'opaque' });
        discardRetainedSiteArtifact(handle);
    });
    test('refuses same-revision but different original bytes and unauthorized metadata changes', async () => {
        const fixture = blogFixture(); const draft = draftFor(fixture.doc, { title: 'Edited' });
        draft.originalJson = JSON.stringify({ ...fixture.doc, title: 'Other original' });
        await expect(captureSite(fixtureInput([draft]), fixture.transport())).rejects.toThrow('baseline changed');
        await expect(captureSite(fixtureInput([draftFor(fixture.doc, { customMetadata: null })]), fixture.transport())).rejects.toThrow('unapproved field');
    });
    test('refuses published address changes while retaining an unchanged encoded legacy address', async () => {
        const fixture = blogFixture();
        const legacySlug = 'tips-%f0%9f%94%a7';
        fixture.doc.slug.current = legacySlug; fixture.list.slug = legacySlug; fixture.home.slug = legacySlug;
        const renamed = draftFor(fixture.doc, { slug: { _type: 'slug', current: 'renamed-post' } });
        await expect(captureSite(fixtureInput([renamed]), fixture.transport())).rejects.toThrow('published post addresses cannot change');
        const handle = await captureSite(fixtureInput([draftFor(fixture.doc, { title: 'Edited title' })]), fixture.transport());
        const artifact = getRetainedSiteArtifact(handle);
        expect(artifact.runtimePayload.named.POST_SLUGS_QUERY).toEqual([{ slug: legacySlug }]);
        expect(artifact.runtimePayload.named.POSTS_QUERY[0].slug).toBe(legacySlug);
        expect(artifact.runtimePayload.named.HOME_QUERY.posts[0].slug).toBe(legacySlug);
        expect(Object.keys(artifact.runtimePayload.parameterized.POST_BY_SLUG_QUERY)).toEqual([legacySlug]);
        expect(artifact.runtimePayload.parameterized.POST_BY_SLUG_QUERY[legacySlug].title).toBe('Edited title');
        discardRetainedSiteArtifact(handle);
    });
    test('an explicit archive removes all four candidate blog outputs only', async () => {
        const fixture = blogFixture(); const draft = draftFor(fixture.doc); draft.archived = true;
        const handle = await captureSite(fixtureInput([draft]), fixture.transport()); const artifact = getRetainedSiteArtifact(handle);
        expect(artifact.runtimePayload.named.POSTS_QUERY).toEqual([]); expect(artifact.runtimePayload.named.POST_SLUGS_QUERY).toEqual([]);
        expect(artifact.runtimePayload.named.HOME_QUERY.posts).toEqual([]); expect(artifact.runtimePayload.parameterized.POST_BY_SLUG_QUERY).toEqual({});
        discardRetainedSiteArtifact(handle);
    });
    test('provider revision drift after complete capture refuses the whole candidate', async () => {
        const fixture = blogFixture(); const transport = fixture.transport();
        const original = transport.getJson; let membership = 0;
        transport.getJson = async request => { const response = await original(request); if (request.url.searchParams.get('query') === MEMBERS_QUERY && ++membership > 1) response.result[0]._rev = 'newrev'; return response; };
        await expect(captureSite(fixtureInput(), transport)).rejects.toThrow('changed during preparation');
    });
    test('unresolved raw references refuse instead of silently projecting null', async () => {
        const transport = fixtureCaptureTransport({ docs: [{ _id: 'service-a', _type: 'service', _rev: 'rev', relatedServices: [{ _type: 'reference', _ref: 'missing' }] }] });
        await expect(captureSite(fixtureInput(), transport)).rejects.toThrow('unresolved');
    });
    test('bundles original/derivative bytes and binds complete crop/hotspot SDK input', async () => {
        const fixture = blogFixture();
        const image = { _type: 'image', asset: { _type: 'reference', _ref: 'image-abcdef-100x80-png' },
            alt: 'Captured image', crop: { top: 0.1, bottom: 0.1, left: 0, right: 0 }, hotspot: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } };
        fixture.doc.heroImage = image; fixture.list.heroImage = image; fixture.home.heroImage = image;
        const transport = fixture.transport();
        const original = transport.getJson;
        transport.getJson = async request => request.url.searchParams.get('query') === ASSETS_QUERY ? { result: [{
            _id: image.asset._ref, _type: 'sanity.imageAsset', _rev: 'assetrev', url: originalUrl(image.asset._ref, fixtureInput().coordinates),
            mimeType: 'image/png', metadata: { dimensions: { width: 100, height: 80, aspectRatio: 1.25 } },
        }] } : original(request);
        const handle = await captureSite(fixtureInput(), transport); const artifact = getRetainedSiteArtifact(handle);
        expect(artifact.files.filter(file => file.kind === 'asset')).toHaveLength(1);
        const derivative = Object.values(artifact.runtimePayload.imageMap)[0];
        expect(derivative.source.crop).toEqual(image.crop); expect(derivative.source.hotspot).toEqual(image.hotspot);
        expect(derivative.chain).toEqual([['width', 1280], ['height', 720], ['fit', 'crop']]);
        expect(validateMaterializedSiteArtifact(artifact)).toBe(true);
        const broken = getRetainedSiteArtifact(handle); broken.files = broken.files.filter(file => file.kind !== 'asset');
        expect(() => validateMaterializedSiteArtifact(rehash(broken))).toThrow('mapping');
        discardRetainedSiteArtifact(handle);
    });
    test('installed SDK preserves crop and hotspot in frozen derivatives without provider access', async () => {
        const fixture = blogFixture();
        const image = { _type: 'image', asset: { _type: 'reference', _ref: 'image-abcdef-100x80-png' },
            alt: 'Captured image', crop: { top: 0.1, bottom: 0.1, left: 0, right: 0 },
            hotspot: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } };
        fixture.doc.heroImage = image; fixture.list.heroImage = image; fixture.home.heroImage = image;
        const transport = fixture.transport();
        delete transport.imageSdk;
        const getJson = transport.getJson;
        transport.getJson = async request => request.url.searchParams.get('query') === ASSETS_QUERY ? { result: [{
            _id: image.asset._ref, _type: 'sanity.imageAsset', _rev: 'assetrev',
            url: originalUrl(image.asset._ref, fixtureInput().coordinates), mimeType: 'image/png',
            metadata: { dimensions: { width: 100, height: 80, aspectRatio: 1.25 } },
        }] } : getJson(request);
        const handle = await captureSite(fixtureInput(), transport);
        try {
            const artifact = getRetainedSiteArtifact(handle);
            const derivative = Object.values(artifact.runtimePayload.imageMap)[0];
            expect(derivative.source).toEqual(image);
            expect(derivative.chain).toEqual([['width', 1280], ['height', 720], ['fit', 'crop']]);
            const imageRequests = transport.calls.filter(value => value.includes('/images/')).map(value => new URL(value));
            expect(imageRequests.some(url => url.searchParams.has('rect'))).toBe(true);
            expect(imageRequests.some(url => url.searchParams.get('w') === '1280' && url.searchParams.get('h') === '720')).toBe(true);
            expect(validateMaterializedSiteArtifact(artifact)).toBe(true);
        } finally {
            discardRetainedSiteArtifact(handle);
        }
    });
    test('rewrites only the three raw image locations, preserving matching prose and external links', () => {
        const url = 'https://cdn.sanity.io/images/l45nowfu/production/abcdef-100x80.png';
        const path = '/weblab-frozen-sanity/' + 'a'.repeat(64) + '.png';
        const value = {
            TEAM_QUERY: [{ photo: url, name: url, bio: url }],
            REVIEWS_QUERY: [{ logo: url, customerName: url, text: url, source: url }],
            HOME_QUERY: { reviews: [{ logo: url, text: url }], posts: [{ title: url, excerpt: url }] },
            PRODUCTS_QUERY: [{ name: url, description: url, externalLink: url }],
            POST_BY_SLUG_QUERY: { captured: { title: url, content: [{ _type: 'block', children: [{ text: url }], markDefs: [{ _type: 'link', href: url }] }] } },
        };
        const rewritten = rewriteAssetUrls(value, { [url]: { path } });
        expect(rewritten.TEAM_QUERY[0].photo).toBe(path); expect(rewritten.REVIEWS_QUERY[0].logo).toBe(path); expect(rewritten.HOME_QUERY.reviews[0].logo).toBe(path);
        expect(rewritten.TEAM_QUERY[0].bio).toBe(url); expect(rewritten.REVIEWS_QUERY[0].text).toBe(url);
        expect(rewritten.HOME_QUERY.reviews[0].text).toBe(url); expect(rewritten.HOME_QUERY.posts[0].title).toBe(url);
        expect(rewritten.PRODUCTS_QUERY).toEqual(value.PRODUCTS_QUERY); expect(rewritten.POST_BY_SLUG_QUERY).toEqual(value.POST_BY_SLUG_QUERY);
        expect(value.TEAM_QUERY[0].photo).toBe(url);
        expect(() => rewriteAssetUrls({ TEAM_QUERY: [{ photo: url }] }, {})).toThrow('uncaptured image URL');
    });
    test('new post identity/address collisions and new equal-date ordering refuse', async () => {
        const fixture = blogFixture();
        const doc = { _id: 'weblab-11111111-1111-4111-8111-111111111111', _type: 'blogPost', title: 'New',
            slug: { _type: 'slug', current: 'captured' }, publishedAt: '2026-10-02T00:00:00Z', content: [] };
        const draft = { documentId: doc._id, providerRevision: null, revision: 1, archived: false, originalJson: JSON.stringify(doc), documentJson: JSON.stringify(doc) };
        await expect(captureSite(fixtureInput([draft]), fixture.transport())).rejects.toThrow('address already exists');
        doc.slug.current = 'new'; doc.publishedAt = fixture.doc.publishedAt; draft.originalJson = JSON.stringify(doc); draft.documentJson = JSON.stringify(doc);
        await expect(captureSite(fixtureInput([draft]), fixture.transport())).rejects.toThrow('ordering tie');
    });
    test('durable artifact validation rejects changed targets, scope and missing manifest files', async () => {
        const handle = await captureSite(fixtureInput(), fixtureCaptureTransport());
        const changed = getRetainedSiteArtifact(handle); changed.files[0].bytes = Buffer.from('unsafe'); changed.files[0].sha256 = hash(changed.files[0].bytes);
        expect(() => validateMaterializedSiteArtifact(rehash(changed))).toThrow('exact replacement');
        const missing = getRetainedSiteArtifact(handle); missing.files.pop(); expect(() => validateMaterializedSiteArtifact(rehash(missing))).toThrow('incomplete');
        const scope = getRetainedSiteArtifact(handle); scope.scope.userId = ''; expect(() => validateMaterializedSiteArtifact(rehash(scope))).toThrow('scope');
        discardRetainedSiteArtifact(handle);
    });
    test('valid predecessor binds all fixed target CAS preconditions', async () => {
        const first = await captureSite(fixtureInput(), fixtureCaptureTransport()); const prior = getRetainedSiteArtifact(first);
        const input = fixtureInput(); input.predecessor = { manifestHash: prior.manifestHash, targets: prior.files.map(({ path, sha256 }) => ({ path, sha256 })) };
        const next = await captureSite(input, fixtureCaptureTransport()); const artifact = getRetainedSiteArtifact(next);
        for (const file of artifact.files) expect(file.beforeSha256).toBe(prior.files.find(previous => previous.path === file.path).sha256);
        expect(validateMaterializedSiteArtifact(artifact)).toBe(true);
        discardRetainedSiteArtifact(first); discardRetainedSiteArtifact(next);
    });
});

module.exports = { fixtureInput, fixtureCaptureTransport, blogFixture };
