import { describe, expect, it } from 'bun:test';
import { prepareImportedNextConfig, prepareImportedNextDeclarations } from './cloudImportedNextConfig';

describe('imported Next dev-origin preparation', () => {
    it('pins the exact development declaration instead of rejecting a normal Next startup', () => {
        const lines = ['/// <reference types="next" />', '/// <reference types="next/image-types/global" />',
            'import "./.next/types/routes.d.ts";', 'import "./.next/types/root-params.d.ts";', '',
            '// NOTE: This file should not be edited',
            '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.', ''];
        for (const eol of ['\n', '\r\n']) {
            const original = lines.join(eol);
            const expected = original.replaceAll('./.next/types/', './.next/dev/types/');
            expect(prepareImportedNextDeclarations(original)).toBe(expected);
            expect(prepareImportedNextDeclarations(expected)).toBe(expected);
            expect(() => prepareImportedNextDeclarations(original + 'declare const custom: string;')).toThrow('CLOUD_IMPORT_DECLARATIONS_UNSUPPORTED');
        }
    });
    it('keeps authored settings and adds only the current gateway host policy', async () => {
        const original = `import type { NextConfig } from 'next';\nconst config: NextConfig = { poweredByHeader: false, turbopack: { root: process.cwd() }, async headers() { return [{ source: '/:path*', headers: [{key: 'X-Robots-Tag', value:'noindex, nofollow'}] }]; } }; export default config;`;
        const next = await prepareImportedNextConfig(original);
        expect(next).toContain('poweredByHeader: false'); expect(next).toContain('process.cwd()');
        expect(next).toContain('noindex, nofollow'); expect(next).toContain('WEBLAB_PREVIEW_HOST');
        expect(next).toContain('allowedDevOrigins'); expect(next).not.toContain("['*']");
        expect(original).not.toContain('allowedDevOrigins');
    });
    it('does not overwrite existing policy or guess through config wrappers and spreads', async () => {
        for (const content of [
            `export default { allowedDevOrigins: ['customer.example'] };`,
            `export default withPlugin({});`, `const config = {...base}; export default config;`,
            `export default { [key]: 'dynamic' };`, `export default () => ({});`,
        ]) await expect(prepareImportedNextConfig(content)).rejects.toThrow('CLOUD_IMPORT_CONFIG_');
    });
});
