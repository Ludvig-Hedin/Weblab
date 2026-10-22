import { describe, expect, it } from 'bun:test';
import type { EditorEngine } from '../engine';
import { TokensManager } from './index';

const layout = (stylesheet: string) => `import "${stylesheet}"; export default function Layout({children}) { return <html><body>{children}</body></html>; }`;
function fixture(separate = false) {
    const files: Record<string, string> = {
        'app/(site)/layout.tsx': layout('../globals.css'),
        'app/(studio)/layout.tsx': layout(separate ? './globals.css' : '../globals.css'),
        'app/globals.css': '@import "tailwindcss"; @theme { --color-brand: #fff; }',
        ...(separate ? { 'app/(studio)/globals.css': '@import "tailwindcss";' } : {}),
    };
    let unreadable = false;
    const calls: unknown[][] = [];
    class Source {
        async readFile(path: string) { if (!(path in files)) throw new Error('Missing'); return files[path]!; }
        async listFiles(pattern: string, options: { strict?: boolean }) {
            calls.push([pattern, options]);
            if (unreadable) throw new Error('Unreadable folder');
            return Object.keys(files);
        }
    }
    const branch = { branch: { id: 'branch' }, codeEditor: new Source() };
    class Engine { branches = { activeBranch: branch.branch, activeBranchData: branch, getBranchDataById: () => branch }; }
    const tokens = new TokensManager(new Engine() as unknown as EditorEngine);
    return { tokens, calls, refuseInventory: () => { unreadable = true; } };
}
describe('token source inventory', () => {
    it('uses all document roots and accepts only their single shared stylesheet', async () => {
        const shared = fixture(); await shared.tokens.scan();
        expect(shared.tokens.cssPath).toBe('app/globals.css');
        expect(shared.calls).toEqual([['**/*', { strict: true }]]);
        const separate = fixture(true); await separate.tokens.scan();
        expect(separate.tokens.cssPath).toBeNull();
        expect(separate.tokens.hasTokensLayer).toBe(false);
    });
    it('refuses unreadable inventory without reusing the earlier token registry', async () => {
        const f = fixture(); await f.tokens.scan();
        expect(f.tokens.variables.length).toBeGreaterThan(0);
        f.refuseInventory(); await f.tokens.scan();
        expect(f.tokens.scanError).toBe('Unreadable folder');
        expect(f.tokens.variables).toEqual([]);
        expect(f.tokens.hasTokensLayer).toBe(false);
        expect(f.calls).toEqual([['**/*', { strict: true }], ['**/*', { strict: true }]]);
    });
});
