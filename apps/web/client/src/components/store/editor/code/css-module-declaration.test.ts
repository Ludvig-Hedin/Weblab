import { describe, expect, test } from 'bun:test';
import { NodeFsProvider } from '@weblab/code-provider';
import type { Action, CssModuleStyleEdit, WriteCodeAction } from '@weblab/models/actions';
import type { EditorEngine } from '../engine';
import { reverseWriteCodeAction, transformRedoAction } from '../history/helpers';
import { CodeManager } from './index';
import { readCssModuleDeclaration, replaceCssModuleDeclaration, resolveCssModuleBinding, validateCssModuleValue } from './css-module-declaration';

const sourcePath = 'src/components/hero.tsx';
const cssPath = 'src/components/hero.module.css';
const source = 'import styles from "./hero.module.css"; export function Hero({intro}) { return <section><div data-oid="actions" className={styles.actions}>{intro}</div></section>; }';
const delayHelper = 'function delay(ms: number): CSSProperties { return { "--delay": `${ms}ms` } as CSSProperties; }';
const timedSource = 'import type { CSSProperties } from "react"; const T = { intro: 520, cards: 400, cardStep: 120 } as const;\n' +
    source.replace('data-oid="actions" className={styles.actions}', 'data-oid="intro" className={styles.intro} style={delay(T.intro)}') + '\n' + delayHelper;
const css = '/* Keep */\n.actions {\n  position: relative;\n  margin-top: 1.5rem; /* authored */\n}\n.other { color: #ffffff; }\n';
const generated = css.replace('1.5rem', '2rem');
const edit: CssModuleStyleEdit = { version: 1, sourcePath, source, oid: 'actions', cssPath, className: 'actions',
    property: 'margin-top', previousValue: '1.5rem', value: '2rem' };
const action: WriteCodeAction = { type: 'write-code', branchId: 'branch', diffs: [{ path: cssPath, original: css, generated }], cssModuleStyle: edit };

