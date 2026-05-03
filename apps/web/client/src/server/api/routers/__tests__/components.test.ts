import { describe, expect, test } from 'bun:test';
import { extractComponents } from '../components.utils';

const FILE = 'src/Foo.tsx';

describe('extractComponents', () => {
    // 1. Named export function components
    test('detects named export function component', () => {
        const source = `export function Foo() { return <div />; }`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([{ componentName: 'Foo', filePath: FILE, exportType: 'named' }]);
    });

    test('detects named export function component with generic', () => {
        const source = `export function List<T>() { return null; }`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([{ componentName: 'List', filePath: FILE, exportType: 'named' }]);
    });

    // 2. Named export arrow components
    test('detects named export arrow component', () => {
        const source = `export const Bar = () => <div />;`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([{ componentName: 'Bar', filePath: FILE, exportType: 'named' }]);
    });

    test('detects named export arrow component with typed params', () => {
        const source = `export const Card = (props: { title: string }) => <div>{props.title}</div>;`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([{ componentName: 'Card', filePath: FILE, exportType: 'named' }]);
    });

    test('detects named export arrow component with React.FC annotation', () => {
        const source = `export const Widget: React.FC = () => <span />;`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([
            { componentName: 'Widget', filePath: FILE, exportType: 'named' },
        ]);
    });

    // 3. Default export function components
    test('detects default export function component', () => {
        const source = `export default function Baz() { return null; }`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([{ componentName: 'Baz', filePath: FILE, exportType: 'default' }]);
    });

    test('detects default export identifier', () => {
        const source = [
            `export function Page() { return null; }`,
            `export default Page;`,
        ].join('\n');
        const results = extractComponents(source, FILE);
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({ componentName: 'Page', filePath: FILE, exportType: 'default' });
    });

    // 4. Lowercase / non-component names must be ignored
    test('ignores lowercase export function', () => {
        const source = `export function helper() { return 42; }`;
        expect(extractComponents(source, FILE)).toEqual([]);
    });

    test('ignores lowercase export arrow', () => {
        const source = `export const util = () => 0;`;
        expect(extractComponents(source, FILE)).toEqual([]);
    });

    test('ignores lowercase default export function', () => {
        const source = `export default function page() { return null; }`;
        expect(extractComponents(source, FILE)).toEqual([]);
    });

    // 5. observer-wrapped components
    // NAMED_ARROW_RE does NOT match these because the RHS is observer(...), not a bare arrow.
    // However HOC_WRAPPED_RE (/export\s+const\s+Foo\s*=\s*[a-z]\w*\s*\(/) does match,
    // so observer-wrapped components ARE detected — just via the HOC path, not the arrow path.
    test('detects observer-wrapped component via HOC_WRAPPED_RE', () => {
        const source = `export const Obs = observer(() => <div />);`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([{ componentName: 'Obs', filePath: FILE, exportType: 'named' }]);
    });

    test('detects withRouter-wrapped component via HOC_WRAPPED_RE', () => {
        const source = `export const Connected = withRouter(Inner);`;
        const results = extractComponents(source, FILE);
        expect(results).toEqual([
            { componentName: 'Connected', filePath: FILE, exportType: 'named' },
        ]);
    });

    // 6. Multi-line params via the function keyword path (NAMED_FUNCTION_RE stops at `(`,
    //    so multiline params inside the parens do not affect detection).
    test('detects named function component with multi-line params', () => {
        const source = [
            `export function MultiLine(`,
            `  props: { title: string; count: number }`,
            `) {`,
            `  return <div />;`,
            `}`,
        ].join('\n');
        const results = extractComponents(source, FILE);
        expect(results).toEqual([
            { componentName: 'MultiLine', filePath: FILE, exportType: 'named' },
        ]);
    });

    // 7. Block comments are stripped before matching, so content inside /* ... */ must not
    //    generate false positives.
    test('does not detect components inside block comments', () => {
        const source = [
            `/* export const Fake = () => <div />; */`,
            `/* export function Ghost() {} */`,
            `export function Real() { return null; }`,
        ].join('\n');
        const results = extractComponents(source, FILE);
        expect(results).toHaveLength(1);
        expect(results[0]?.componentName).toBe('Real');
    });

    test('does not detect components inside line comments', () => {
        const source = [
            `// export function Ghost() {}`,
            `export const Legit = () => <span />;`,
        ].join('\n');
        const results = extractComponents(source, FILE);
        expect(results).toHaveLength(1);
        expect(results[0]?.componentName).toBe('Legit');
    });

    // General correctness
    test('returns empty array for empty source', () => {
        expect(extractComponents('', FILE)).toEqual([]);
    });

    test('deduplicates when a name appears via multiple patterns', () => {
        // A named function followed by `export default Name;` should appear once with type "default".
        const source = [
            `export function Shared() { return null; }`,
            `export default Shared;`,
        ].join('\n');
        const results = extractComponents(source, FILE);
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
            componentName: 'Shared',
            filePath: FILE,
            exportType: 'default',
        });
    });

    test('collects multiple components from one file', () => {
        const source = [
            `export function Alpha() { return null; }`,
            `export const Beta = () => <div />;`,
            `export default function Gamma() { return null; }`,
        ].join('\n');
        const results = extractComponents(source, FILE);
        const names = results.map((r) => r.componentName);
        expect(names).toContain('Alpha');
        expect(names).toContain('Beta');
        expect(names).toContain('Gamma');
        expect(results).toHaveLength(3);
    });
});
