import { describe, expect, it } from 'bun:test';

import { extractReactComponents } from '../components';

describe('extractReactComponents', () => {
    it('extracts named export function components', () => {
        const source = `
            export function HeroSection() {
                return <div>Hero</div>;
            }
        `;
        const result = extractReactComponents(source, 'src/components/hero.tsx');
        expect(result).toEqual([
            {
                componentName: 'HeroSection',
                filePath: 'src/components/hero.tsx',
                exportType: 'named',
            },
        ]);
    });

    it('extracts named export function components with generics', () => {
        const result = extractReactComponents(
            `export function List<T>() { return null; }`,
            'src/components/list.tsx',
        );
        expect(result).toEqual([
            { componentName: 'List', filePath: 'src/components/list.tsx', exportType: 'named' },
        ]);
    });

    it('extracts named export arrow components', () => {
        const source = `
            export const PricingCard = () => <div>Pricing</div>;
        `;
        const result = extractReactComponents(source, 'src/components/pricing.tsx');
        expect(result).toEqual([
            {
                componentName: 'PricingCard',
                filePath: 'src/components/pricing.tsx',
                exportType: 'named',
            },
        ]);
    });

    it('extracts default export function components', () => {
        const source = `
            export default function HomePage() {
                return <main>Home</main>;
            }
        `;
        const result = extractReactComponents(source, 'src/app/page.tsx');
        expect(result).toEqual([
            { componentName: 'HomePage', filePath: 'src/app/page.tsx', exportType: 'default' },
        ]);
    });

    it('ignores lowercase (non-component) functions', () => {
        const source = `
            export function formatDate(d: Date) { return d.toISOString(); }
        `;
        const result = extractReactComponents(source, 'src/utils/format.ts');
        expect(result).toHaveLength(0);
    });

    it('ignores lowercase export arrow', () => {
        expect(
            extractReactComponents(`export const util = () => 0;`, 'src/utils/util.ts'),
        ).toEqual([]);
    });

    it('ignores lowercase default export function', () => {
        expect(
            extractReactComponents(
                `export default function page() { return null; }`,
                'src/app/page.tsx',
            ),
        ).toEqual([]);
    });

    it('returns empty array for unparseable source', () => {
        const result = extractReactComponents('this is not valid JS {{{{', 'src/bad.tsx');
        expect(result).toEqual([]);
    });

    it('returns empty array for empty source', () => {
        expect(extractReactComponents('', 'src/empty.tsx')).toEqual([]);
    });

    it('extracts typed arrow components (const X: FC = ...)', () => {
        const source = `export const Button: React.FC<ButtonProps> = ({ children }) => <button>{children}</button>;`;
        const result = extractReactComponents(source, 'src/components/button.tsx');
        expect(result).toEqual([
            {
                componentName: 'Button',
                filePath: 'src/components/button.tsx',
                exportType: 'named',
            },
        ]);
    });

    it('extracts observer-wrapped components via HOC_WRAPPED_RE', () => {
        const result = extractReactComponents(
            `export const Obs = observer(() => <div />);`,
            'src/components/obs.tsx',
        );
        expect(result).toEqual([
            { componentName: 'Obs', filePath: 'src/components/obs.tsx', exportType: 'named' },
        ]);
    });

    it('extracts withRouter-wrapped components via HOC_WRAPPED_RE', () => {
        const result = extractReactComponents(
            `export const Connected = withRouter(Inner);`,
            'src/components/connected.tsx',
        );
        expect(result).toEqual([
            {
                componentName: 'Connected',
                filePath: 'src/components/connected.tsx',
                exportType: 'named',
            },
        ]);
    });

    it('does not extract commented-out exports (block comments)', () => {
        const source = [
            `/* export const Fake = () => <div />; */`,
            `/* export function Ghost() {} */`,
            `export function Real() { return null; }`,
        ].join('\n');
        const result = extractReactComponents(source, 'src/components/mixed.tsx');
        expect(result).toHaveLength(1);
        expect(result[0]?.componentName).toBe('Real');
    });

    it('does not extract commented-out exports (line comments)', () => {
        const source = `
            // export const CommentedOut = () => <div />;
            export const RealComponent = () => <div />;
        `;
        const result = extractReactComponents(source, 'src/components/mixed.tsx');
        expect(result).toEqual([
            {
                componentName: 'RealComponent',
                filePath: 'src/components/mixed.tsx',
                exportType: 'named',
            },
        ]);
    });

    it('extracts export default identifier re-export', () => {
        const source = `
            const MyPage = () => <main />;
            export default MyPage;
        `;
        const result = extractReactComponents(source, 'src/app/page.tsx');
        expect(result).toEqual([
            { componentName: 'MyPage', filePath: 'src/app/page.tsx', exportType: 'default' },
        ]);
    });

    it('detects multi-line param named function components', () => {
        const source = [
            `export function MultiLine(`,
            `  props: { title: string; count: number }`,
            `) {`,
            `  return <div />;`,
            `}`,
        ].join('\n');
        const result = extractReactComponents(source, 'src/components/multiline.tsx');
        expect(result).toEqual([
            {
                componentName: 'MultiLine',
                filePath: 'src/components/multiline.tsx',
                exportType: 'named',
            },
        ]);
    });

    it('deduplicates when a name appears via multiple patterns', () => {
        // A named function followed by `export default Name;` should appear once with type "default".
        const source = [
            `export function Shared() { return null; }`,
            `export default Shared;`,
        ].join('\n');
        const result = extractReactComponents(source, 'src/components/shared.tsx');
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            componentName: 'Shared',
            filePath: 'src/components/shared.tsx',
            exportType: 'default',
        });
    });

    it('collects multiple components from one file', () => {
        const source = [
            `export function Alpha() { return null; }`,
            `export const Beta = () => <div />;`,
            `export default function Gamma() { return null; }`,
        ].join('\n');
        const result = extractReactComponents(source, 'src/components/multi.tsx');
        const names = result.map((r) => r.componentName);
        expect(names).toContain('Alpha');
        expect(names).toContain('Beta');
        expect(names).toContain('Gamma');
        expect(result).toHaveLength(3);
    });
});
