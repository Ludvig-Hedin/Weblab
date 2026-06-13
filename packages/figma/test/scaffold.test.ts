import { describe, expect, test } from 'bun:test';
import { scaffoldFrameComponent, scaffoldAppPage, scaffoldFigmaProjectFiles } from '../src/scaffold';
import type { FigmaTopLevelFrame } from '../src/types';

const frame: FigmaTopLevelFrame = {
    id: '1:2',
    name: 'Hero Section',
    width: 1440,
    height: 900,
    backgroundColor: '#f0f0f0',
};

describe('scaffoldFrameComponent', () => {
    test('generates a default export with the component name', () => {
        const src = scaffoldFrameComponent(frame);
        expect(src).toContain('export default function HeroSection()');
    });
    test('uses frame dimensions as inline styles', () => {
        const src = scaffoldFrameComponent(frame);
        expect(src).toContain('width: 1440');
        expect(src).toContain('height: 900');
    });
    test('uses background color', () => {
        const src = scaffoldFrameComponent(frame);
        expect(src).toContain("backgroundColor: '#f0f0f0'");
    });
    test('includes a TODO comment', () => {
        const src = scaffoldFrameComponent(frame);
        expect(src).toContain('TODO');
    });
    test('escapes frame names before embedding them in comments', () => {
        const src = scaffoldFrameComponent({
            ...frame,
            name: 'Hero */}\nconsole.log("injected"){/*',
        });
        expect(src).toContain('Hero * /) console.log("injected")(/ *');
        expect(src).not.toContain('\nconsole.log');
        expect(src).not.toContain('Hero */}');
        expect(src).not.toContain('{/* - imported from Figma');
    });
});

describe('scaffoldAppPage', () => {
    test('imports all frame components', () => {
        const src = scaffoldAppPage([frame]);
        expect(src).toContain("import HeroSection from '@/components/HeroSection'");
        expect(src).toContain('<HeroSection />');
    });
    test('handles multiple frames', () => {
        const frame2: FigmaTopLevelFrame = { ...frame, id: '1:3', name: 'Footer' };
        const src = scaffoldAppPage([frame, frame2]);
        expect(src).toContain('<HeroSection />');
        expect(src).toContain('<Footer />');
    });
    test('generates a default Page export', () => {
        const src = scaffoldAppPage([frame]);
        expect(src).toContain('export default function Page()');
    });
});

describe('scaffoldFigmaProjectFiles', () => {
    test('emits one component file per frame plus the app page', () => {
        const footer: FigmaTopLevelFrame = { ...frame, id: '1:3', name: 'Footer' };
        const files = scaffoldFigmaProjectFiles([frame, footer]);
        const paths = files.map((f) => f.path);
        expect(paths).toEqual([
            'src/components/HeroSection.tsx',
            'src/components/Footer.tsx',
            'src/app/page.tsx',
        ]);
    });

    test('de-duplicates frames that sanitize to the same component name', () => {
        const a: FigmaTopLevelFrame = { ...frame, id: '1:2', name: 'Hero' };
        const b: FigmaTopLevelFrame = { ...frame, id: '1:3', name: 'hero' };
        const c: FigmaTopLevelFrame = { ...frame, id: '1:4', name: 'Hero!' };
        const files = scaffoldFigmaProjectFiles([a, b, c]);
        const componentPaths = files.filter((f) => f.path.startsWith('src/components/'));
        expect(componentPaths.map((f) => f.path)).toEqual([
            'src/components/Hero.tsx',
            'src/components/Hero2.tsx',
            'src/components/Hero3.tsx',
        ]);
    });

    test('page imports stay in sync with the de-duplicated component files', () => {
        const a: FigmaTopLevelFrame = { ...frame, id: '1:2', name: 'Card' };
        const b: FigmaTopLevelFrame = { ...frame, id: '1:3', name: 'card' };
        const files = scaffoldFigmaProjectFiles([a, b]);
        const page = files.find((f) => f.path === 'src/app/page.tsx');
        expect(page?.content).toContain("import Card from '@/components/Card'");
        expect(page?.content).toContain("import Card2 from '@/components/Card2'");
        expect(page?.content).toContain('<Card />');
        expect(page?.content).toContain('<Card2 />');
    });
});