describe('exact CSS Modules declarations', () => {
    test('owns the lexical module class and changes only one authored value', () => {
        expect(resolveCssModuleBinding(sourcePath, source, 'actions', 'margin-top')).toEqual({ cssPath, className: 'actions' });
        expect(replaceCssModuleDeclaration(css, 'actions', 'margin-top', '1.5rem', '2rem')).toBe(generated);
        expect(replaceCssModuleDeclaration(generated, 'actions', 'margin-top', '2rem', '1.5rem')).toBe(css);
    });

    test('the direct resolver still refuses absolute paths and project escapes', () => {
        for (const path of ['/src/components/hero.tsx', '/Users/customer/hero.tsx', '../hero.tsx', 'src/../components/hero.tsx']) {
            expect(() => resolveCssModuleBinding(path, source, 'actions', 'margin-top')).toThrow();
        }
    });

    for (const changed of [
        source.replace('styles.actions', 'styles["actions"]'),
        source.replace('styles.actions', 'on ? styles.actions : ""'),
        source.replace('styles.actions', 'cn(styles.actions)'),
        source.replace('data-oid="actions"', 'data-oid="actions" {...props}'),
        source.replace('data-oid="actions"', 'data-oid="actions" style={delay(100)}'),
        source.replace('data-oid="actions"', 'data-oid="actions" style={{ marginBlockStart: "4px" }}'),
        source.replace('data-oid="actions"', 'data-oid="actions" style={{ ...other }}'),
        source.replace('<div data-oid=', '<Panel data-oid=').replace('</div>', '</Panel>'),
        source.replace('return <section>', 'const styles = { actions: "override" }; return <section>'),
        source.replace('return <section>', 'const alias = styles.actions; return <section>'),
        source.replace('return <section>', 'const conditional = on ? styles.actions : ""; return <section>'),
        source.replace('return <section>', 'styles.actions = "other"; return <section>'),
        source.replace('</section>', '<div data-oid="actions" /></section>'),
        source.replace('</section>', '<div data-oid={`actions`} /></section>'),
        source.replace('</section>', '<div data-oid={unknownIdentity} /></section>'),
        source.replace('</section>', '<div className={styles.actions} className="other" /></section>'),
        source.replace('./hero.module.css', '@/hero.module.css'),
        source.replace('./hero.module.css', '../../../escape.module.css'),
    ]) {
        test(`refuses an ambiguous JSX target: ${changed}`, () => {
            expect(() => resolveCssModuleBinding(sourcePath, changed, 'actions', 'margin-top')).toThrow();
        });
    }

    test('supports shared direct class uses and unrelated literal inline custom properties', () => {
        const shared = source.replace('</section>', '<div className={styles.actions} /></section>')
            .replace('data-oid="actions"', 'data-oid="actions" style={{ "--delay": "120ms" }}');
        expect(resolveCssModuleBinding(sourcePath, shared, 'actions', 'margin-top').className).toBe('actions');
    });

    test('recognizes the exact local Magma timing helper for all three intro properties', () => {
        for (const property of ['margin-top', 'max-width', 'color'] as const) {
            expect(resolveCssModuleBinding(sourcePath, timedSource, 'intro', property)).toEqual({ cssPath, className: 'intro' });
        }
        // Other direct calls do not change the proven sole returned key.
        const otherCall = timedSource + '\nfunction CardFrame({index}) { return <li style={delay(T.cards + index * T.cardStep)} />; }';
        expect(resolveCssModuleBinding(sourcePath, otherCall, 'intro', 'color').className).toBe('intro');
    });

    for (const changed of [
        timedSource + '\ndelay = other;',
        timedSource + '\nconst alias = delay;',
        timedSource.replace('style={delay(T.intro)}', 'style={unknownDelay(T.intro)}'),
        timedSource.replace('return <section>', 'const delay = other; return <section>'),
        timedSource.replace(delayHelper, '').replace('import type', 'import { delay } from "./timing"; import type'),
        timedSource.replace('function delay(ms:', 'async function delay(ms:'),
        timedSource.replace('function delay(ms:', 'function* delay(ms:'),
        timedSource.replace('ms: number)', 'ms: number = 0)'),
        timedSource.replace('return { "--delay"', 'track(); return { "--delay"'),
        timedSource.replace('return { "--delay": `${ms}ms` }', 'return { "--delay": `${ms}ms`, color: "red" }'),
        timedSource.replace('return { "--delay": `${ms}ms` }', 'return { get "--delay"() { return `${ms}ms`; } }'),
        timedSource.replace('return { "--delay": `${ms}ms` }', 'return { ["--delay"]: `${ms}ms` }'),
        timedSource.replace('return { "--delay": `${ms}ms` }', 'return { ...other, "--delay": `${ms}ms` }'),
        timedSource.replace('`${ms}ms`', '`${other}ms`'),
        timedSource.replace('`${ms}ms`', '`${Math.round(ms)}ms`'),
        timedSource.replace('`${ms}ms`', '`${ms++}ms`'),
        timedSource.replace('return { "--delay": `${ms}ms` }', 'return makeStyle(ms)'),
        timedSource.replace('style={delay(T.intro)}', 'style={delay(...values)}'),
    ]) {
        test(`refuses an unproven timing helper: ${changed}`, () => {
            expect(() => resolveCssModuleBinding(sourcePath, changed, 'intro', 'margin-top')).toThrow();
        });
    }

    for (const ambiguous of [
        '.actions { margin: 0; margin-top: 1.5rem; }',
        '.actions { all: unset; margin-top: 1.5rem; }',
        '.actions { margin-block-start: 0; margin-top: 1.5rem; }',
        '.actions { margin-top: 1.5rem; margin-top: 2rem; }',
        '.actions { margin-top: 1.5rem !important; }',
        '.actions { margin-top: 1.5rem; composes: other; }',
        '.actions { margin-top: 1.5rem; } .other { composes: actions; }',
        '.actions { margin-top: 1.5rem; } .other { composes: actions from "./shared.css"; }',
        '.actions { margin-top: 1.5rem; } .other { compose-with: actions; }',
        '.actions, .other { margin-top: 1.5rem; }',
        '.actions:hover { margin-top: 1.5rem; }',
        '@media(min-width: 900px) { .actions { margin-top: 1.5rem; } }',
        '.actions { margin-top: 1.5rem; } @media(min-width:900px) { .actions { color: red; } }',
        '.actions { margin-top: 1.5rem; & > span { display: block; } }',
        '@import "./other.css"; .actions { margin-top: 1.5rem; }',
        '.actions { margin-top: 1.5rem; } @scope (.actions) { :scope { margin-top: 0; } }',
        '.actions { margin-top: 1.5rem; } :export { actions: other; }',
    ]) {
        test(`refuses competing or conditional CSS: ${ambiguous}`, () => {
            expect(() => readCssModuleDeclaration(ambiguous, 'actions', 'margin-top')).toThrow();
        });
    }

    test('preserves color variables on Undo and refuses other overlapping property families', () => {
        const initial = '.title { color: var(--foreground); font-weight: 500; max-width: 30rem; }';
        const next = replaceCssModuleDeclaration(initial, 'title', 'color', 'var(--foreground)', '#ff5479');
        expect(replaceCssModuleDeclaration(next, 'title', 'color', '#ff5479', 'var(--foreground)')).toBe(initial);
        expect(() => readCssModuleDeclaration('.x { max-width: 20rem; max-inline-size: 10rem; }', 'x', 'max-width')).toThrow();
        expect(() => readCssModuleDeclaration('.x { font-weight: 500; font: inherit; }', 'x', 'font-weight')).toThrow();
        const unrelatedComposition = css + '.unrelated { composes: other; }';
        expect(replaceCssModuleDeclaration(unrelatedComposition, 'actions', 'margin-top', '1.5rem', '2rem')).toBe(unrelatedComposition.replace('1.5rem', '2rem'));
    });

    test('changes the real intro RGB color and restores its exact authored bytes', () => {
        const original = '.intro {\n  max-width: 26.9375rem;\n  margin-top: 2.5125rem;\n  color: rgb(0 0 0 / 0.8); /* keep */\n}\n';
        const value = 'rgb(0 0 0 / 0.8)';
        expect(readCssModuleDeclaration(original, 'intro', 'color')).toBe(value);
        const next = replaceCssModuleDeclaration(original, 'intro', 'color', value, '#ff5479');
        expect(next).toBe(original.replace(value, '#ff5479'));
        expect(replaceCssModuleDeclaration(next, 'intro', 'color', '#ff5479', value)).toBe(original);
        for (const valid of ['rgb(0 128 255)', 'rgb(255 255 255 / 1)', 'rgb(0 0 0 / .8)', 'rgb(1.5 2 3 / 0)']) {
            expect(() => validateCssModuleValue('color', valid)).not.toThrow();
        }
        for (const invalid of ['rgb(-1 0 0)', 'rgb(256 0 0)', 'rgb(0 0 0 / -0.1)', 'rgb(0 0 0 / 1.1)',
            'rgb(0 0 0 / Infinity)', 'rgb(0 0 0 / NaN)', 'rgb(0%, 0%, 0%)', 'rgb(0, 0, 0)', 'rgb(0 0 0 / 50%)',
            'rgb(calc(1) 0 0)', 'rgb(0 0 0 1)', 'rgb(0 0 0 / 0.8) extra', 'rgb(0 0 0); color: red']) {
            expect(() => validateCssModuleValue('color', invalid)).toThrow();
        }
    });

    test('validates a small parsed value grammar without accepting injected declarations', () => {
        for (const value of ['2rem; color: red', '2rem!important', 'calc(2rem + 1px)', '', '2rem\n', 'url(x)']) {
            expect(() => validateCssModuleValue('margin-top', value)).toThrow();
        }
        expect(() => validateCssModuleValue('max-width', '-3rem')).toThrow();
        expect(() => validateCssModuleValue('font-weight', '1000')).toThrow();
        expect(() => validateCssModuleValue('color', 'red; background: url(x)')).toThrow();
        expect(() => validateCssModuleValue('margin-top', '-2rem')).not.toThrow();
        expect(() => replaceCssModuleDeclaration(css, 'actions', 'margin-top', 'wrong', '2rem')).toThrow();
    });
});

