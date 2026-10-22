import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { replaceContentTextTarget, readContentTextTarget } from '@weblab/parser/src/code-edit/content-target';
import { assertImportedStudioSource, assertNoImportedStudioRuntimeReferences, prepareImportedStudioOperation,
    importedStudioRecipeFingerprint, IMPORTED_STUDIO_CONFIG_PATH, IMPORTED_STUDIO_PAGE_PATH, IMPORTED_STUDIO_BLOCK_PATH,
    serializeImportedStudioConfig, type ImportedStudioFile, type ImportedStudioOperation } from './cloudImportedStudio';

const stylesheet = 'src/components/sections/studio.module.css';
const prefix = 'import styles from "@/components/sections/studio.module.css";\n';
const pageSource = prefix + 'export function BasicPage() { return <main className={styles.root} data-oid="recipe-main"><h1 data-oid="recipe-title" data-weblab-studio-text="title">Title</h1><p data-oid="recipe-intro" data-weblab-studio-text="intro">Intro</p><div data-oid="recipe-slot" data-weblab-studio-slot="body"></div><span data-oid="recipe-fixed">Keep exact</span></main>; }\n';
const blockSource = prefix + 'export function TextBlock() { return <section className={styles.block} data-oid="block-root"><h2 data-oid="block-title" data-weblab-studio-text="title">Heading</h2><p data-oid="block-body" data-weblab-studio-text="body">Body</p></section>; }\n';
function file(path: string, text: string): ImportedStudioFile { return { path, kind: 'file', text, hash: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) }; }
function initial() { return [file('tsconfig.json', '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}'), file(stylesheet, '.root { display: block } .block { padding: 24px }'), file(IMPORTED_STUDIO_PAGE_PATH, pageSource), file(IMPORTED_STUDIO_BLOCK_PATH, blockSource)]; }
const capture: ImportedStudioOperation = { kind: 'capture', label: 'Information page', blockLabel: 'Text section', slots: [{ key: 'body', max: 10 }] };
function fixture(input = initial()) {
    let files = input; const originalPaths = input.map(row => row.path); let index = 0;
    function plan(operation: ImportedStudioOperation, operationId = `operation_${String(++index).padStart(16, '0')}`) {
        return prepareImportedStudioOperation({ files, originalPaths, operation, operationId });
    }
    function apply(result: ReturnType<typeof plan>) {
        const next = new Map(files.map(row => [row.path, row]));
        for (const change of result.changes) next.set(change.path, file(change.path, change.content)); files = [...next.values()]; return result;
    }
    function put(path: string, text: string) { const next = new Map(files.map(row => [row.path, row])); next.set(path, file(path, text)); files = [...next.values()]; }
    return { plan, apply, put, files: () => files, originalPaths, read: (path: string) => files.find(row => row.path === path)!.text!,
        state: () => assertImportedStudioSource({ files, originalPaths }) };
}
function created() {
    const f = fixture(); f.apply(f.plan(capture));
    const result = f.apply(f.plan({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'story' }));
    return { ...f, page: result.config.pages[0]! };
}

