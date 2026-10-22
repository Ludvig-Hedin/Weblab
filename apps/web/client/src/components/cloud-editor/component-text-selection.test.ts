import { describe, expect, it } from 'bun:test';
import { selectedComponentTextTarget } from './component-text-selection';

const source = `import styles from './hero.module.css';
export function Other() { return <p data-oid="other">Other</p>; }
export function Hero() { return <header className={styles.hero} data-oid="root"><h1 data-oid="heading"><span data-oid="first">First line</span><span data-oid="second">Second line</span></h1></header>; }`;
describe('saved component text selection', () => {
    it('finds the full-file owner through CSS expressions and keeps heading spans separate', () => {
        expect(selectedComponentTextTarget(source, 'first')).toEqual({ kind: 'component-literal', exportName: 'Hero', oid: 'first' });
        expect(selectedComponentTextTarget(source, 'heading')).toBeNull();
        expect(selectedComponentTextTarget('<span data-oid="first">First line</span>', 'first')).toBeNull();
    });
    it('refuses duplicate identities and dynamic text without offering another owner', () => {
        expect(selectedComponentTextTarget(source.replace('data-oid="other"', 'data-oid="first"'), 'first')).toBeNull();
        expect(selectedComponentTextTarget(source.replace('>First line<', '>{value}<'), 'first')).toBeNull();
        expect(selectedComponentTextTarget(source, 'missing')).toBeNull();
    });
});
