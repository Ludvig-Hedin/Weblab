import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { indexStylesheet, editDeclaration, applyPatch, createClass, detachStyles, renameClass, classUsage } from '../src/classes';

const fixture = (name: string) => readFileSync(new URL('./data/classes/' + name + '.css', import.meta.url), 'utf8');
const webflow = fixture('webflow');
const mobile = fixture('mobile');

test('edits only the source value, including in an unlayered imported combo', () => {
    const patch = editDeclaration(webflow, { selector: '.button.is-secondary', state: 'hover' }, 'color', 'black');
    expect(applyPatch(webflow, patch)).toBe(webflow.replace('blue', 'black'));
    expect(patch).toEqual({ start: webflow.indexOf('blue') + 2, end: webflow.indexOf('blue') + 4, text: 'ack' });
    const rules = indexStylesheet(webflow);
    expect(rules[1]?.classes).toEqual(['button', 'is-secondary']);
    expect(webflow.slice(rules[1]!.start, rules[1]!.end)).toBe('.button.is-secondary:hover { color: blue; }');
    expect(detachStyles(webflow, { selector: '.button', width: 991, state: 'current' })).toEqual({display: 'block'});
});

test('creates states and ordered media in both directions and prunes empty rules', () => {
    for (const [source, selector, width, direction] of [[webflow, '.button', 479, 'max'], [mobile, 'h1', 480, 'min']] as const) {
        const target = { selector, width, direction, state: 'active' } as const;
        const changed = applyPatch(source, editDeclaration(source, target, 'opacity', '1'));
        expect(detachStyles(changed, target)).toEqual({opacity: '1'});
        expect(changed.indexOf(width + 'px') < changed.indexOf('768px')).toBe(direction === 'min');
        expect(applyPatch(changed, editDeclaration(changed, target, 'opacity', null))).toBe(source);
    }
    const added = applyPatch('', createClass('', 'card', { display: 'grid', gap: '1rem' }));
    expect(added).toContain('@layer components');
    expect(detachStyles(added, {selector: '.card'})).toEqual({ display: 'grid', gap: '1rem' });
});

test('renames a nine-page project and accounts for every remaining occurrence', () => {
    const expr = ['"button"', "{'button large'}", '{cn("button")}', '{clsx("button")}', '{twMerge("button")}', '{`button ${kind}`}', '{ok && "button"}', '{document.querySelector(".button")}', '"buttonish"'];
    const files = Object.fromEntries(expr.map((x,i) => ['page' + i + '.tsx', 'export default <a className=' + x + ' />']));
    const result = renameClass(webflow, files, 'button', 'action');
    expect(result.css).toBe(webflow.replaceAll('.button', '.action'));
    expect(result.unsafe.map(s => s.path).sort()).toEqual(['page5.tsx','page6.tsx','page7.tsx']);
    expect(Object.entries(result.files).filter(([,s]) => /\bbutton\b/.test(s)).map(([p]) => p)).toEqual(result.unsafe.map(s => s.path));
    const usage = classUsage(webflow, files);
    expect(usage.counts.button).toBe(7);
    expect(usage.unused).toEqual(['is-secondary']);
});