function fixture(metadataPath = sourcePath) {
    const mirror = new Map([[sourcePath, source], [cssPath, css], ['other.css', 'before']]);
    const disk = new Map(mirror);
    const writes: string[] = [];
    const saved: Action[] = [];
    const errors: string[] = [];
    let reloads = 0;
    let externalRevision = 0;
    let ownRevision = 0;
    let onRead = async (_path: string) => {};
    let onWrite = (_path: string) => {};
    const native = Object.create(NodeFsProvider.prototype) as NodeFsProvider;
    native.readFileWithHash = async (path) => ({ content: disk.get(path) ?? '', sha256: 'a'.repeat(64) });
    const codeEditor = {
        getJsxElementMetadata: async () => ({ path: metadataPath }),
        readFile: async (path: string) => { await onRead(path); return mirror.get(path) ?? ''; },
        writeFile: async (path: string, content: string) => { writes.push(path); mirror.set(path, content); disk.set(path, content); ownRevision++; onWrite(path); },
    };
    const history = { isTransactionOpen: false, isPreparingForDisposal: false,
        pushImmediate: async (entry: Action, write: (entry: Action) => Promise<boolean>) => {
            const success = await write(entry);
            if (success) saved.push(entry);
            return success;
        } };
    const text = { hasPendingWork: false };
    const actions = { hasPendingStylePreflights: false, hasPendingRebases: false };
    const selection = { oid: 'actions', branchId: 'branch', frameId: 'frame', domId: 'dom' };
    const branch = { branch: { id: 'branch', runtime: { type: 'local' } }, codeEditor, history, sandbox: {
        session: { provider: native }, getLocalSourceVersion: () => JSON.stringify([...mirror]),
        getLocalExternalRevision: () => String(externalRevision), getLocalOwnRevision: () => String(ownRevision),
    } };
    const engine = Object.assign(new class {}(), { framework: 'nextjs', canUseDesign: true, isClosing: false, text, action: actions, style: { mode: 'root' },
        elements: { selected: [selection] },
        branches: { hasActiveBranch: true, activeBranchData: branch, getBranchDataById: (id: string) => id === 'branch' ? branch : null,
            activeError: { addCodeApplicationError: (error: string) => errors.push(error) } },
        frames: { getAll: () => [{ frame: { branchId: 'branch' }, view: {} }], reloadByBranchId: () => { reloads++; } } });
    const manager = new CodeManager(engine as unknown as EditorEngine);
    return { manager, mirror, disk, writes, saved, errors, history, text, actions, engine, selection,
        reloads: () => reloads, noteExternalChange: () => { externalRevision++; }, noteOwnChange: () => { ownRevision++; },
        onRead: (run: typeof onRead) => { onRead = run; }, onWrite: (run: typeof onWrite) => { onWrite = run; } };
}

