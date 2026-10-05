import { describe, expect, it } from 'bun:test';

import {
    assertCloudRevision,
    assertOperationId,
    cloudPath,
    MAX_CLOUD_ASSET_BYTES,
    MAX_CLOUD_CHANGE_BYTES,
    MAX_CLOUD_FILES,
    MAX_CLOUD_TEXT_BYTES,
    validateCloudChanges,
} from './cloudEditor';

describe('cloud source validation', () => {
    it('accepts canonical source, assets and the durable interactions file', () => {
        for (const path of ['app/page.tsx', 'app/(marketing)/page.tsx', 'public/hero photo.svg', '.weblab/interactions.json']) {
            expect(cloudPath(path)).toBe(path);
        }
        expect(() => validateCloudChanges([
            { path: 'app/new-page', content: null, directory: true },
            { path: 'app/new-page/page.tsx', content: 'export default () => null;' },
            { path: 'public/photo.png', content: new Uint8Array([0, 255]).buffer },
            { path: 'public/removed.png', content: null },
        ])).not.toThrow();
    });

    it('rejects traversal, secrets, generated folders and local-only cache paths', () => {
        for (const path of [
            '', '/app/page.tsx', '../secret', 'app/../secret', 'app/./page.tsx',
            'app//page.tsx', 'app/', 'app\\page.tsx', 'app/\0x', 'app/\u007fx',
            '.env', '.env.local', 'nested/.env.production', '.git/config',
            'app/node_modules/module.ts', '.next/cache/file',
            '.weblab/index.json', '.weblab/recovery/draft.bin', '.weblab/cache/index.json',
            'x'.repeat(241),
        ]) expect(() => cloudPath(path)).toThrow('CLOUD_INVALID_PATH');
    });

    it('counts UTF-8 bytes rather than characters and enforces the text boundary', () => {
        expect(() => validateCloudChanges([{ path: 'text.txt', content: 'x'.repeat(MAX_CLOUD_TEXT_BYTES) }])).not.toThrow();
        expect(() => validateCloudChanges([{ path: 'text.txt', content: 'x'.repeat(MAX_CLOUD_TEXT_BYTES + 1) }])).toThrow('CLOUD_TEXT_TOO_LARGE');
        expect(() => validateCloudChanges([{ path: 'text.txt', content: 'å'.repeat(Math.floor(MAX_CLOUD_TEXT_BYTES / 2) + 1) }])).toThrow('CLOUD_TEXT_TOO_LARGE');
    });

    it('bounds assets, restricts their location and limits total change bytes', () => {
        expect(() => validateCloudChanges([{ path: 'public/photo.bin', content: new ArrayBuffer(MAX_CLOUD_ASSET_BYTES) }])).not.toThrow();
        expect(() => validateCloudChanges([{ path: 'public/photo.bin', content: new ArrayBuffer(MAX_CLOUD_ASSET_BYTES + 1) }])).toThrow('CLOUD_ASSET_TOO_LARGE');
        expect(() => validateCloudChanges([{ path: 'app/photo.bin', content: new ArrayBuffer(1) }])).toThrow('CLOUD_ASSET_PATH');
        const size = Math.floor(MAX_CLOUD_CHANGE_BYTES / 2) + 1;
        expect(() => validateCloudChanges([
            { path: 'public/one.bin', content: new ArrayBuffer(size) },
            { path: 'public/two.bin', content: new ArrayBuffer(size) },
        ])).toThrow('CLOUD_CHANGE_TOO_LARGE');
    });

    it('rejects duplicate paths, empty/oversized batches and directories with file content', () => {
        expect(() => validateCloudChanges([])).toThrow('CLOUD_INVALID_CHANGES');
        expect(() => validateCloudChanges(Array.from({ length: MAX_CLOUD_FILES + 1 }, (_, index) => ({ path: `file-${index}`, content: '' })))).toThrow('CLOUD_INVALID_CHANGES');
        expect(() => validateCloudChanges([
            { path: 'app/page.tsx', content: 'One' },
            { path: 'app/page.tsx', content: 'Two' },
        ])).toThrow('CLOUD_DUPLICATE_PATH');
        expect(() => validateCloudChanges([{ path: 'app/pages', content: '', directory: true }])).toThrow('CLOUD_INVALID_DIRECTORY');
    });

    it('requires safe positive revisions and bounded retry identifiers', () => {
        expect(() => assertCloudRevision(1)).not.toThrow();
        for (const revision of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => assertCloudRevision(revision)).toThrow('CLOUD_INVALID_REVISION');
        }
        for (const operationId of ['operation_0000001', 'x'.repeat(80)]) {
            expect(() => assertOperationId(operationId)).not.toThrow();
        }
        for (const operationId of ['', 'short', 'x'.repeat(81), 'invalid operation id', 'operation/0000001']) {
            expect(() => assertOperationId(operationId)).toThrow('CLOUD_INVALID_OPERATION');
        }
    });
});