describe('imported Studio pure planner', () => {
    it('captures only bounded recipe data and creates a native named owner plus thin route deterministically', () => {
        const f = fixture(), untouched = structuredClone(f.files());
        const captured = f.plan(capture, 'capture_operation_0001');
        expect(captured.changes.map(row => row.path)).toEqual([IMPORTED_STUDIO_CONFIG_PATH]);
        expect(captured.textContracts).toEqual([]); expect(f.files()).toEqual(untouched);
        f.apply(captured); const baseline = structuredClone(f.files());
        const operation = { kind: 'createPage', templateId: 'basic-page-v1', slug: 'story' } as const;
        const result = f.plan(operation, 'create_operation_0001');
        expect(f.plan(operation, 'create_operation_0001')).toEqual(result); expect(f.files()).toEqual(baseline);
        f.apply(result); const page = result.config.pages[0]!;
        expect(f.read(page.routePath)).toContain('export default function Page()');
        expect(f.read(page.ownerPath)).toContain('export function StudioPage()');
        expect(result.textContracts[0]!.bindings).toHaveLength(2);
        expect(result.textContracts[0]!.bindings.every(binding => binding.target.exportName === 'StudioPage')).toBe(true);
        expect(f.read(IMPORTED_STUDIO_PAGE_PATH)).toBe(pageSource);
        expect(f.read(stylesheet)).toBe(untouched[1]!.text!);
        expect(f.state().recipeFingerprint).toBe(captured.recipeFingerprint);
    });
    it('splices two independent native blocks, preserves edited leaves and exact surrounding bytes through move/remove', () => {
        const f = created(); const before = f.read(f.page.ownerPath);
        f.apply(f.plan({ kind: 'insertBlock', pageId: f.page.id, slotKey: 'body', blockId: 'text-block-v1', position: 0 }));
        f.apply(f.plan({ kind: 'insertBlock', pageId: f.page.id, slotKey: 'body', blockId: 'text-block-v1', position: 1 }));
        const state = f.state(), [first, second] = state.config.pages[0]!.slots[0]!.instances;
        const owner = state.owners[0]!;
        expect(owner.bindings).toHaveLength(6); expect(new Set(owner.bindings.map(binding => binding.bindingId)).size).toBe(6);
        expect(f.read(f.page.ownerPath)).not.toContain('<TextBlock');
        expect(f.read(f.page.ownerPath).match(/import /g)).toHaveLength(1);
        const blockLeaves = owner.bindings.slice(2);
        let edited = f.read(f.page.ownerPath);
        for (const [index, binding] of blockLeaves.entries()) edited = replaceContentTextTarget(edited, binding.target, readContentTextTarget(edited, binding.target), index === 0 ? '' : `Edited ${index}\nSecond line`);
        const json = f.read(IMPORTED_STUDIO_CONFIG_PATH); f.put(f.page.ownerPath, edited);
        expect(f.state().owners[0]!.fingerprint).toBe(owner.fingerprint); expect(f.read(IMPORTED_STUDIO_CONFIG_PATH)).toBe(json);
        f.apply(f.plan({ kind: 'moveBlock', pageId: f.page.id, slotKey: 'body', instanceId: second!.id, position: 0 }));
        expect(f.state().config.pages[0]!.slots[0]!.instances.map(instance => instance.id)).toEqual([second!.id, first!.id]);
        for (const binding of blockLeaves) expect(readContentTextTarget(f.read(f.page.ownerPath), binding.target)).toBe(readContentTextTarget(edited, binding.target));
        f.apply(f.plan({ kind: 'removeBlock', pageId: f.page.id, slotKey: 'body', instanceId: first!.id }));
        expect(f.state().owners[0]!.bindings).toHaveLength(4);
        f.apply(f.plan({ kind: 'removeBlock', pageId: f.page.id, slotKey: 'body', instanceId: second!.id }));
        expect(f.read(f.page.ownerPath)).toBe(before);
    });
    it.each(['Keep exact', 'styles.root', 'data-weblab-studio-slot="body"'])('refuses changed unapproved structure: %s', changed => {
        const f = created(); f.put(f.page.ownerPath, f.read(f.page.ownerPath).replace(changed, changed + '-changed'));
        expect(() => f.state()).toThrow();
    });
    it('refuses changed recipe and stylesheet instead of migrating or silently reapproving', () => {
        for (const path of [stylesheet, IMPORTED_STUDIO_PAGE_PATH, IMPORTED_STUDIO_BLOCK_PATH]) {
            const f = created(); f.put(path, f.read(path) + '\n'); expect(() => f.state()).toThrow('STALE_RECIPE');
        }
    });
    it('enforces slot bounds, exact instance ownership, unknown operation keys and original-path collision', () => {
        const f = created(); const before = structuredClone(f.files());
        expect(() => f.plan({ kind: 'removeBlock', pageId: f.page.id, slotKey: 'body', instanceId: 'studio-' + '0'.repeat(24) })).toThrow('SLOT_INVALID');
        expect(() => f.plan({ kind: 'insertBlock', pageId: f.page.id, slotKey: 'body', blockId: 'text-block-v1', position: 2 })).toThrow('LIMIT');
        expect(() => f.plan({ ...capture, source: 'execute()' } as ImportedStudioOperation)).toThrow('INVALID_OPERATION');
        expect(() => prepareImportedStudioOperation({ files: initial(), originalPaths: [IMPORTED_STUDIO_CONFIG_PATH], operation: capture, operationId: 'capture_operation_0001' })).toThrow('INVALID_CONFIG');
        expect(f.files()).toEqual(before);
        for (let i = 0; i < 10; i++) f.apply(f.plan({ kind: 'insertBlock', pageId: f.page.id, slotKey: 'body', blockId: 'text-block-v1', position: i }));
        expect(() => f.plan({ kind: 'insertBlock', pageId: f.page.id, slotKey: 'body', blockId: 'text-block-v1', position: 10 })).toThrow('LIMIT');
    });
    it('rejects recipes whose declared slot capacity could exceed the existing 100 text targets', () => {
        const text = prefix + 'export function TextBlock(){return <section data-oid="many-root"><h2 data-oid="many-h">Heading</h2><p data-oid="many-p">'
            + Array.from({ length: 10 }, (_, i) => `<span data-oid="many-${i}" data-weblab-studio-text="leaf-${i}">Body</span>`).join('') + '</p></section>;}';
        const f = fixture(); f.put(IMPORTED_STUDIO_BLOCK_PATH, text);
        expect(() => f.plan(capture)).toThrow('LIMIT');
        expect(f.plan({ ...capture, slots: [{ key: 'body', max: 9 }] }).config.recipe.slots[0]!.max).toBe(9);
    });
    it.each(['import other from "@/other.module.css";', 'import styles from "./studio.module.css";', 'import renamed from "@/components/sections/studio.module.css";'])('rejects unsupported CSS import %s', imp => {
        const f = fixture(); f.put(IMPORTED_STUDIO_BLOCK_PATH, blockSource.replace(prefix.trim(), imp)); expect(() => f.plan(capture)).toThrow();
    });
    it.each(['@import "other.css";', '.root { background: url(https://example.com/image.png) }', '.root { background: url(var(--image)) }'])('refuses unresolved CSS dependencies: %s', css => {
        const f = fixture(); f.put(stylesheet, css); expect(() => f.plan(capture)).toThrow('INVALID_RECIPE');
    });
    it.each(['src/app/story/page.tsx', 'src/app/(group)/story/page.tsx', 'src/app/[slug]/page.tsx'])('refuses occupied or unresolved route %s', path => {
        const f = fixture(); f.put(path, 'export default function Existing(){return <main/>;}'); f.apply(f.plan(capture));
        expect(() => f.plan({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'story' })).toThrow();
    });
    it('accepts the prepared bridge module attribute while refusing module and filesystem loaders', () => {
        const source = 'import Script from "next/script"; export default function Layout(){ return <html><body><Script src="/weblab-preload-script.js" type="module" strategy="afterInteractive" /></body></html>; }';
        const f = fixture(); f.put('src/app/layout.tsx', source);
        expect(() => f.plan(capture)).not.toThrow();
        expect(() => assertNoImportedStudioRuntimeReferences([file('src/app/layout.tsx', source)])).not.toThrow();
        for (const loader of ['import { createRequire } from "module";', 'import { createRequire } from "node:module";',
            'const loader = require("module");', 'import fs from "node:fs";', 'export { readFile } from "node:fs/promises";']) {
            const candidate = source + '\n' + loader;
            expect(() => assertNoImportedStudioRuntimeReferences([file('src/app/layout.tsx', candidate)])).toThrow('INVALID_INVENTORY');
        }
    });
    it('refuses hidden executable inventory, reserved JSON references and missing-target derivative imports', () => {
        const files = [...initial(), { path: 'public/hidden.ts', kind: 'file' as const, hash: 'a'.repeat(64), bytes: 1, storageId: 'hidden' }];
        expect(() => fixture(files).plan(capture)).toThrow('INVALID_INVENTORY');
        for (const source of ['import config from "@/weblab/studio.json";', 'const source = require("../weblab/studio.json");', 'const x = import(name);',
            'import fs from "node:fs"; fs.readFileSync("src/weblab/" + "studio.json");', 'eval(code);', 'const build = globalThis["Function"];', 'const load = require; load(name);']) {
            const f = fixture(); f.put('src/components/hidden.ts', source); expect(() => f.plan(capture)).toThrow('INVALID_INVENTORY');
            expect(() => assertNoImportedStudioRuntimeReferences([file('src/components/hidden.ts', source)])).toThrow('INVALID_INVENTORY');
        }
    });
    it('detects a generated OID collision before returning any changes', () => {
        const f = fixture(); f.apply(f.plan(capture));
        const operation = { kind: 'createPage', templateId: 'basic-page-v1', slug: 'story' } as const;
        const expected = f.plan(operation, 'create_operation_0001'), id = expected.textContracts[0]!.bindings[0]!.target;
        if (id.kind !== 'component-literal') throw Error('Expected literal');
        f.put('src/components/collision.tsx', `export function Collision(){return <div data-oid="${id.oid}"/>;}`);
        const before = structuredClone(f.files()); expect(() => f.plan(operation, 'create_operation_0001')).toThrow('OID_COLLISION'); expect(f.files()).toEqual(before);
    });
    it('does not allow source JSON to drop an existing owner', () => {
        const f = created(); const config = f.state().config; config.pages = [];
        f.put(IMPORTED_STUDIO_CONFIG_PATH, serializeImportedStudioConfig(config)); expect(() => f.state()).toThrow('STALE_SOURCE');
    });
    it('rejects state-only block reordering and preserves the input after refusal', () => {
        const f = created();
        for (let position = 0; position < 2; position++) f.apply(f.plan({ kind: 'insertBlock', pageId: f.page.id, slotKey: 'body', blockId: 'text-block-v1', position }));
        const config = f.state().config; config.pages[0]!.slots[0]!.instances.reverse();
        f.put(IMPORTED_STUDIO_CONFIG_PATH, serializeImportedStudioConfig(config));
        const before = structuredClone(f.files()); expect(() => f.state()).toThrow('STALE_SOURCE'); expect(f.files()).toEqual(before);
    });
    it('recipe fingerprint ignores mutable pages but binds the full captured policy', () => {
        const f = created(), config = f.state().config, fingerprint = importedStudioRecipeFingerprint(config);
        expect(importedStudioRecipeFingerprint({ ...config, pages: [] })).toBe(fingerprint);
        expect(importedStudioRecipeFingerprint({ ...config, recipe: { ...config.recipe, label: 'Different' } })).not.toBe(fingerprint);
    });
});


