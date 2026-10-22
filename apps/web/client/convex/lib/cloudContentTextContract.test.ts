import { describe, expect, it } from 'bun:test';
import { readContentTextTarget, replaceContentTextTarget } from '@weblab/parser/src/code-edit/content-target';
import { CloudContentContractError } from './cloudContentContract';
import {
    createCloudTextContract,
    validateCloudTextCandidate,
    type CloudTextContract,
    type ContentTextBinding,
} from './cloudContentTextContract';

const heroPath = 'src/components/sections/hero.tsx';
const hero = `'use client';
import styles from './hero.module.css';
// Keep the designer's comment.
export function Hero() {
    return <section className={styles.hero} data-weblab-content="hero">
        <h1><span data-oid="line-one" className={styles.line}>Build with care</span>
            <span data-oid="line-two">For everyone</span></h1>
        <video src="/intro.mp4" autoPlay muted />
    </section>;
}
`;
const heroBinding: ContentTextBinding = {
    bindingId: 'hero.line-one',
    target: { kind: 'component-literal', exportName: 'Hero', oid: 'line-one' },
};
const faqPath = 'src/content/home-faq.ts';
const faq = `import type { ChatFaqItem } from '../components/chat-faq';
export const homeFaqItems: readonly ChatFaqItem[] = [
    { id: 'audience', question: 'Who is this for?', answer: 'Everyone.', enabled: true },
    { id: 'cost', question: 'What does it cost?', answer: 'Ask us.', enabled: false },
];
`;
const faqBinding: ContentTextBinding = {
    bindingId: 'faq.audience.answer',
    target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'answer' },
};

function rejects(run: () => unknown, code: CloudContentContractError['code']): void {
    expect(run).toThrow(CloudContentContractError);
    expect(run).toThrow(`CLOUD_CONTENT_${code}`);
}

function validateHero(candidateSource: string, originalSource = hero, contract = createCloudTextContract(heroPath, hero, [heroBinding])) {
    return validateCloudTextCandidate({ contract, originalSource, candidateSource });
}

function validateFaq(candidateSource: string, originalSource = faq, contract = createCloudTextContract(faqPath, faq, [faqBinding])) {
    return validateCloudTextCandidate({ contract, originalSource, candidateSource });
}

