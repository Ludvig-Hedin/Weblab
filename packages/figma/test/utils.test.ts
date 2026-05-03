import { describe, expect, test } from 'bun:test';
import { extractFigmaFileKey, figmaColorToHex, toComponentName } from '../src/utils';

describe('extractFigmaFileKey', () => {
    test('extracts key from /file/ URL', () => {
        expect(extractFigmaFileKey('https://www.figma.com/file/AbCdEfGh1234/My-Design')).toBe('AbCdEfGh1234');
    });
    test('extracts key from /design/ URL', () => {
        expect(extractFigmaFileKey('https://www.figma.com/design/XyZ9876543/Title')).toBe('XyZ9876543');
    });
    test('returns null for non-figma URL', () => {
        expect(extractFigmaFileKey('https://example.com/file/abc')).toBeNull();
    });
    test('returns null for figma URL missing key segment', () => {
        expect(extractFigmaFileKey('https://www.figma.com/file/')).toBeNull();
    });
    test('returns null for /proto/ path type', () => {
        expect(extractFigmaFileKey('https://www.figma.com/proto/AbCdEfGh1234/title')).toBeNull();
    });
    test('trims whitespace', () => {
        expect(extractFigmaFileKey('  https://www.figma.com/file/KEY123/Name  ')).toBe('KEY123');
    });
});

describe('figmaColorToHex', () => {
    test('converts white', () => {
        expect(figmaColorToHex({ r: 1, g: 1, b: 1 })).toBe('#ffffff');
    });
    test('converts black', () => {
        expect(figmaColorToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    });
    test('converts mid-gray', () => {
        expect(figmaColorToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe('#808080');
    });
});

describe('toComponentName', () => {
    test('PascalCases simple name', () => {
        expect(toComponentName('Home Page')).toBe('HomePage');
    });
    test('handles dashes and underscores', () => {
        expect(toComponentName('hero-section_v2')).toBe('HeroSectionV2');
    });
    test('falls back to Frame for empty string', () => {
        expect(toComponentName('')).toBe('Frame');
    });
});
