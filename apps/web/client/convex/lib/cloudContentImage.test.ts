import { describe, expect, it } from 'bun:test';
import { imageHash, imagePath, imageProof, validImageProof, imageMetadataProof, validImageMetadataProof, type CloudImageMetadataProofInput } from './cloudContentImage';
import { approveCloudContentBindings } from './cloudContentContract';
describe('cloud image boundary', () => {
    it('binds decoding proof to the exact attempt and normalized bytes', () => {
        const secret = 'secret'.repeat(8), hash = imageHash('image-one');
        const proof = imageProof(secret, 'attempt-one', hash);
        expect(validImageProof(secret, 'attempt-one', hash, proof)).toBe(true);
        expect(validImageProof(secret, 'attempt-two', hash, proof)).toBe(false);
        expect(validImageProof(secret, 'attempt-one', imageHash('image-two'), proof)).toBe(false);
        expect(validImageProof('other'.repeat(9), 'attempt-one', hash, proof)).toBe(false);
        expect(validImageProof('', 'attempt-one', hash, proof)).toBe(false);
        expect(validImageProof(secret, 'attempt-one', hash, 'bad')).toBe(false);
        expect(imagePath(hash)).toBe(`public/weblab-upload-${hash}.webp`);
        expect(() => imagePath('../x')).toThrow();
    });
    it('upload permission changes the authority fingerprint and only applies to image src', () => {
        const source = 'export default function Page() { return <main data-oid="root"><img data-oid="image" src="/old.png" alt="" /></main>; }';
        const binding = { oid: 'image', fields: ['src'] as const, allowedValues: { src: ['/old.png'] } };
        const run = (allowImageUploads?: boolean) => approveCloudContentBindings({ path: 'app/page.tsx', source, approvedAssetPaths: ['/old.png'], bindings: [{ ...binding, fields: ['src'], ...(allowImageUploads === undefined ? {} : { allowImageUploads }) }] });
        expect(run(true).fingerprint).not.toBe(run().fingerprint);
        expect(run(true).bindings[0]?.allowImageUploads).toBe(true);
        expect(() => approveCloudContentBindings({ path: 'app/page.tsx', source, approvedAssetPaths: ['/old.png'], bindings: [{ oid: 'image', fields: ['alt'], allowImageUploads: true }] })).toThrow();
    });
});

describe('v2 image metadata proof', () => {
    const secret = 'server-only-secret'.repeat(3);
    const upload = { kind: 'upload' as const, attemptId: 'attempt_123', hash: imageHash('normalized'), bytes: 250, width: 1600, height: 900 };
    const approval = { kind: 'approval' as const, projectId: 'project_123', branchId: 'branch_123', actorId: 'actor_123', revision: 7,
        path: 'public/media/original.webp', hash: imageHash('original bytes'), bytes: 900_000, width: 2752, height: 1548 };
    it('binds upload attempt, bytes, hash and normalized dimensions independently of object key order', () => {
        const proof = imageMetadataProof(secret, upload);
        expect(validImageMetadataProof(secret, { height: upload.height, width: upload.width, bytes: upload.bytes, hash: upload.hash, attemptId: upload.attemptId, kind: upload.kind }, proof)).toBe(true);
        for (const change of [{ attemptId: 'attempt_456' }, { hash: imageHash('other bytes') }, { bytes: 251 }, { width: 1601 }, { height: 901 }])
            expect(validImageMetadataProof(secret, { ...upload, ...change }, proof)).toBe(false);
    });
    it('binds approval scope, actor, source revision and original asset identity', () => {
        const proof = imageMetadataProof(secret, approval);
        expect(validImageMetadataProof(secret, approval, proof)).toBe(true);
        for (const change of [{ projectId: 'other_project' }, { branchId: 'other_branch' }, { actorId: 'other_actor' }, { revision: 8 },
            { path: 'public/media/other.webp' }, { hash: imageHash('other') }, { bytes: approval.bytes + 1 }, { width: 2753 }, { height: 1549 }])
            expect(validImageMetadataProof(secret, { ...approval, ...change }, proof)).toBe(false);
    });
    it('domain-separates operation kinds and v1, and rejects a changed secret', () => {
        const proof = imageMetadataProof(secret, upload);
        expect(validImageMetadataProof(secret, approval, proof)).toBe(false);
        expect(validImageMetadataProof(secret, upload, imageMetadataProof(secret, approval))).toBe(false);
        expect(validImageMetadataProof(secret, upload, imageProof(secret, upload.attemptId, upload.hash))).toBe(false);
        expect(validImageProof(secret, upload.attemptId, upload.hash, proof)).toBe(false);
        expect(validImageMetadataProof('different'.repeat(8), upload, proof)).toBe(false);
    });
    it('fails closed for malformed proofs, payloads, numbers and paths', () => {
        const proof = imageMetadataProof(secret, upload);
        for (const value of [null, undefined, '', 'x'.repeat(64), `${proof}\n`, proof.toUpperCase(), proof.slice(1), {}, 123])
            expect(validImageMetadataProof(secret, upload, value)).toBe(false);
        for (const value of [null, [], {}, { ...upload, extra: true }, { ...upload, kind: 'unknown' }, { ...upload, width: 0 },
            { ...upload, width: 8193 }, { ...upload, width: 8192, height: 8192 }, { ...upload, height: Number.NaN }, { ...upload, bytes: 1.5 },
            { ...upload, bytes: 600_001 }, { ...upload, hash: `${upload.hash}\n` }, { ...upload, attemptId: 'wrong\n' },
            { ...approval, revision: Infinity }, { ...approval, bytes: 32 * 1024 * 1024 + 1 }, { ...approval, path: 'https://example.test/photo.webp' },
            { ...approval, path: 'public/../private.webp' }, { ...approval, path: 'public/a\nb.webp' }, { ...approval, path: 'public/\ud800.webp' }]) {
            expect(validImageMetadataProof(secret, value, proof)).toBe(false);
            expect(() => imageMetadataProof(secret, value as CloudImageMetadataProofInput)).toThrow();
        }
        expect(validImageMetadataProof('', upload, proof)).toBe(false);
        expect(() => imageMetadataProof('', upload)).toThrow();
    });
});