describe('cloud v2 text contracts', () => {
    it('pins renderer mappings without conflating question and answer leaf OIDs', () => {
        const mapping = { version: 1 as const, kind: 'keyed-prop-map' as const, mappingId: 'faq',
            callsite: { path: 'src/components/home-faq.tsx', exportName: 'HomeFaq', oid: 'call' },
            renderer: { path: 'src/components/chat-faq.tsx', exportName: 'ChatFaq', oid: 'answer' } };
        const answer: ContentTextBinding = { ...faqBinding, renderMapping: mapping };
        const question: ContentTextBinding = { bindingId: 'faq.audience.question',
            target: { kind: 'data-leaf', exportName: 'homeFaqItems', itemId: 'audience', property: 'question' },
            renderMapping: { ...mapping, renderer: { ...mapping.renderer, oid: 'question' } } };
        const contract = createCloudTextContract(faqPath, faq, [answer, question]);
        const changed = structuredClone(contract);
        changed.bindings[0]!.renderMapping!.renderer.oid = 'another';
        rejects(() => validateCloudTextCandidate({ contract: changed, originalSource: faq, candidateSource: faq }), 'STALE_CONTRACT');
        const conflicting = structuredClone(question);
        conflicting.renderMapping!.renderer.exportName = 'DifferentFaq';
        rejects(() => createCloudTextContract(faqPath, faq, [answer, conflicting]), 'INVALID_TARGET');
        rejects(() => createCloudTextContract(heroPath, hero, [{ ...heroBinding, renderMapping: mapping }]), 'INVALID_TARGET');
        const unknown = { ...answer, renderMapping: { ...mapping, extra: true } };
        rejects(() => createCloudTextContract(faqPath, faq, [unknown]), 'INVALID_TARGET');
        expect(validateCloudTextCandidate({ contract, originalSource: faq, candidateSource: faq.replace('Everyone.', 'Only this record.') }).source)
            .toBe(faq.replace("'Everyone.'", '"Only this record."'));
    });
    it('edits a named Hero leaf while preserving CSS expressions and every other byte', () => {
        const result = validateHero(hero.replace('Build with care', 'Build for people'));
        expect(result.operations).toEqual([{ bindingId: 'hero.line-one', previousValue: 'Build with care', value: 'Build for people' }]);
        expect(result.source).toBe(hero.replace('Build with care', '{"Build for people"}'));
        expect(result.source).toContain('className={styles.line}');
    });

    it('ignores candidate formatting and persists only reconstructed source', () => {
        const candidate = hero.replace('Build with care', 'Changed').replace('return <section', 'return    <section');
        expect(validateHero(candidate).source).toBe(hero.replace('Build with care', '{"Changed"}'));
        expect(validateHero(hero.replace('return <section', 'return    <section'))).toEqual({ source: hero, operations: [] });
    });

    it('edits a keyed record and preserves the type, keys, IDs, siblings and property order', () => {
        const result = validateFaq(faq.replace('Everyone.', 'Small teams.'));
        expect(result.operations).toEqual([{ bindingId: 'faq.audience.answer', previousValue: 'Everyone.', value: 'Small teams.' }]);
        expect(result.source).toBe(faq.replace("'Everyone.'", '"Small teams."'));
    });

    it('does not use repeated renderer OIDs to address data records', () => {
        const originalSource = `${faq}\nconst other = <><p data-oid="answer">Unrelated</p><p data-oid="answer">Another</p></>;`;
        const contract = createCloudTextContract('src/content/home-faq.tsx', originalSource, [faqBinding]);
        const result = validateCloudTextCandidate({ contract, originalSource, candidateSource: originalSource.replace('Everyone.', 'Only this item.') });
        expect(result.source).toContain('<p data-oid="answer">Unrelated</p><p data-oid="answer">Another</p>');
        expect(result.operations).toHaveLength(1);
    });

    it('round-trips special characters and multiline values for both target kinds', () => {
        const value = 'He said "hello" & <welcome> {team}\nNästa rad\t🙂';
        for (const [path, originalSource, binding] of [[heroPath, hero, heroBinding], [faqPath, faq, faqBinding]] as const) {
            const previous = readContentTextTarget(originalSource, binding.target);
            const candidateSource = replaceContentTextTarget(originalSource, binding.target, previous, value);
            const contract = createCloudTextContract(path, originalSource, [binding]);
            const result = validateCloudTextCandidate({ contract, originalSource, candidateSource });
            expect(readContentTextTarget(result.source, binding.target)).toBe(value);
            expect(result.operations[0]?.value).toBe(value);
        }
    });

    it('keeps the approval fingerprint stable across approved edits, including empty text', () => {
        const contract = createCloudTextContract(heroPath, hero, [heroBinding]);
        for (const value of ['Changed', '', 'x', 'Second\nline']) {
            const candidate = replaceContentTextTarget(hero, heroBinding.target, 'Build with care', value);
            const result = validateHero(candidate, hero, contract);
            expect(createCloudTextContract(heroPath, result.source, [heroBinding]).fingerprint).toBe(contract.fingerprint);
            expect(validateHero(result.source, result.source, contract).operations).toEqual([]);
        }
        expect(validateFaq(faq)).toEqual({ source: faq, operations: [] });
    });

    it('rejects changed attributes, metadata, imports, directives, comments and unapproved text', () => {
        for (const candidate of [
            hero.replace('styles.line', 'styles.hidden'),
            hero.replace('content="hero"', 'content="other"'),
            hero.replace('./hero.module.css', './evil.module.css'),
            hero.replace("'use client'", "'use server'"),
            hero.replace("designer's comment", 'changed comment'),
            hero.replace('For everyone', 'Unauthorized'),
            hero.replace('autoPlay muted', 'autoPlay'),
            hero.replace('data-oid="line-two"', 'data-oid="replacement"'),
            hero.replace('<h1>', '<h1 id="new">'),
        ]) rejects(() => validateHero(candidate.replace('Build with care', 'Allowed change')), 'UNAPPROVED_CHANGE');
    });

    it('rejects changed record IDs, sibling properties, order, count and type annotations', () => {
        for (const candidate of [
            faq.replace("id: 'cost'", "id: 'renamed'"),
            faq.replace('Who is this for?', 'Changed question'),
            faq.replace('Ask us.', 'Unauthorized'),
            faq.replace('enabled: true', 'enabled: false'),
            faq.replace('readonly ChatFaqItem[]', 'ChatFaqItem[]'),
            faq.replace("id: 'audience', question:", "question:").replace("answer: 'Everyone.'", "id: 'audience', answer: 'Everyone.'"),
            faq.replace("    { id: 'cost', question: 'What does it cost?', answer: 'Ask us.', enabled: false },\n", ''),
            faq.replace('../components/chat-faq', '../components/other'),
        ]) rejects(() => validateFaq(candidate), 'UNAPPROVED_CHANGE');
        rejects(() => validateFaq(faq.replace("id: 'audience'", "id: 'renamed'")), 'INVALID_TARGET');
    });

    it('rejects added comments inside an approved leaf', () => {
        rejects(() => validateHero(hero.replace('Build with care', '{/* keep */ "Changed"}')), 'INVALID_TARGET');
    });

    it('rejects stale structures even when a candidate attempts to restore the approved source', () => {
        rejects(() => validateHero(hero, hero.replace('styles.hero', 'styles.newHero')), 'STALE_CONTRACT');
        rejects(() => validateFaq(faq, faq.replace('enabled: true', 'enabled: false')), 'STALE_CONTRACT');
        rejects(() => validateHero(hero, hero, { ...createCloudTextContract(heroPath, hero, [heroBinding]), version: 1 } as unknown as CloudTextContract), 'STALE_CONTRACT');
    });

    it('binds fingerprints to the path, binding identity and exact target', () => {
        const contract = createCloudTextContract(heroPath, hero, [heroBinding]);
        rejects(() => validateHero(hero, hero, { ...contract, path: 'src/components/other.tsx' }), 'STALE_CONTRACT');
        rejects(() => validateHero(hero, hero, { ...contract, bindings: [{ ...heroBinding, bindingId: 'other' }] }), 'STALE_CONTRACT');
        rejects(() => createCloudTextContract(heroPath, hero, [{ ...heroBinding, target: { ...heroBinding.target, exportName: 'Missing' } }]), 'INVALID_TARGET');
    });

    it('rejects duplicate binding IDs, duplicate targets and unbounded approvals', () => {
        const second: ContentTextBinding = { bindingId: 'hero.line-two', target: { kind: 'component-literal', exportName: 'Hero', oid: 'line-two' } };
        for (const bindings of [[], [heroBinding, heroBinding], [heroBinding, { ...heroBinding, bindingId: 'other' }],
            [heroBinding, { ...second, bindingId: heroBinding.bindingId }], Array.from({ length: 101 }, () => heroBinding)]) {
            rejects(() => createCloudTextContract(heroPath, hero, bindings), 'INVALID_TARGET');
        }
        const contract = createCloudTextContract(heroPath, hero, [heroBinding, second]);
        expect(validateHero(hero.replace('Build with care', 'One').replace('For everyone', 'Two'), hero, contract).operations).toHaveLength(2);
    });

    it('rejects paths outside source modules and dependency, environment or configuration paths', () => {
        for (const path of ['/src/hero.tsx', 'components/hero.tsx', 'src/../hero.tsx', 'src//hero.tsx', 'src\\hero.tsx',
            'src/node_modules/hero.tsx', 'src/.env.ts', 'src/env.ts', 'src/config/hero.tsx', 'src/next.config.ts', 'src/hero.d.ts', 'src/hero.js']) {
            rejects(() => createCloudTextContract(path, hero, [heroBinding]), 'INVALID_TARGET');
        }
        expect(createCloudTextContract('app/components/hero.tsx', hero, [heroBinding]).version).toBe(2);
    });

    it('rejects invalid syntax, nonliteral changes, oversized text and UTF-8 source overflow', () => {
        rejects(() => validateHero('export function Hero('), 'INVALID_SOURCE');
        rejects(() => validateHero(hero.replace('Build with care', '{getText()}')), 'INVALID_TARGET');
        rejects(() => validateFaq(faq.replace("'Everyone.'", 'getText()')), 'INVALID_TARGET');
        rejects(() => validateHero(hero.replace('Build with care', 'x'.repeat(5_001))), 'INVALID_VALUE');
        rejects(() => validateFaq(faq.replace('Everyone.', '\\u0000')), 'INVALID_VALUE');
        rejects(() => validateHero(`${hero}\n/*${'å'.repeat(375_000)}*/`), 'INVALID_SOURCE');
    });
});
