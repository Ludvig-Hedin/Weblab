import type { Element } from './html';
import { getAttr, literal, textContent } from './html';

// Families and variants supported by the generated Next.js 15 project.
const families = new Map<string, [string, number[], boolean]>([
    ['Inter', ['Inter', [100, 200, 300, 400, 500, 600, 700, 800, 900], true]],
    ['Roboto', ['Roboto', [100, 200, 300, 400, 500, 600, 700, 800, 900], true]],
    ['Open Sans', ['Open_Sans', [300, 400, 500, 600, 700, 800], true]],
    ['Montserrat', ['Montserrat', [100, 200, 300, 400, 500, 600, 700, 800, 900], true]],
    ['Lato', ['Lato', [100, 300, 400, 700, 900], true]],
    ['Poppins', ['Poppins', [100, 200, 300, 400, 500, 600, 700, 800, 900], true]],
    ['Playfair Display', ['Playfair_Display', [400, 500, 600, 700, 800, 900], true]],
    ['Oswald', ['Oswald', [200, 300, 400, 500, 600, 700], false]],
]);

const webFontCall =
    /^\s*WebFont\.load\(\s*\{\s*"?google"?\s*:\s*\{\s*"?families"?\s*:\s*(\[[^\]]*\])\s*\}\s*\}\s*\)\s*;?\s*$/;
const webFontLoader = /\/webfont(?:\.min)?\.js(?:[?#]|$)/i;

function buildFont(spec: string, index: number) {
    const [name = '', weights = '400', subsets = '', ...extra] = spec.split(':');
    const family = families.get(name);
    if (!family || extra.length) return null;
    const [exportName, allowedWeights, italic] = family;
    const variants = weights
        .split(',')
        .map((weight) => weight.replace(/^regular$/, '400').replace(/^italic$/, '400italic'));
    const subsetList = subsets ? subsets.split(',') : ['latin'];
    if (
        variants.some(
            (variant) =>
                !/^\d{3}(italic)?$/.test(variant) ||
                !allowedWeights.includes(Number(variant.slice(0, 3))) ||
                (variant.endsWith('italic') && !italic),
        ) ||
        subsetList.some((subset) => subset !== 'latin')
    )
        return null;
    const weight = [...new Set(variants.map((variant) => variant.slice(0, 3)))];
    const style = [
        ...new Set(variants.map((variant) => (variant.endsWith('italic') ? 'italic' : 'normal'))),
    ];
    return {
        name,
        exportName,
        binding: `font${index}`,
        variable: `--webflow-font-${index}`,
        options: { weight, style, subsets: subsetList, display: 'swap', adjustFontFallback: false },
    };
}

export function planFonts(documents: Element[][], warn: (message: string) => void) {
    const calls = documents.map((scripts) =>
        scripts.filter((script) => /\bWebFont\.load\s*\(/.test(textContent(script))),
    );
    const matched = calls.flat().map((script) => webFontCall.exec(textContent(script))?.[1]);
    const first = matched[0];
    let specs: string[] = [];
    if (
        first &&
        calls.every((group) => group.length === 1) &&
        matched.every((call) => call === first)
    ) {
        try {
            const parsed: unknown = JSON.parse(first);
            if (
                Array.isArray(parsed) &&
                parsed.every((item): item is string => typeof item === 'string')
            )
                specs = parsed;
        } catch {
            // Keep configurations outside the standard export format as scripts.
        }
    }

    const candidates = specs.map(buildFont);
    const supported = candidates.filter((font) => font !== null);
    const unsupported = specs.filter((_, index) => !candidates[index]);
    const convert =
        supported.length > 0 &&
        unsupported.length === 0 &&
        new Set(supported.map((font) => font.name)).size === supported.length;
    if (matched.length && !convert) {
        const detail = unsupported.length
            ? ' Unsupported families or variants: ' + unsupported.join(', ') + '.'
            : '';
        warn(
            'Kept the original WebFont loader because its configuration could not be fully converted.' +
                detail,
        );
    }
    const fonts = convert ? supported : [];
    const byName = new Map(fonts.map((font) => [font.name.toLowerCase(), font.variable]));

    return {
        skipScript: (script: Element) =>
            convert &&
            (webFontCall.test(textContent(script)) ||
                webFontLoader.test(getAttr(script, 'src') ?? '')),
        replaceFont: (value: string) =>
            value.replace(
                /(^|,)\s*(?:"([^"]*)"|'([^']*)'|([^,()]+?))\s*(?=,|$)/g,
                (
                    match: string,
                    comma: string,
                    double: string | undefined,
                    single: string | undefined,
                    bare: string | undefined,
                ) => {
                    const name = (double ?? single ?? bare ?? '').trim();
                    const variable = byName.get(name.toLowerCase());
                    return variable
                        ? `${comma}${comma ? ' ' : ''}var(${variable}, ${literal(name)})`
                        : match;
                },
            ),
        imports: fonts.length
            ? [
                  `import { ${fonts.map((font) => font.exportName).join(', ')} } from "next/font/google";`,
                  ...fonts.map(
                      ({ binding, exportName, variable, options }) =>
                          `const ${binding} = ${exportName}(${literal({ ...options, variable })});`,
                  ),
                  `const fontClasses = ["wf-active", ${fonts.map((font) => `${font.binding}.variable`).join(', ')}].join(" ");`,
              ].join('\n')
            : '',
    };
}
