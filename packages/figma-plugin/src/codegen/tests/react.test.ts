import { describe, test, expect } from 'bun:test';
import { generateReact } from '../react';
import type { SerializedNode } from '../types';

const frame: SerializedNode = {
    type: 'FRAME',
    name: 'Hero Section',
    width: 1440,
    height: 900,
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'CENTER',
    backgroundColor: '#f5f5f5',
    children: [
        {
            type: 'TEXT',
            name: 'Title',
            width: 400,
            height: 60,
            fontSize: 48,
            fontWeight: 700,
            textColor: '#1a1a1a',
            characters: 'Hello World',
            textAlignHorizontal: 'CENTER',
        },
    ],
};

describe('generateReact – Tailwind', () => {
    test('generates named export from frame name', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'tailwind' });
        expect(code).toContain('export function HeroSection()');
    });
    test('uses className (not style) for Tailwind', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'tailwind' });
        expect(code).toContain('className=');
        expect(code).not.toContain('style=');
    });
    test('renders text content', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'tailwind' });
        expect(code).toContain('Hello World');
    });
    test('wraps large text in h1', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'tailwind' });
        expect(code).toContain('<h1');
    });
    test('empty selection returns comment', () => {
        const code = generateReact([], { framework: 'react', styleMode: 'tailwind' });
        expect(code).toContain('No selection');
    });
});

describe('generateReact – inline styles', () => {
    test('uses style prop instead of className', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'inline' });
        expect(code).toContain('style=');
        expect(code).not.toContain('className=');
    });
});

describe('generateReact – css-modules', () => {
    test('includes styles import', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'css-modules' });
        expect(code).toContain("import styles from './styles.module.css'");
    });
    test('uses styles[...] className pattern', () => {
        const code = generateReact([frame], { framework: 'react', styleMode: 'css-modules' });
        expect(code).toContain('className={styles[');
    });
});
