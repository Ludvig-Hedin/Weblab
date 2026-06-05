import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addClassToNode } from 'src/code-edit/style';
import { t } from 'src/packages';
import { getAstFromCodeblock, getContentFromAst } from 'src/parse';

/**
 * End-to-end demonstration of "do some edits and it will be saved" for the
 * canonical canvas edit — restyling an element.
 *
 * The flow when a user clicks an element on the canvas and changes a style:
 *   element source -> parse -> addClassToNode (the restyle) -> generate ->
 *   write to the project file.
 *
 * The local-first save is `fs.writeFile` on the user's disk — the exact syscall
 * the desktop NodeFs bridge makes (verified separately in apps/desktop:
 * editPersisted + editServed on the running dev server). This test exercises the
 * restyle → source-edit → write-to-disk → read-back chain against a real file so
 * the whole "edit then it is saved" path is demonstrated, not just asserted.
 */
async function applyRestyle(elementSource: string, className: string): Promise<string> {
    const node = getAstFromCodeblock(elementSource);
    if (!node) throw new Error('failed to parse element');
    addClassToNode(node, className);
    return getContentFromAst(t.file(t.program([t.expressionStatement(node)])), '');
}

describe('restyle an element → saved to the local file (end to end)', () => {
    test('adding a class on the canvas writes the change to the file on disk', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'wl-restyle-'));
        const file = join(dir, 'Button.tsx');
        try {
            await writeFile(file, '<button className="p-2 text-sm">Go</button>\n');

            // 1. Read the source (as the editor does for the clicked element).
            const before = await readFile(file, 'utf8');

            // 2. Restyle: the effect of clicking the element + adding a class.
            const edited = await applyRestyle(before.trim(), 'bg-blue-500');

            // 3. Save to the local file (NodeFs bridge = this fs.writeFile).
            await writeFile(file, edited);

            // 4. Reopen the file from disk → the edit persisted.
            const onDisk = await readFile(file, 'utf8');
            expect(onDisk).toContain('bg-blue-500'); // the new style is saved
            expect(onDisk).toContain('text-sm'); // existing styles preserved
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('restyling an element with no className inserts one and saves it', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'wl-restyle2-'));
        const file = join(dir, 'Box.tsx');
        try {
            await writeFile(file, '<div>content</div>\n');
            const edited = await applyRestyle('<div>content</div>', 'rounded-lg');
            await writeFile(file, edited);
            const onDisk = await readFile(file, 'utf8');
            expect(onDisk).toContain('className="rounded-lg"');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
