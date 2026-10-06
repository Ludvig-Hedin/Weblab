import { describe, expect, test } from 'bun:test';
import { resolveContentImageRenderMapping } from './content-image-render-mapping';
import { ContentPropertyTargetError, readContentPropertyTarget, replaceContentPropertyTarget,
    resolveContentPropertyTarget, validateContentPropertyTarget, type ContentPropertyTarget } from './content-property-target';

const heroPath = 'src/components/sections/hero.tsx';
// Actual Hero addressing and JSX shape; prose/assets are small portable fixtures.
const hero = `'use client';
import styles from './hero.module.css';
export function Hero() {
  return <header className={styles.hero} data-oid="h0kh8ch">
    {/* Keep the agency comment and computed classes. */}
    <div className={styles.foreground} data-oid="tt1s8e-">
      <h1 data-oid="m.lrkv0">Agency heading</h1>
      <a className={styles.button + ' glass'} href="https://auth.stilta.com" data-oid="ypkjrq8">
        <img src="/brand/mark.svg" alt="" width="20" height="20" data-oid="2nmso7j" />Log in
      </a>
    </div>
  </header>;
}
`;
const link: ContentPropertyTarget = { kind: 'component-literal-href', exportName: 'Hero', oid: 'ypkjrq8', field: 'href' };
const about = 'src/app/about/page.tsx', security = 'src/app/security/page.tsx', renderer = 'src/components/sections/page-hero.tsx';
const selection = { kind: 'mapped-callsite-enum' as const, oid: 'rpgk:yx', mappingId: 'prepared-about-hero', itemId: 'single' as const };
function mapped(): Record<string, string> {
    return {
        'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
        'src/content/about.ts': `export const aboutHero = { imageSrc: '/about.webp', imageAlt: 'About', imageWidth: 100, imageHeight: 80 } as const;`,
        'src/content/security.ts': `export const securityHero = { imageSrc: '/security.webp', imageAlt: 'Security', imageWidth: 100, imageHeight: 80 } as const;`,
        [about]: `import { PageHero } from '@/components/sections/page-hero';
import { aboutHero } from '@/content/about';
export default function AboutPage() { return <main data-oid="oetyso2">
  {/* Preserve the spread and this comment. */}
  <PageHero {...aboutHero} weblabContentMapping="prepared-about-hero" eyebrowEmphasis="tail" tone="light" data-oid="unkha:4" />
</main>; }`,
        [security]: `import { PageHero } from '@/components/sections/page-hero';
import { securityHero } from '@/content/security';
export default function SecurityPage() { return <main data-oid="vodpuu1"><PageHero {...securityHero} weblabContentMapping="prepared-security-hero" data-oid=":-v3_t3" /></main>; }`,
        [renderer]: `export function PageHero({ imageSrc, imageAlt, imageWidth, imageHeight, tone = 'dark', eyebrowEmphasis = 'lead', weblabContentMapping }) {
return <header className={tone === 'light' ? 'light' : 'dark'} data-nav-theme={tone} data-oid="fs:umh8">
  <img src={imageSrc} alt={imageAlt} width={imageWidth} height={imageHeight} data-weblab-content-map={weblabContentMapping} data-weblab-content-item="single" data-oid="rpgk:yx" />
</header>; }`,
    };
}
describe('imported approved literal property addressing', () => {
    test('reads a real-shaped shared Hero link and preserves every other byte', () => {
        const files = { [heroPath]: hero };
        expect(resolveContentPropertyTarget(files, { kind: link.kind, path: heroPath, exportName: 'Hero', oid: link.oid }))
            .toEqual({ path: heroPath, target: link, value: 'https://auth.stilta.com' });
        const value = 'https://auth.stilta.com/?a=one&b="two"';
        const next = replaceContentPropertyTarget(hero, link, 'https://auth.stilta.com', value);
        expect(next).toBe(hero.replace('"https://auth.stilta.com"', '"https://auth.stilta.com/?a=one&amp;b=&quot;two&quot;"'));
        expect(readContentPropertyTarget(next, link)).toBe(value);
        expect(replaceContentPropertyTarget(next, link, value, 'https://auth.stilta.com')).toBe(hero);
        expect(replaceContentPropertyTarget(hero, link, 'https://auth.stilta.com', 'https://auth.stilta.com')).toBe(hero);
    });
    test('requires exact prior literal and refuses malformed values', () => {
        expect(() => replaceContentPropertyTarget(hero, link, 'other', '/product')).toThrow('PREVIOUS_VALUE_MISMATCH');
        for (const value of ['\ud800', 'a\n', 'ä'.repeat(1_025)]) expect(() => replaceContentPropertyTarget(hero, link, 'https://auth.stilta.com', value)).toThrow('INVALID_VALUE');
    });
    test('refuses dynamic, absent, duplicate or unsafe native attributes', () => {
        for (const replacement of ['href={destination}', 'href={"https://auth.stilta.com"}', '',
            'href="/a" href="/b"', 'href="/a" {...props}', 'href="/a" onClick={go}', 'href="/a" ref={mutate}']) {
            expect(() => readContentPropertyTarget(hero.replace('href="https://auth.stilta.com"', replacement), link)).toThrow(ContentPropertyTargetError);
        }
    });
    test('refuses conditional/repeated/custom-component render paths and changed exports', () => {
        const anchor = '<a href="/a" data-oid="ypkjrq8">A</a>';
        for (const content of [`{ok && ${anchor}}`, `{items.map(item => ${anchor})}`, `<Wrapper>${anchor}</Wrapper>`, `<>${anchor}</>`]) {
            const source = `export function Hero(){return <main>${content}</main>;}`;
            expect(() => readContentPropertyTarget(source, link)).toThrow('UNSUPPORTED_TARGET');
        }
        for (const source of [hero.replace('function Hero()', 'function Hero(props)'), hero.replace('function Hero()', 'async function Hero()'), hero.replace('Hero()', 'Other()')])
            expect(() => readContentPropertyTarget(source, link)).toThrow(ContentPropertyTargetError);
    });
    test('requires unique static project identity, including unrelated modules', () => {
        for (const other of ['export const X = <a data-oid="ypkjrq8" />;', 'export const X = <a data-oid={"ypkjrq8"} />;'])
            expect(() => validateContentPropertyTarget({ [heroPath]: hero, 'src/other.tsx': other }, heroPath, link)).toThrow(ContentPropertyTargetError);
        expect(() => validateContentPropertyTarget({ [heroPath]: hero.replace('data-oid="ypkjrq8"', 'data-oid="ypkjrq8" {...props}') }, heroPath, link)).toThrow(ContentPropertyTargetError);
    });
    test('rejects unknown target fields and inventory/path bounds', () => {
        expect(() => readContentPropertyTarget(hero, { ...link, unsafe: true } as ContentPropertyTarget)).toThrow('INVALID_TARGET');
        expect(() => validateContentPropertyTarget({ [heroPath]: hero }, '../hero.tsx', link)).toThrow('INVALID_TARGET');
        expect(() => validateContentPropertyTarget({ [heroPath]: hero, 'src/large.ts': ' '.repeat(750_001) }, heroPath, link)).toThrow('INVALID_SOURCE');
    });
    test('rejects trailing-newline identifiers in targets and encoded source identities', () => {
        for (const changed of [{ ...link, oid: `${link.oid}\n` }, { ...link, exportName: `${link.exportName}\n` }])
            expect(() => readContentPropertyTarget(hero, changed)).toThrow('INVALID_TARGET');
        const changed = hero.replace('data-oid="ypkjrq8"', 'data-oid="ypkjrq8&#10;"');
        expect(() => validateContentPropertyTarget({ [heroPath]: changed }, heroPath, link)).toThrow('INVALID_TARGET');
        expect(() => validateContentPropertyTarget({ [heroPath]: changed }, heroPath, { ...link, oid: 'ypkjrq8\n' })).toThrow('INVALID_TARGET');
    });
    test('resolves the real About mapping, changes its explicit tone and preserves Security/image mapping', () => {
        const files = mapped(), before = { ...files }, found = resolveContentPropertyTarget(files, selection);
        expect(found.path).toBe(about);
        expect(found.target).toMatchObject({ kind: 'mapped-callsite-enum', exportName: 'AboutPage', oid: 'unkha:4', field: 'tone' });
        const imageBefore = resolveContentImageRenderMapping(files, selection);
        files[about] = replaceContentPropertyTarget(files[about]!, found.target, 'light', 'dark');
        expect(files[about]).toBe(before[about]!.replace('tone="light"', 'tone="dark"'));
        expect(validateContentPropertyTarget(files, about, found.target)).toBe('dark');
        expect(resolveContentImageRenderMapping(files, selection)).toEqual(imageBefore);
        for (const name of Object.keys(files).filter(name => name !== about)) expect(files[name]).toBe(before[name]);
        expect(replaceContentPropertyTarget(files[about]!, found.target, 'dark', 'light')).toBe(before[about]);
    });
    test('does not insert a missing/defaulted Security tone or accept another enum', () => {
        const files = mapped(), found = resolveContentPropertyTarget(files, selection);
        expect(() => resolveContentPropertyTarget(files, { ...selection, mappingId: 'prepared-security-hero' })).toThrow('UNSUPPORTED_TARGET');
        expect(() => replaceContentPropertyTarget(files[about]!, found.target, 'light', 'transparent')).toThrow('INVALID_VALUE');
    });
    test('inherits complete inventory, static prop and renderer-consumer refusals', () => {
        const mutations: Array<(files: Record<string, string>) => void> = [
            files => { delete files['src/content/security.ts']; },
            files => { files[about] = files[about]!.replace('tone="light"', 'tone={theme}'); },
            files => { files[about] = files[about]!.replace('data-oid="unkha:4"', 'tone="dark" data-oid="unkha:4"'); },
            files => { files[about] = files[about]!.replace('data-oid="unkha:4"', 'data-oid="unkha:4" {...aboutHero}'); },
            files => { files[security] = files[security]!.replace('prepared-security-hero', 'prepared-about-hero'); },
            files => { files['src/alias.tsx'] = `import { PageHero } from './components/sections/page-hero'; export const Alias = PageHero;`; },
            files => { files[renderer] = files[renderer]!.replace('src={imageSrc}', 'src="/hidden.webp"'); },
        ];
        for (const mutate of mutations) { const files = mapped(); mutate(files); expect(() => resolveContentPropertyTarget(files, selection)).toThrow(); }
    });
    test('will not let a copied mapping authorize a different owner or renderer', () => {
        const files = mapped(), found = resolveContentPropertyTarget(files, selection);
        if (found.target.kind !== 'mapped-callsite-enum') throw new Error('Missing enum fixture');
        expect(() => validateContentPropertyTarget(files, security, found.target)).toThrow('INVALID_TARGET');
        const forged = structuredClone(found.target); forged.renderMapping.renderer.exportName = 'OtherHero';
        expect(() => validateContentPropertyTarget(files, about, forged)).toThrow('INVALID_TARGET');
    });
});
