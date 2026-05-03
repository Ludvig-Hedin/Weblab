import { describe, expect, test } from 'bun:test';
import { scaffoldFrameComponent, scaffoldAppPage } from '../src/scaffold';
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