describe('imported Studio trusted runtime and resolved references', () => {
    it('skips only exact prepared bridge tuples and rejects imports into the bridge', () => {
        const bridge = file('public/weblab-preload-script.js', 'const global = Function("return this")();');
        const files = [...initial(), bridge];
        const input = { files, originalPaths: initial().map(row => row.path), operationId: 'capture_operation_0042', operation: capture };
        expect(() => prepareImportedStudioOperation(input)).toThrow('INVALID_INVENTORY');
        expect(prepareImportedStudioOperation({ ...input, runtimePins: [bridge] }).changes).toHaveLength(1);
        expect(() => prepareImportedStudioOperation({ ...input, runtimePins: [{ ...bridge, hash: 'a'.repeat(64) }] })).toThrow('INVALID_INVENTORY');
        for (const specifier of ['../public/weblab-preload-script.js', '../public/weblab-preload-script', '@/../public/weblab-preload-script', '../public/weblab-preload-script.js?raw']) {
            const consumer = file('src/consumer.ts', `import ${JSON.stringify(specifier)};`);
            expect(() => prepareImportedStudioOperation({ ...input, files: [...files, consumer], runtimePins: [bridge] })).toThrow('INVALID_INVENTORY');
        }
        const fake = file('src/other.ts', 'Function("return this")();');
        expect(() => prepareImportedStudioOperation({ ...input, files: [...files, fake], runtimePins: [bridge, fake] })).toThrow('INVALID_INVENTORY');
    });
    it.each([
        'import data from "@/weblab/./studio.json";',
        'import data from "@/other/../weblab/studio.json";',
        'const data = new URL("./stu" + "dio.json", import.meta.url);',
        'const data = new URL(`./${"studio"}.json`, import.meta.url);',
    ])('refuses normalized and computed local config references: %s', text => {
        expect(() => assertNoImportedStudioRuntimeReferences([file('src/weblab/consumer.ts', text)])).toThrow('INVALID_INVENTORY');
    });
});


