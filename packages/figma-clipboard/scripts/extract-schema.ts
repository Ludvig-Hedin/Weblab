/**
 * Regenerate `src/schema-data.ts` (the vendored Figma Kiwi scene schema).
 *
 * Every Figma `.fig` file and every clipboard buffer embeds its own schema as
 * the first chunk of a `fig-kiwi` archive. This script reads that chunk from an
 * UNZIPPED inner archive and writes it out base64-encoded.
 *
 * Usage:
 *   1. Obtain a `.fig` file (any Figma export). It is a zip; extract the inner
 *      archive:   unzip -o design.fig canvas.fig
 *   2. bun packages/figma-clipboard/scripts/extract-schema.ts ./canvas.fig
 *
 * The schema is stable across Figma versions for the fields we populate; only
 * regenerate if a future Figma change breaks the round-trip test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRaw } from 'pako';

const PRELUDE = 'fig-kiwi';

function main(): void {
    const input = process.argv[2];
    if (!input) {
        console.error('Usage: extract-schema.ts <path-to-inner-canvas.fig>');
        process.exit(1);
    }
    const buf = new Uint8Array(readFileSync(resolve(input)));
    if (new TextDecoder().decode(buf.subarray(0, PRELUDE.length)) !== PRELUDE) {
        console.error('Not a fig-kiwi archive. Unzip the .fig first: unzip design.fig canvas.fig');
        process.exit(1);
    }
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = PRELUDE.length + 4; // prelude + version
    const size = view.getUint32(offset, true);
    offset += 4;
    const schema = inflateRaw(buf.subarray(offset, offset + size));
    const b64 = Buffer.from(schema).toString('base64');
    const wrapped = (b64.match(/.{1,120}/g) ?? []).join('\\n');

    const out = resolve(import.meta.dirname, '../src/schema-data.ts');
    writeFileSync(
        out,
        `// AUTO-GENERATED — do not edit by hand.\n` +
            `// Figma Kiwi binary scene schema (output of kiwi \`encodeBinarySchema\`), base64-encoded.\n` +
            `// Regenerate with: bun packages/figma-clipboard/scripts/extract-schema.ts <path-to.fig>\n` +
            `// Decoded length: ${schema.length} bytes.\n` +
            `export const FIGMA_SCHEMA_BASE64 =\n    "${wrapped}";\n`,
    );
    console.log(`Wrote ${out} (${schema.length} schema bytes)`);
}

main();
