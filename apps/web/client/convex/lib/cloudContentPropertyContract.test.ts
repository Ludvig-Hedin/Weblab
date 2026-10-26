import { describe, expect, test } from 'bun:test';
import { replaceContentPropertyTarget, resolveContentPropertyTarget, type ContentPropertyTarget } from '@weblab/parser/src/code-edit/content-property-target';
import { createCloudTextContract, validateCloudTextCandidate } from './cloudContentTextContract';
import { createCloudPropertyContract, validateCloudPropertyCandidate, MAX_PROPERTY_CONTRACT_BYTES,
    type ContentPropertyBinding, type CloudPropertyContract } from './cloudContentPropertyContract';

const path = 'src/components/sections/hero.tsx';
const source = `'use client';
// Agency source stays exact.
export function Hero(){return <header className={styles.root} data-oid="header">
<h1 data-oid="heading">Agency heading</h1>
<a className={styles.button} href="https://auth.stilta.com" data-oid="ypkjrq8"><img src="/mark.svg" alt="" data-oid="mark"/>Log in</a>
</header>;}`;
const target: ContentPropertyTarget = { kind: 'component-literal-href', exportName: 'Hero', oid: 'ypkjrq8', field: 'href' };
function binding(): ContentPropertyBinding {
    return { bindingId: 'login.href', label: 'Link destination', target, options: [
        { id: 'current', label: 'Current login', value: 'https://auth.stilta.com' },
        { id: 'alternate', label: 'Login with slash', value: 'https://auth.stilta.com/' },
    ] };
}
function fixture() {
    const files = { [path]: source }, contract = createCloudPropertyContract(path, files, [binding()]);
    const candidateSource = replaceContentPropertyTarget(source, target, 'https://auth.stilta.com', 'https://auth.stilta.com/');
    return { contract, files, bindingId: 'login.href', previousValue: 'https://auth.stilta.com', choiceId: 'alternate', candidateSource };
}
describe('imported property definition and exact source contract', () => {
    test('retains a bounded immutable-by-copy definition and reconstructs only the approved literal', () => {
        const supplied = binding(), contract = createCloudPropertyContract(path, { [path]: source }, [supplied]);
        supplied.options[0]!.label = 'Changed after approval';
        expect(contract.bindings[0]!.options[0]!.label).toBe('Current login');
        expect(contract.definitionHash).toMatch(/^[a-f0-9]{64}$/);
        expect(Buffer.byteLength(JSON.stringify(contract))).toBeLessThan(MAX_PROPERTY_CONTRACT_BYTES);
        const input = fixture(), result = validateCloudPropertyCandidate(input);
        expect(result.source).toBe(source.replace('href="https://auth.stilta.com"', 'href="https://auth.stilta.com/"'));
        expect(result.value).toBe('https://auth.stilta.com/');
        expect(result.definitionHash).toBe(input.contract.definitionHash);
    });
    test('refuses unapproved choices, changed definitions and incorrect previous values', () => {
        expect(() => validateCloudPropertyCandidate({ ...fixture(), choiceId: 'missing' })).toThrow('INVALID_VALUE');
        expect(() => validateCloudPropertyCandidate({ ...fixture(), bindingId: 'other' })).toThrow('INVALID_VALUE');
        expect(() => validateCloudPropertyCandidate({ ...fixture(), previousValue: 'other' })).toThrow('PREVIOUS_VALUE_MISMATCH');
        const input = fixture(); input.contract.bindings[0]!.label = 'Tampered label';
        expect(() => validateCloudPropertyCandidate(input)).toThrow('STALE_DEFINITION');
        const badHash = fixture(); badHash.contract.definitionHash += '\n';
        expect(() => validateCloudPropertyCandidate(badHash)).toThrow('STALE_DEFINITION');
    });
    test('rejects extra edits, formatting and stale whole-file candidates', () => {
        for (const candidateSource of [fixture().candidateSource + '\n', fixture().candidateSource.replace('Agency heading', 'Injected'),
            fixture().candidateSource.replace('className={styles.button}', 'onClick={run}')])
            expect(() => validateCloudPropertyCandidate({ ...fixture(), candidateSource })).toThrow('UNAPPROVED_CHANGE');
        const input = fixture(); input.files[path] = source.replace('Agency heading', 'Later text');
        expect(() => validateCloudPropertyCandidate(input)).toThrow('UNAPPROVED_CHANGE');
        input.candidateSource = replaceContentPropertyTarget(input.files[path]!, target, input.previousValue, 'https://auth.stilta.com/');
        expect(validateCloudPropertyCandidate(input).source).toContain('Later text');
    });
    test('keeps permission hash stable through allowed source values and unrelated text', () => {
        const input = fixture(), changed = validateCloudPropertyCandidate(input).source;
        expect(createCloudPropertyContract(path, { [path]: changed }, input.contract.bindings).definitionHash).toBe(input.contract.definitionHash);
        expect(createCloudPropertyContract(path, { [path]: changed.replace('Agency heading', 'Later text') }, input.contract.bindings).definitionHash).toBe(input.contract.definitionHash);
        const inverse = validateCloudPropertyCandidate({ ...input, files: { [path]: changed }, previousValue: 'https://auth.stilta.com/', choiceId: 'current', candidateSource: source });
        expect(inverse.source).toBe(source);
    });
    test('allows Node to refresh the same text definition over the one checked property edit', () => {
        const textBindings = [{ bindingId: 'title', target: { kind: 'component-literal' as const, exportName: 'Hero', oid: 'heading' } }];
        const old = createCloudTextContract(path, source, textBindings), changed = validateCloudPropertyCandidate(fixture()).source;
        const refreshed = createCloudTextContract(path, changed, old.bindings);
        expect(refreshed.bindings).toEqual(old.bindings);
        expect(refreshed.fingerprint).not.toBe(old.fingerprint);
        expect(validateCloudTextCandidate({ contract: refreshed, originalSource: changed, candidateSource: changed.replace('Agency heading', 'Customer heading') }).source)
            .toContain('Customer heading');
    });
    test('requires the current value to remain approved and rejects duplicates', () => {
        const removed = binding(); removed.options = [removed.options[1]!];
        expect(() => createCloudPropertyContract(path, { [path]: source }, [removed])).toThrow('INVALID_VALUE');
        for (const duplicate of [{ ...binding(), bindingId: 'second' }, binding()])
            expect(() => createCloudPropertyContract(path, { [path]: source }, [binding(), duplicate])).toThrow('INVALID_DEFINITION');
        for (const property of ['id', 'value'] as const) {
            const input = binding(); input.options[1]![property] = input.options[0]![property];
            expect(() => createCloudPropertyContract(path, { [path]: source }, [input])).toThrow('INVALID_DEFINITION');
        }
    });
    test('preserves the existing URL policy without opening script/protocol-relative destinations', () => {
        for (const value of ['javascript:alert(1)', 'data:text/html,a', '//evil.test', 'https://user:pass@example.com', '/bad\\path', '/%0aheader']) {
            const input = binding(); input.options[1]!.value = value;
            expect(() => createCloudPropertyContract(path, { [path]: source }, [input])).toThrow('INVALID_VALUE');
        }
        for (const value of ['/product', '#details', 'mailto:team@example.com', 'tel:+4612345', 'https://example.com/path?a=1&b=2']) {
            const input = binding(); input.options[1]!.value = value;
            expect(createCloudPropertyContract(path, { [path]: source }, [input]).bindings[0]!.options[1]!.value).toBe(value);
        }
    });
    test('bounds UTF-8 labels, option IDs/values, option counts and the total serialized definition', () => {
        const bad: ContentPropertyBinding[] = [];
        let input = binding(); input.label = 'ä'.repeat(41); bad.push(input);
        input = binding(); input.options[1]!.label = 'ä'.repeat(41); bad.push(input);
        input = binding(); input.options[1]!.id = 'a'.repeat(81); bad.push(input);
        input = binding(); input.options[1]!.value = '/' + 'ä'.repeat(1_024); bad.push(input);
        input = binding(); input.options[1]!.label = '\ud800'; bad.push(input);
        input = binding(); input.options = Array.from({ length: 21 }, (_, i) => ({ id: `id${i}`, label: 'Link', value: `/route-${i}` })); bad.push(input);
        for (const entry of bad) expect(() => createCloudPropertyContract(path, { [path]: source }, [entry])).toThrow('INVALID_DEFINITION');
        const huge = Array.from({ length: 100 }, (_, i) => ({ ...binding(), bindingId: `binding${i}`, options: [
            { id: 'current', label: 'Current', value: 'https://auth.stilta.com' },
            ...Array.from({ length: 19 }, (_, j) => ({ id: `choice${j}`, label: 'A'.repeat(80), value: '/' + String(j) + 'a'.repeat(1_990) })),
        ] }));
        expect(() => createCloudPropertyContract(path, { [path]: source }, huge)).toThrow('INVALID_DEFINITION');
    });
    test('refuses unknown schema fields and unsupported generic properties', () => {
        const extended = { ...binding(), allValues: true };
        expect(() => createCloudPropertyContract(path, { [path]: source }, [extended])).toThrow('INVALID_DEFINITION');
        const input = fixture();
        expect(() => validateCloudPropertyCandidate({ ...input, contract: { ...input.contract, arbitrary: true } as CloudPropertyContract })).toThrow('STALE_DEFINITION');
        const other = binding(); other.target = { ...target, field: 'style' } as unknown as ContentPropertyTarget;
        expect(() => createCloudPropertyContract(path, { [path]: source }, [other])).toThrow('INVALID_TARGET');
    });
    test('the agency chooses the subset of real hero tones; a compiler enum is not permission', () => {
        const owner = 'src/app/about/page.tsx';
        const files: Record<string, string> = {
            'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
            'src/content/about.ts': `export const aboutHero = {imageSrc:'/about.webp',imageAlt:'About',imageWidth:100,imageHeight:80};`,
            [owner]: `import { PageHero } from '@/components/page-hero'; import { aboutHero } from '@/content/about';
export default function AboutPage(){return <main data-oid="main"><PageHero {...aboutHero} tone="light" weblabContentMapping="prepared-about-hero" data-oid="unkha:4" /></main>;}`,
            'src/components/page-hero.tsx': `export function PageHero({imageSrc,imageAlt,imageWidth,imageHeight,tone='dark',weblabContentMapping}) {
return <header data-nav-theme={tone} data-oid="header"><img src={imageSrc} alt={imageAlt} width={imageWidth} height={imageHeight} data-weblab-content-map={weblabContentMapping} data-weblab-content-item="single" data-oid="rpgk:yx" /></header>;}`,
        };
        const found = resolveContentPropertyTarget(files, { kind: 'mapped-callsite-enum', oid: 'rpgk:yx', mappingId: 'prepared-about-hero', itemId: 'single' });
        const single: ContentPropertyBinding = { bindingId: 'hero.tone', label: 'Hero appearance', target: found.target,
            options: [{ id: 'light', label: 'Light', value: 'light' }] };
        const request = { files, bindingId: single.bindingId, previousValue: 'light', choiceId: 'dark',
            candidateSource: replaceContentPropertyTarget(files[owner]!, found.target, 'light', 'dark') };
        const restricted = createCloudPropertyContract(owner, files, [single]);
        expect(() => validateCloudPropertyCandidate({ ...request, contract: restricted })).toThrow('INVALID_VALUE');
        single.options.push({ id: 'dark', label: 'Dark', value: 'dark' });
        const approved = createCloudPropertyContract(owner, files, [single]);
        expect(approved.definitionHash).not.toBe(restricted.definitionHash);
        expect(validateCloudPropertyCandidate({ ...request, contract: approved }).source).toBe(request.candidateSource);
        single.options.push({ id: 'custom', label: 'Custom', value: 'custom' });
        expect(() => createCloudPropertyContract(owner, files, [single])).toThrow('INVALID_VALUE');
    });
});