describe('retained tooling is isolated from the Next runtime', () => {
    const tooling = file('scripts/check.ts', 'import { readFile } from "node:fs/promises"; const text = await readFile("src/content.ts", "utf8");');
    const packageFile = file('package.json', '{"name":"example-site","exports":{"./tool":"./scripts/check.ts"}}');
    it('retains ordinary filesystem checks outside the runtime', () => {
        expect(() => assertNoImportedStudioRuntimeReferences([tooling, packageFile])).not.toThrow();
        expect(() => assertNoImportedStudioRuntimeReferences([file('src/check.ts', tooling.text!)])).toThrow('INVALID_INVENTORY');
    });
    it.each([
        'import "../scripts/check";', 'import "@/../scripts/check.ts?raw";',
        'import "example-site/tool";', 'import {Worker} from "node:worker_threads";',
        'import {spawn} from "child_process";',
        'const url = new URL("../scripts/check.ts", import.meta.url);',
    ])('refuses a runtime route into tooling: %s', source => {
        expect(() => assertNoImportedStudioRuntimeReferences([tooling, packageFile, file('src/runtime.ts', source)])).toThrow('INVALID_INVENTORY');
    });
    it('still inspects tooling for reserved and computed config reads', () => {
        expect(() => assertNoImportedStudioRuntimeReferences([file('scripts/check.ts', 'import "../src/weblab/studio.json";')])).toThrow('INVALID_INVENTORY');
        expect(() => assertNoImportedStudioRuntimeReferences([file('scripts/check.ts', 'const value = import("../src/" + name);')])).toThrow('INVALID_INVENTORY');
    });
});
