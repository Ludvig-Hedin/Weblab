/**
 * Low-level Figma clipboard codec.
 *
 * Figma's copy/paste payload is a `text/html` blob whose `data-buffer` comment
 * holds a base64 `.fig`-style Kiwi archive:
 *
 *   "fig-kiwi" (8 bytes) | version (uint32 LE) | [len uint32 LE | zlib-raw chunk]...
 *     chunk[0] = Kiwi binary schema   chunk[1] = Kiwi-encoded Message
 *
 * The byte layout here is a faithful reimplementation of the `fig-kiwi` package
 * (https://www.npmjs.com/package/fig-kiwi), driven by the official `kiwi-schema`
 * codec + `pako` so we control the schema (vendored in `schema-data.ts`).
 */
import { compileSchema, decodeBinarySchema } from 'kiwi-schema';
import { deflateRaw, inflateRaw } from 'pako';

import type { FigmaMessage, FigmaMeta } from './types';
import { FIGMA_SCHEMA_BASE64 } from './schema-data';

const FIG_KIWI_PRELUDE = 'fig-kiwi';
const FIG_KIWI_VERSION = 15;

const META_START = '<!--(figmeta)';
const META_END = '(/figmeta)-->';
const FIG_START = '<!--(figma)';
const FIG_END = '(/figma)-->';

interface CompiledFigmaSchema {
    encodeMessage(message: unknown): Uint8Array;
    decodeMessage(bytes: Uint8Array): FigmaMessage;
}

// ---------------------------------------------------------------------------
// base64 helpers (browser + Bun/Node safe; no Node Buffer dependency)
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const CHUNK = 0x8000; // avoid stack overflow on String.fromCharCode(...spread)
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

// ---------------------------------------------------------------------------
// Schema (vendored, lazily compiled + memoized)
// ---------------------------------------------------------------------------

let schemaBytesCache: Uint8Array | null = null;
function schemaBytes(): Uint8Array {
    schemaBytesCache ??= base64ToBytes(FIGMA_SCHEMA_BASE64);
    return schemaBytesCache;
}

let compiledCache: CompiledFigmaSchema | null = null;
function compiledSchema(): CompiledFigmaSchema {
    compiledCache ??= compileSchema(decodeBinarySchema(schemaBytes())) as CompiledFigmaSchema;
    return compiledCache;
}

// ---------------------------------------------------------------------------
// Archive read/write
// ---------------------------------------------------------------------------

function writeArchive(files: Uint8Array[]): Uint8Array {
    const headerSize = FIG_KIWI_PRELUDE.length + 4;
    const total = files.reduce((sz, f) => sz + 4 + f.byteLength, headerSize);
    const buffer = new Uint8Array(total);
    const view = new DataView(buffer.buffer);
    new TextEncoder().encodeInto(FIG_KIWI_PRELUDE, buffer);
    let offset = FIG_KIWI_PRELUDE.length;
    view.setUint32(offset, FIG_KIWI_VERSION, true);
    offset += 4;
    for (const file of files) {
        view.setUint32(offset, file.byteLength, true);
        offset += 4;
        buffer.set(file, offset);
        offset += file.byteLength;
    }
    return buffer;
}

function readArchiveChunks(buffer: Uint8Array): Uint8Array[] {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let offset = FIG_KIWI_PRELUDE.length + 4; // skip prelude + version
    const files: Uint8Array[] = [];
    while (offset + 4 <= buffer.length) {
        const size = view.getUint32(offset, true);
        offset += 4;
        if (size === 0 || offset + size > buffer.length) break;
        files.push(buffer.subarray(offset, offset + size));
        offset += size;
    }
    return files;
}

// ---------------------------------------------------------------------------
// Public: encode a Figma message → clipboard HTML, and the inverse (for tests)
// ---------------------------------------------------------------------------

export function encodeFigmaClipboardHtml(message: FigmaMessage, meta: FigmaMeta): string {
    const compiled = compiledSchema();
    const archive = writeArchive([
        deflateRaw(schemaBytes()),
        deflateRaw(compiled.encodeMessage(message)),
    ]);
    const metaB64 = bytesToBase64(new TextEncoder().encode(JSON.stringify(meta)));
    const figB64 = bytesToBase64(archive);
    return (
        `<meta charset="utf-8"><meta charset="utf-8">` +
        `<span data-metadata="${META_START}${metaB64}${META_END}"></span>` +
        `<span data-buffer="${FIG_START}${figB64}${FIG_END}"></span>` +
        `<span style="white-space:pre-wrap"></span>`
    );
}

export interface ParsedFigmaClipboard {
    meta: FigmaMeta;
    message: FigmaMessage;
}

/** Inverse of {@link encodeFigmaClipboardHtml}. Primarily for round-trip tests. */
export function decodeFigmaClipboardHtml(html: string): ParsedFigmaClipboard {
    const between = (s: string, a: string, b: string): string => {
        const i = s.indexOf(a);
        const j = s.indexOf(b, i + a.length);
        if (i < 0 || j < 0) throw new Error('figma clipboard markers not found');
        return s.slice(i + a.length, j);
    };
    const meta = JSON.parse(
        new TextDecoder().decode(base64ToBytes(between(html, META_START, META_END))),
    ) as FigmaMeta;
    const archive = base64ToBytes(between(html, FIG_START, FIG_END));
    const [, dataChunk] = readArchiveChunks(archive);
    if (!dataChunk) throw new Error('figma clipboard archive missing data chunk');
    const message = compiledSchema().decodeMessage(inflateRaw(dataChunk));
    return { meta, message };
}
