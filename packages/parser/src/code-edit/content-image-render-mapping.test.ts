import { describe, expect, test } from 'bun:test';
import { ContentImageRenderMappingError, resolveContentImageRenderMapping } from './content-image-render-mapping';
import { ContentImageTargetError, replaceContentImageTarget } from './content-image-target';

const about = 'src/app/about/page.tsx', security = 'src/app/security/page.tsx';
const owner = 'src/content/about.ts', renderer = 'src/components/sections/page-hero.tsx';
const selection = { oid: 'rpgk:yx', mappingId: 'prepared-about-hero', itemId: 'single' };
// Inspected PageHero syntax and real source OIDs, generic prose; complete local fixture dependencies.
function fixture(): Record<string, string> {
    return {
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        [owner]: `import type { TeamMember } from '@/components/sections/team-grid';
export const aboutHero = { eyebrowLead: 'About', eyebrowTail: 'Team', heading: ['About us'],
  imageSrc: '/media/about/about-hero.webp', imageAlt: 'A team portrait', imageWidth: 2752, imageHeight: 1548 } as const;
export const teamMembers: TeamMember[] = [];`,
        'src/content/security.ts': `export const securityHero = { eyebrowLead: 'Security', eyebrowTail: 'Workspace',
heading: ['Secure work'], imageSrc: '/media/security-hero.webp', imageAlt: 'A secure workspace' } as const;`,
        [about]: `import { PageHero } from '@/components/sections/page-hero';
import { aboutHero, teamMembers } from '@/content/about';
import { TeamGrid } from '@/components/sections/team-grid';
export default function AboutPage() { return <main data-oid="oetyso2">
  <PageHero {...aboutHero} eyebrowEmphasis="tail" tone="light" weblabContentMapping="prepared-about-hero" data-oid="unkha:4" />
  <TeamGrid members={teamMembers} data-oid="b96arel" />
</main>; }`,
        [security]: `import { PageHero } from '@/components/sections/page-hero';
import { securityHero } from '@/content/security';
export default function SecurityPage() { return <main data-oid="vodpuu1">
<PageHero {...securityHero} imageWidth={2880} imageHeight={1160} weblabContentMapping="prepared-security-hero" data-oid=":-v3_t3" />
</main>; }`,
        [renderer]: `import { SectionTitleReveal } from '@/components/motion/section-title-reveal';
import { Eyebrow } from './section-heading';
import styles from './page-hero.module.css';
type PageHeroProps = { imageSrc: string; imageAlt: string; imageWidth: number; imageHeight: number; weblabContentMapping?: string; heading: readonly string[]; tone?: string; eyebrowLead: string; eyebrowTail: string; eyebrowEmphasis?: string };
export function PageHero({ eyebrowEmphasis = 'lead', eyebrowLead, eyebrowTail, heading, imageAlt, imageSrc,
 imageWidth, imageHeight, tone = 'dark', weblabContentMapping }: PageHeroProps) {
return <header className={tone === 'light' ? styles.light : styles.root} data-nav-theme={tone} data-oid="fs:umh8">
  <SectionTitleReveal className={styles.copy} data-oid="kbdgxze">
    <Eyebrow lead={eyebrowLead} tail={eyebrowTail} tone={tone} emphasis={eyebrowEmphasis} data-oid="83n72qc" />
    <h1 data-oid="wg85:6c">{heading.map((line, index) => <span key={line} data-oid="_7j6s.4">{index > 0 ? <><br data-oid=":htv:0r" />{' '}</> : null}{line}</span>)}</h1>
  </SectionTitleReveal>
  <img className={styles.media} src={imageSrc} alt={imageAlt} width={imageWidth} height={imageHeight} fetchPriority="high"
    data-weblab-content-map={weblabContentMapping} data-weblab-content-item="single" data-oid="rpgk:yx" />
</header>;
}`,
        'src/components/sections/team-grid.tsx': 'export type TeamMember = {name:string}; export function TeamGrid(){return null;}',
        'src/components/motion/section-title-reveal.tsx': 'export function SectionTitleReveal(){return null;}',
        'src/components/sections/section-heading.tsx': 'export function Eyebrow(){return null;}',
        'src/components/sections/page-hero.module.css': '.media { width: 100%; height: auto; }',
    };
}
function resolve(files = fixture(), input = selection) { return resolveContentImageRenderMapping(files, input); }
function changed(path: string, from: string, to: string): Record<string, string> {
    const files = fixture();
    expect(files[path]).toContain(from);
    files[path] = files[path]!.replace(from, to);
    return files;
}
function refuses(files: Record<string, string>, code?: ContentImageRenderMappingError['code'] | ContentImageTargetError['code']): void {
    let error: unknown;
    try { resolve(files); } catch (cause) { error = cause; }
    expect(error instanceof ContentImageRenderMappingError || error instanceof ContentImageTargetError).toBe(true);
    if (code) expect((error as ContentImageRenderMappingError | ContentImageTargetError).code).toBe(code);
}
describe('prepared object-prop native image mapping', () => {
    test('distinguishes About and Security owners through the same renderer OID', () => {
        const first = resolve(), second = resolve(fixture(), { ...selection, mappingId: 'prepared-security-hero' });
        expect(first.path).toBe(owner);
        expect(first.target).toEqual({ kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' });
        expect(first.value).toEqual({ src: '/media/about/about-hero.webp', alt: 'A team portrait' });
        expect(first.renderMapping).toEqual({ version: 1, kind: 'object-prop-image', mappingId: selection.mappingId,
            callsite: { path: about, exportName: 'AboutPage', oid: 'unkha:4' },
            renderer: { path: renderer, exportName: 'PageHero', oid: selection.oid } });
        expect(second.path).toBe('src/content/security.ts');
        expect(second.target.exportName).toBe('securityHero');
        expect(second.renderMapping.callsite).toEqual({ path: security, exportName: 'SecurityPage', oid: ':-v3_t3' });
        expect(first.dependencies).toEqual([...first.dependencies].sort());
        for (const path of [about, security, owner, renderer, 'src/content/security.ts', 'src/components/sections/page-hero.module.css', 'tsconfig.json'])
            expect(first.dependencies).toContain(path);
    });
    test('changes only owner literals and resolves the same identity after replacement', () => {
        const files = fixture(), before = { ...files }, found = resolve(files);
        const value = { src: '/weblab-upload-example.webp', alt: 'New team photo' };
        files[owner] = replaceContentImageTarget(files[owner]!, found.target, found.value, value);
        expect(resolve(files)).toEqual({ ...found, value });
        for (const path of Object.keys(files).filter(path => path !== owner)) expect(files[path]).toBe(before[path]);
        expect(files[owner]).toBe(before[owner]!.replace("'/media/about/about-hero.webp'", JSON.stringify(value.src))
            .replace("'A team portrait'", JSON.stringify(value.alt)));
    });
    test('accepts type-only consumers and unrelated named exports, ignores prepared public scripts', () => {
        const files = fixture();
        files['src/types.ts'] = `import type { TeamMember } from './components/sections/team-grid'; export type Person = TeamMember;`;
        files['public/weblab-preload-script.js'] = 'require("bundled"); eval("bundled");';
        files['next-env.d.ts'] = 'import "./.next/types/routes.d.ts";';
        expect(resolve(files).path).toBe(owner);
    });
    test('scans public modules and refuses imports into excluded executable files', () => {
        const publicConsumer = fixture();
        publicConsumer['public/extra.ts'] = `import { aboutHero } from '../src/content/about'; console.log(aboutHero);`;
        publicConsumer['src/extra.ts'] = `import '../public/extra';`;
        refuses(publicConsumer, 'UNSUPPORTED_CONSUMER');
        // Public application modules also count when no scanned source imports them.
        delete publicConsumer['src/extra.ts'];
        refuses(publicConsumer, 'UNSUPPORTED_CONSUMER');
        for (const target of ['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js', 'src/hidden.d.ts']) {
            const files = fixture();
            files[target] = `import { aboutHero } from '@/content/about'; console.log(aboutHero);`;
            files['src/extra.ts'] = `import '../${target}';`;
            refuses(files, 'UNSUPPORTED_CONSUMER');
        }
        const malformed = fixture(); malformed['public/extra.ts'] = 'export const =';
        refuses(malformed, 'INVALID_SOURCE');
    });
    test('refuses missing, malformed and duplicate mapping/renderer identity', () => {
        for (const input of [{ ...selection, oid: 'rpgk:yx\n' }, { ...selection, mappingId: selection.mappingId + '\n' },
            { ...selection, itemId: 'single\n' }, { ...selection, itemId: '0' }, { ...selection, mappingId: 'unknown' },
            { ...selection, oid: 'unknown' }]) expect(() => resolve(fixture(), input)).toThrow(ContentImageRenderMappingError);
        refuses(changed(security, 'prepared-security-hero', selection.mappingId), 'AMBIGUOUS_MAPPING');
        refuses(changed(renderer, 'data-weblab-content-item="single"', 'data-weblab-content-item="other"'));
        refuses(changed(renderer, 'data-weblab-content-map={weblabContentMapping}', 'data-weblab-content-map="prepared-about-hero"'));
        refuses(changed(about, 'data-oid="b96arel"', 'data-oid="rpgk:yx"'), 'DUPLICATE_OID');
    });
    test('refuses src/alt overrides, second spreads, dynamic mapping and nonnative renderers', () => {
        for (const extra of ['src="/x.webp"', 'imageSrc="/x.webp"', 'imageAlt="other"', '{...aboutHero}', 'weblabContentMapping="other"'])
            refuses(changed(about, 'tone="light"', `tone="light" ${extra}`));
        refuses(changed(about, '{...aboutHero}', '{...{...aboutHero}}'));
        refuses(changed(about, 'weblabContentMapping="prepared-about-hero"', 'weblabContentMapping={"prepared-about-hero"}'));
        refuses(changed(renderer, '<img className=', '<Image className='));
        refuses(changed(renderer, '<img className=', '<img {...other} className='));
        refuses(changed(renderer, 'src={imageSrc}', 'srcSet={imageSrc} src={imageSrc}'));
        refuses(changed(renderer, 'alt={imageAlt}', 'alt={`${imageAlt}!`}'));
    });
    test('refuses lexical aliases, mutation, transformed props and hidden consumers', () => {
        refuses(changed(about, 'PageHero }', 'PageHero as Other }'));
        refuses(changed(about, 'aboutHero, teamMembers', 'aboutHero as copy, teamMembers'));
        refuses(changed(about, '{...aboutHero}', '{...aboutHero.image}'));
        refuses(changed(renderer, 'imageAlt, imageSrc,', 'imageAlt, imageSrc: renamed,'));
        refuses(changed(renderer, 'return <header', 'imageSrc = "/other.webp"; return <header'));
        refuses(changed(renderer, '<img className=', '<div>{imageSrc}</div><img className='));
        const files = fixture(); files[owner] += '\nconst alias = aboutHero;'; refuses(files);
        for (const extra of [
            `import { aboutHero } from './content/about'; console.log(aboutHero);`,
            `import * as all from './content/about'; console.log(all.aboutHero);`,
            `import { PageHero } from './components/sections/page-hero'; export const Other = PageHero;`,
            `export { aboutHero } from './content/about';`,
            `const data = import('./content/about');`,
            `const data = require('./content/about');`,
        ]) { const files = fixture(); files['src/extra.ts'] = extra; refuses(files); }
    });
    test('refuses additional object mounts, unprepared sibling consumers and route imports', () => {
        refuses(changed(security, 'weblabContentMapping="prepared-security-hero"', ''));
        const extra = fixture();
        extra['src/app/extra/page.tsx'] = `import { PageHero } from '@/components/sections/page-hero'; import { aboutHero } from '@/content/about';
export default function OtherPage() { return <main data-oid="other-root"><PageHero {...aboutHero} weblabContentMapping="other-map" data-oid="other-mount" /></main>; }`;
        refuses(extra, 'UNSUPPORTED_CONSUMER');
        const route = fixture(); route['src/app/extra/page.tsx'] = `import AboutPage from '../about/page'; export default function Other(){return <AboutPage />}`;
        refuses(route, 'UNSUPPORTED_CONSUMER');
        const conditional = changed(about, '<PageHero {...aboutHero}', '{true && <PageHero {...aboutHero}');
        conditional[about] = conditional[about]!.replace('data-oid="unkha:4" />', 'data-oid="unkha:4" />}');
        refuses(conditional, 'UNSUPPORTED_MAPPING');
    });
    test('refuses incomplete, ambiguous and malformed inventories', () => {
        const missing = fixture(); delete missing['src/components/sections/section-heading.tsx']; refuses(missing, 'INCOMPLETE_INVENTORY');
        const ambiguous = fixture(); ambiguous['src/content/about.tsx'] = 'export {};'; refuses(ambiguous, 'AMBIGUOUS_IMPORT');
        const bad = fixture(); bad['src/unrelated.ts'] = 'export const ='; refuses(bad, 'INVALID_SOURCE');
        const alias = fixture(); alias['tsconfig.json'] = JSON.stringify({ compilerOptions: { paths: { '@/*': ['./other/*'] } } }); refuses(alias, 'AMBIGUOUS_IMPORT');
    });
});
