import { describe, test, expect } from 'bun:test';
import { buildTailwindClasses } from '../tailwind';
import type { SerializedNode } from '../types';

const frame: SerializedNode = {
    type: 'FRAME',
    name: 'Hero',
    width: 1440,
    height: 900,
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'CENTER',
    paddingTop: 48,
    paddingRight: 64,
    paddingBottom: 48,
    paddingLeft: 64,
    itemSpacing: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
};

describe('buildTailwindClasses – layout frame', () => {
    test('generates flex + flex-col for VERTICAL layout', () => {
        const c = buildTailwindClasses(frame);
        expect(c).toContain('flex');
        expect(c).toContain('flex-col');
    });
    test('generates justify-center for CENTER primaryAxisAlign', () => {
        expect(buildTailwindClasses(frame)).toContain('justify-center');
    });
    test('generates items-center for CENTER counterAxisAlign', () => {
        expect(buildTailwindClasses(frame)).toContain('items-center');
    });
    test('generates gap for itemSpacing', () => {
        expect(buildTailwindClasses(frame)).toContain('gap-[24px]');
    });
    test('generates background color with arbitrary value', () => {
        expect(buildTailwindClasses(frame)).toContain('bg-[#f5f5f5]');
    });
    test('generates border-radius', () => {
        expect(buildTailwindClasses(frame)).toContain('rounded-[8px]');
    });
    test('generates symmetric padding as py + px', () => {
        const c = buildTailwindClasses(frame);
        expect(c).toContain('py-[48px]');
        expect(c).toContain('px-[64px]');
    });
    test('generates width and height', () => {
        const c = buildTailwindClasses(frame);
        expect(c).toContain('w-[1440px]');
        expect(c).toContain('h-[900px]');
    });
});

const textNode: SerializedNode = {
    type: 'TEXT',
    name: 'Heading',
    width: 400,
    height: 60,
    fontSize: 48,
    fontWeight: 700,
    textColor: '#1a1a1a',
    textAlignHorizontal: 'CENTER',
    isItalic: false,
    characters: 'Hello',
};

describe('buildTailwindClasses – text node', () => {
    test('generates text size', () => {
        expect(buildTailwindClasses(textNode)).toContain('text-[48px]');
    });
    test('generates font-bold for weight 700', () => {
        expect(buildTailwindClasses(textNode)).toContain('font-bold');
    });
    test('generates text-center', () => {
        expect(buildTailwindClasses(textNode)).toContain('text-center');
    });
    test('generates text color', () => {
        expect(buildTailwindClasses(textNode)).toContain('text-[#1a1a1a]');
    });
});
