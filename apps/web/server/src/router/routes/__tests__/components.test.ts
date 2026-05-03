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
            { name: 'HeroSection', filePath: 'src/components/hero.tsx', exportType: 'named' },
        ]);
    });

    it('extracts named export arrow components', () => {
        const source = `
            export const PricingCard = () => <div>Pricing</div>;
        `;
        const result = extractReactComponents(source, 'src/components/pricing.tsx');
        expect(result).toEqual([
            { name: 'PricingCard', filePath: 'src/components/pricing.tsx', exportType: 'named' },
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
            { name: 'HomePage', filePath: 'src/app/page.tsx', exportType: 'default' },
        ]);
    });

    it('ignores lowercase (non-component) functions', () => {
        const source = `
            export function formatDate(d: Date) { return d.toISOString(); }
        `;
        const result = extractReactComponents(source, 'src/utils/format.ts');
        expect(result).toHaveLength(0);
    });

    it('returns empty array for unparseable source', () => {
        const result = extractReactComponents('this is not valid JS {{{{', 'src/bad.tsx');
        expect(result).toEqual([]);
    });

    it('extracts typed arrow components (const X: FC = ...)', () => {
        const source = `export const Button: React.FC<ButtonProps> = ({ children }) => <button>{children}</button>;`;
        const result = extractReactComponents(source, 'src/components/button.tsx');
        expect(result).toEqual([
            { name: 'Button', filePath: 'src/components/button.tsx', exportType: 'named' },
        ]);
    });

    it('does not extract commented-out exports', () => {
        const source = `
            // export const CommentedOut = () => <div />;
            export const RealComponent = () => <div />;
        `;
        const result = extractReactComponents(source, 'src/components/mixed.tsx');
        expect(result).toEqual([
            { name: 'RealComponent', filePath: 'src/components/mixed.tsx', exportType: 'named' },
        ]);
    });

    it('extracts export default identifier re-export', () => {
        const source = `
            const MyPage = () => <main />;
            export default MyPage;
        `;
        const result = extractReactComponents(source, 'src/app/page.tsx');
        expect(result).toEqual([
            { name: 'MyPage', filePath: 'src/app/page.tsx', exportType: 'default' },
        ]);
    });
});
