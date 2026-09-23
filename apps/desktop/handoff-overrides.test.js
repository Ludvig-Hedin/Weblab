import { expect, test } from 'vitest';

import { applyHandoffOverrides } from './weblab-local.js';

const plan = [
    { path: 'app/page.tsx', original: 'old page', updated: 'instrumented page' },
    { path: 'app/layout.tsx', original: 'layout', updated: 'layout + scripts' },
    { path: 'public/weblab-preload-script.js', original: null, updated: 'bundle' },
];

test('cleaned overrides narrow the reviewed plan', () => {
    expect(applyHandoffOverrides(plan, [
        { path: 'app/page.tsx', updated: 'clean page' },
        { path: 'app/layout.tsx', updated: 'layout' },
    ])).toEqual([{ path: 'app/page.tsx', original: 'old page', updated: 'clean page' }]);
    expect(applyHandoffOverrides(plan, undefined)).toBe(plan);
});

test('overrides cannot add paths, delete kept files, or be empty', () => {
    expect(() => applyHandoffOverrides(plan, [{ path: 'secret.txt', updated: 'x' }]))
        .toThrow('not in the reviewed plan');
    expect(() => applyHandoffOverrides(plan, [{ path: 'app/page.tsx', updated: null }]))
        .toThrow('cannot delete');
    expect(() => applyHandoffOverrides(plan, [{ path: 'app/layout.tsx', updated: 'layout' }]))
        .toThrow('no changes');
    expect(() => applyHandoffOverrides(plan, [
        { path: 'app/page.tsx', updated: 'a' },
        { path: 'app/page.tsx', updated: 'b' },
    ])).toThrow('Invalid');
});
