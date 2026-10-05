import { describe, expect, it } from 'bun:test';
import { imageHash, imagePath, imageProof, validImageProof } from './cloudContentImage';
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