describe('real CodeManager module save barrier', () => {
    test('normalizes the real CodeFS root path before storing private source dependencies', async () => {
        const f = fixture('/src/components/hero.tsx');
        const inspection = await f.manager.inspectCssModuleStyle(f.selection);
        expect(inspection.sourcePath).toBe(sourcePath);
        expect(inspection.cssPath).toBe(cssPath);
        expect(await f.manager.applyCssModuleStyle(inspection, 'margin-top', '2rem')).toBe('saved');
        expect((f.saved[0] as WriteCodeAction).cssModuleStyle?.sourcePath).toBe(sourcePath);
        expect(f.writes).toEqual([cssPath]);
    });

    test('saves only CSS and preserves the serialized marker across Undo/Redo and hydration', async () => {
        const f = fixture();
        const inspection = await f.manager.inspectCssModuleStyle(f.selection);
        expect(inspection.properties).toEqual({ 'margin-top': '1.5rem' });
        expect(await f.manager.applyCssModuleStyle(inspection, 'margin-top', '2rem')).toBe('saved');
        expect(f.disk.get(cssPath)).toBe(generated);
        expect(f.disk.get(sourcePath)).toBe(source);
        expect(f.writes).toEqual([cssPath]);
        const hydrated = JSON.parse(JSON.stringify(f.saved[0])) as WriteCodeAction;
        const inverse = reverseWriteCodeAction(hydrated);
        expect(inverse.cssModuleStyle).toMatchObject({ source, previousValue: '2rem', value: '1.5rem' });
        expect(await f.manager.write(inverse)).toBe(true);
        expect(f.disk.get(cssPath)).toBe(css);
        expect(await f.manager.write(transformRedoAction(hydrated))).toBe(true);
        expect(f.disk.get(cssPath)).toBe(generated);
        expect(f.reloads()).toBe(3);
        expect(f.errors).toEqual([]);
    });

    test('checks actual JSX disk bytes even when the cached source still matches', async () => {
        const f = fixture();
        f.disk.set(sourcePath, source.replace('styles.actions', 'styles.other'));
        expect(await f.manager.write(action)).toBe(false);
        expect(f.writes).toEqual([]);
        expect(f.reloads()).toBe(0);
    });

    test('checks JSX after an earlier queued source write yields, before touching CSS', async () => {
        const f = fixture();
        let release: (() => void) | undefined;
        const blocked = new Promise<void>(resolve => { release = resolve; });
        let entered: (() => void) | undefined;
        const reading = new Promise<void>(resolve => { entered = resolve; });
        f.onRead(async path => { if (path === 'other.css') { entered?.(); await blocked; } });
        const earlier = f.manager.write({ type: 'write-code', branchId: 'branch', diffs: [{ path: 'other.css', original: 'before', generated: 'after' }] });
        await reading;
        const pending = f.manager.write(action);
        f.disk.set(sourcePath, source.replace('styles.actions', 'styles.other'));
        release?.();
        expect(await earlier).toBe(true);
        expect(await pending).toBe(false);
        expect(f.writes).toEqual(['other.css']);
        expect(f.disk.get(cssPath)).toBe(css);
    });

    test('fences source, watcher and own-write drift during the later CSS mirror read on save and Undo', async () => {
        for (const changed of ['source', 'watcher', 'own'] as const) for (const replay of [false, true]) {
            const f = fixture();
            if (replay) expect(await f.manager.write(action)).toBe(true);
            const writesBefore = f.writes.length;
            let sourceRead = false;
            f.onRead(async path => {
                if (path === sourcePath) sourceRead = true;
                if (path !== cssPath) return;
                expect(sourceRead).toBe(true);
                if (changed === 'source') {
                    const latest = source.replace('styles.actions', 'styles.other');
                    f.mirror.set(sourcePath, latest);
                    f.disk.set(sourcePath, latest);
                } else if (changed === 'watcher') f.noteExternalChange();
                else f.noteOwnChange();
            });
            expect(await f.manager.write(replay ? reverseWriteCodeAction(action) : action)).toBe(false);
            expect(f.writes).toHaveLength(writesBefore);
            expect(f.disk.get(cssPath)).toBe(replay ? generated : css);
        }
    });

    test('refuses CSS drift and forged whole-file changes', async () => {
        const f = fixture();
        f.disk.set(cssPath, css.replace('1.5rem', '3rem'));
        expect(await f.manager.write(action)).toBe(false);
        f.disk.set(cssPath, css);
        expect(await f.manager.write({ ...action, diffs: [{ ...action.diffs[0]!, generated: generated + 'body{color:red}' }] })).toBe(false);
        expect(f.writes).toEqual([]);
    });

    test('refuses pending text, transactions, preflights and rebases before writing', async () => {
        for (const busy of ['text', 'history', 'preflight', 'rebase'] as const) {
            const f = fixture();
            if (busy === 'text') f.text.hasPendingWork = true;
            if (busy === 'history') f.history.isTransactionOpen = true;
            if (busy === 'preflight') f.actions.hasPendingStylePreflights = true;
            if (busy === 'rebase') f.actions.hasPendingRebases = true;
            expect(await f.manager.write(action)).toBe(false);
            expect(f.writes).toEqual([]);
        }
    });

    test('keeps a successful save and history when a newer text draft blocks refresh', async () => {
        const f = fixture();
        const inspection = await f.manager.inspectCssModuleStyle(f.selection);
        f.onWrite(() => { f.text.hasPendingWork = true; });
        expect(await f.manager.applyCssModuleStyle(inspection, 'margin-top', '2rem')).toBe('saved-refresh-pending');
        expect(f.saved).toHaveLength(1);
        expect(f.disk.get(cssPath)).toBe(generated);
        expect(f.reloads()).toBe(0);
        f.text.hasPendingWork = false;
        expect(f.manager.refreshCssModulePreview('branch')).toBe(true);
        expect(f.reloads()).toBe(1);
    });

    test('ordinary unmarked CSS writes never trigger the component-class reload', async () => {
        const f = fixture();
        const unmarked = { ...action };
        delete unmarked.cssModuleStyle;
        expect(await f.manager.write(unmarked)).toBe(true);
        expect(f.reloads()).toBe(0);
    });
});
