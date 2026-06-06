import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

// The projects TopBar renders at the very top of the Electron desktop window.
// macOS launches with `titleBarStyle: 'hiddenInset'` (apps/desktop/main.js), so
// there is no native title bar — the window can ONLY be moved through
// `-webkit-app-region: drag` regions. The shared drag CSS in
// apps/web/client/src/app/layout.tsx marks any `.desktop-drag-region` (or
// `.top-bar`) container draggable and carves its interactive descendants
// (a / button / [role=button]…) out as `no-drag` so their clicks still land.
//
// If this header drops the opt-in, the global full-width drag-fallback strip
// (`#weblab-desktop-drag-fallback`) blankets the top of the window and swallows
// every click on the logo, workspace switcher, Projects dropdown, Marketplace
// link and avatar — the exact regression this test guards against.
//
// The behavior itself can't be exercised in unit tests: `-webkit-app-region` is
// a non-standard property JSDOM does not evaluate (getComputedStyle returns
// nothing for it), and CI has no Electron runtime. So we pin the source
// contract — the opt-in must live on the actual header container.
const source = readFileSync(join(import.meta.dir, 'top-bar.tsx'), 'utf8');

describe('projects TopBar — Electron drag opt-in', () => {
    it('marks the header container as a desktop drag region', () => {
        // Anchor to the root header <div>, identified by its `max-w-6xl` layout
        // class, so the assertion can only pass when the opt-in is on the real
        // container — not merely mentioned in a comment elsewhere in the file.
        const rootClass = /className="([^"]*\bmax-w-6xl\b[^"]*)"/.exec(source)?.[1] ?? '';
        expect(rootClass).not.toBe('');
        expect(rootClass).toContain('desktop-drag-region');
    });
});
