import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

// In the Electron desktop app, header containers are `-webkit-app-region: drag`
// and so are their div/span/svg descendants. Buttons punch `no-drag` holes, but
// the icon or label INSIDE a button is itself a span/svg and re-adds drag on
// top of the hole. The result: only the button's padding is clickable. Both
// copies of the drag CSS (web layout + desktop main process) must carve out
// interactive descendants, with enough specificity to beat the drag rule.
// JSDOM can't evaluate app-region, so pin the source contract instead.
const layout = readFileSync(join(import.meta.dir, 'layout.tsx'), 'utf8');
const desktopMain = readFileSync(
    join(import.meta.dir, '../../../../desktop/main.js'),
    'utf8',
);

describe('desktop drag regions — button contents stay clickable', () => {
    it('web layout carves out descendants of interactive elements', () => {
        expect(layout).toMatch(/:root\[data-desktop='true'\] :is\(a, button[^)]*\) \*,/);
        expect(layout).toContain(":root[data-desktop='true'] .desktop-no-drag *");
    });

    it('desktop main process carves out descendants of interactive elements', () => {
        expect(desktopMain).toMatch(/:is\(a,button[^)]*\) \*,/);
        expect(desktopMain).toContain(':root[data-desktop="true"] .desktop-no-drag *');
    });
});
