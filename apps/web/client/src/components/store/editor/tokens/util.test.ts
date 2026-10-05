import { describe, expect, test } from 'bun:test';
import { parseTokensFromGlobalsCss, renameThemeVariable, setDarkVariable, setThemeVariable, snapshotFromScan } from './util';

describe('safe token rename', () => {
    test('keeps old utility and var references working in light and dark', async () => {
        const source = '@theme { --color-brand: #123456; }\n.dark { --color-brand: #abcdef; }\n' +
            '.badge { color: var(--color-brand, red); }\n@utility badge { @apply hover:bg-brand/50; }';
        const output = await renameThemeVariable(source, 'color-brand', 'color-primary');
        const scan = parseTokensFromGlobalsCss(output);
        expect(scan.themeBlock['color-primary']?.value).toBe('#123456');
        expect(scan.darkBlock['color-primary']?.value).toBe('#abcdef');
        expect(scan.themeBlock['color-brand']?.value).toBe('var(--color-primary)');
        expect(scan.darkBlock['color-brand']?.value).toBe('var(--color-primary)');
        expect(output).toContain('var(--color-brand, red)');
        expect(output).toContain('hover:bg-brand/50');
        expect(scan.compatibilityAliases).toEqual({ 'color-brand': 'color-primary' });
        expect(snapshotFromScan(scan).variables.map((variable) => variable.name)).toEqual(['color-primary']);
    });

    test('leaves ordinary user-authored aliases visible', () => {
        const scan = parseTokensFromGlobalsCss('@theme { --color-brand: var(--color-blue); --color-blue: blue; }');
        expect(snapshotFromScan(scan).colorStyles.map((style) => style.name)).toEqual(['color-brand']);
    });

    test('inline aliases keep descendant dark references and follow later edits', async () => {
        const source = ':root { --brand: blue; } .dark { --brand: red; } ' +
            '@theme inline { --color-brand: var(--brand); }';
        const renamed = await renameThemeVariable(source, 'color-brand', 'color-primary');
        const scan = parseTokensFromGlobalsCss(renamed);
        expect(scan.themeBlock['color-brand']?.value).toBe('var(--brand)');
        expect(scan.themeBlock['color-primary']?.value).toBe('var(--brand)');
        expect(scan.compatibilityAliases['color-brand']).toBe('color-primary');
        const edited = parseTokensFromGlobalsCss(await setThemeVariable(renamed, 'color-primary', 'green'));
        expect(edited.themeBlock['color-brand']?.value).toBe('green');
        expect(edited.themeBlock['color-primary']?.value).toBe('green');
        expect(edited.compatibilityAliases['color-brand']).toBe('color-primary');
    });

    test('successive renames keep the entire compatibility chain', async () => {
        const first = await renameThemeVariable('@theme { --color-brand: blue; }', 'color-brand', 'color-primary');
        const next = await renameThemeVariable(first, 'color-primary', 'color-accent');
        const scan = parseTokensFromGlobalsCss(next);
        expect(scan.compatibilityAliases).toEqual({ 'color-brand': 'color-primary', 'color-primary': 'color-accent' });
        expect(snapshotFromScan(scan).variables.map((variable) => variable.name)).toEqual(['color-accent']);
    });

    test.each([
        '@theme { --color-brand: blue; --color-primary: red; }',
        '@theme { --color-brand: blue; } .dark { --color-primary: red; }',
    ])('refuses destination collisions: %s', async (source) => {
        await expect(renameThemeVariable(source, 'color-brand', 'color-primary')).rejects.toThrow('already exists');
    });

    test.each([
        '@theme { --color-brand: var(--other); --other: var(--color-brand); }',
        '@theme { --color-brand: blue; } .dark { --color-brand: var(--other); --other: var(--color-brand); }',
    ])('refuses light and dark alias cycles: %s', async (source) => {
        await expect(renameThemeVariable(source, 'color-brand', 'color-primary')).rejects.toThrow('cycle');
    });

    test('refuses invalid or stale names', async () => {
        await expect(renameThemeVariable('@theme { --color-brand: blue; }', 'color-brand', 'bad; }')).rejects.toThrow('variable name');
        await expect(renameThemeVariable('@theme { --color-brand: blue; }', 'missing', 'color-primary')).rejects.toThrow('no longer exists');
    });
});


describe('authored token value scopes', () => {
    test('updates an existing root token without creating a competing theme declaration', async () => {
        const source = ':root { --brand: blue; --other: kept; } .dark { --brand: red; }';
        const output = await setThemeVariable(source, 'brand', 'green');
        const scan = parseTokensFromGlobalsCss(output);
        expect(scan.rootBlock.brand?.value).toBe('green');
        expect(scan.rootBlock.other?.value).toBe('kept');
        expect(scan.darkBlock.brand?.value).toBe('red');
        expect(scan.hasThemeBlock).toBe(false);
    });

    test('updates all existing light scopes so a runtime root cannot shadow the chosen value', async () => {
        const source = '@theme { --color-brand: blue; } :root { --color-brand: red; } .dark { --color-brand: purple; }';
        expect(snapshotFromScan(parseTokensFromGlobalsCss(source)).variables.find((token) => token.name === 'color-brand')?.light).toBe('red');
        const scan = parseTokensFromGlobalsCss(await setThemeVariable(source, 'color-brand', 'green'));
        expect(scan.themeBlock['color-brand']?.value).toBe('green');
        expect(scan.rootBlock['color-brand']?.value).toBe('green');
        expect(scan.darkBlock['color-brand']?.value).toBe('purple');
    });

    test('renamed root values retain both mode compatibility aliases through later edits', async () => {
        const source = ':root { --brand: blue; } .dark { --brand: red; }';
        let output = await renameThemeVariable(source, 'brand', 'primary');
        output = await setThemeVariable(output, 'primary', 'green');
        output = await setDarkVariable(output, 'primary', 'purple');
        const scan = parseTokensFromGlobalsCss(output);
        expect(scan.rootBlock.primary?.value).toBe('green');
        expect(scan.darkBlock.primary?.value).toBe('purple');
        expect(scan.rootBlock.brand?.value).toBe('var(--primary)');
        expect(scan.darkBlock.brand?.value).toBe('var(--primary)');
        expect(scan.compatibilityAliases.brand).toBe('primary');
        expect(scan.hasThemeBlock).toBe(false);
    });

    test('keeps duplicate declaration priority and updates later dark scopes', async () => {
        const source = ':root { --brand: blue !important; /* keep */ --brand: red; } ' +
            '.dark { --brand: purple; } .dark { --brand: orange !important; }';
        const light = await setThemeVariable(source, 'brand', 'green');
        expect(light).toContain('--brand: green !important');
        expect(light).toContain('/* keep */ --brand: green');
        const dark = await setDarkVariable(light, 'brand', 'black');
        expect(parseTokensFromGlobalsCss(dark).darkBlock.brand?.value).toBe('black');
        expect(dark).toContain('--brand: black !important');
        expect(dark).not.toContain('purple');
        expect(dark).not.toContain('orange');
    });

    test('refuses an inseparable mixed light/dark declaration', async () => {
        await expect(setThemeVariable(':root, .dark { --brand: blue; }', 'brand', 'green'))
            .rejects.toThrow('shares a light and dark declaration');
        await expect(setDarkVariable(':root, .dark { --brand: blue; }', 'brand', 'purple'))
            .rejects.toThrow('shares a light and dark declaration');
    });
});
