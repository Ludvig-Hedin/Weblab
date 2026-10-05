import { describe, expect, it } from 'bun:test';
import { convexToJson } from 'convex/values';
import { addOidsToAst } from '../../../../../packages/parser/src/ids';
import { getAstFromContent, getContentFromAst } from '../../../../../packages/parser/src/parse';
import { t } from '../../../../../packages/parser/src/packages';
import { formatContent } from '../../../../../packages/parser/src/prettier';
import { updateNodeTextContent } from '../../../../../packages/parser/src/code-edit/text';
import {
    approveCloudContentBindings, CloudContentContractError, validateCloudContentCandidate,
    type CloudContentBinding,
} from './cloudContentContract';

const source = `"use client";
import { Fragment } from 'react';
// Keep the builder's comment.
export default function Page() {
  return <main>
    <h1 data-oid="title" className="text-left">Hello</h1>
    <p data-oid="description">{"Literal text"}</p>
    <img data-oid="photo" src="/images/one.png" alt="First photo" />
    <a data-oid="link" href="/about">About</a>
  </main>;
}`;
const bindings: CloudContentBinding[] = [
    { oid: 'title', fields: ['text', 'className'], choices: { left: 'text-left', center: 'text-center' } },
    { oid: 'description', fields: ['text'] },
    { oid: 'photo', fields: ['src', 'alt'], allowedValues: { src: ['/images/one.png', '/images/two.png'] } },
    { oid: 'link', fields: ['href'], allowedValues: { href: ['/about', 'https://example.com/work', '/work#hello', '../about', '#contact', '?view=work', 'mailto:hello@example.com', 'tel:+46812345'] } },
];
const approvedAssetPaths = ['/images/one.png', '/images/two.png'];
const approve = (original = source, selected = bindings, path = 'app/page.tsx') =>
    approveCloudContentBindings({ path, source: original, bindings: selected, approvedAssetPaths });
const validate = (candidateSource: string, originalSource = source, contract = approve()) =>
    validateCloudContentCandidate({ contract, originalSource, candidateSource, approvedAssetPaths });

function rejects(run: () => unknown, code?: CloudContentContractError['code']) {
    try { run(); } catch (error) {
        expect(error).toBeInstanceOf(CloudContentContractError);
        if (code) expect((error as CloudContentContractError).code).toBe(code);
        return;
    }
    throw new Error('Expected content validation to reject the edit');
}

describe('cloud customer content contract', () => {
    it('accepts literal text, an approved owned image, alt text, an approved safe link, and an exact named choice together', () => {
        const candidate = source.replace('>Hello<', '>Welcome<')
            .replace('text-left', 'text-center').replace('/images/one.png', '/images/two.png')
            .replace('First photo', 'Second photo').replace('href="/about"', 'href="https://example.com/work"');
        const result = validate(candidate);
        expect(result.source).toBe(candidate);
        expect(result.operations).toHaveLength(5);
        expect(result.operations).toContainEqual({ oid: 'title', field: 'className', previousValue: 'text-left', value: 'text-center', choice: 'center' });
        // A successful customer edit must not invalidate all of the other approvals.
        expect(approve(candidate).fingerprint).toBe(approve().fingerprint);
        expect(validate(candidate.replace('Welcome', 'Welcome again'), candidate).operations).toHaveLength(1);
    });

    it('accepts the real inline writer literal-to-text and newline forms', () => {
        const identifiedBreak = source.replace('>Hello<', '>First<br data-oid="o.i8gu8" />Second<');
        expect(validate(identifiedBreak).operations[0]?.value).toBe('First\nSecond');
        // createOid uses the full data-attribute alphabet, including colons.
        expect(validate(identifiedBreak.replace('o.i8gu8', ':8y0i0p')).operations[0]?.value).toBe('First\nSecond');
        const candidate = source.replace('{"Literal text"}', 'Updated<br />again');
        expect(validate(candidate).operations).toContainEqual({ oid: 'description', field: 'text', previousValue: 'Literal text', value: 'Updated\nagain' });
        const escaped = source.replace('>Hello<', '>{"<script>alert(1)</script>"}<');
        expect(validate(escaped).operations[0]?.value).toBe('<script>alert(1)</script>');
    });

    it('accepts multiline edits after the editor adds line-break IDs and formats the page', async () => {
        const processJsx = async (content: string) => {
            const ast = getAstFromContent(content);
            if (!ast) throw new Error('Invalid test source');
            addOidsToAst(ast);
            return formatContent('app/page.tsx', await getContentFromAst(ast, content));
        };
        const original = await processJsx('export default function Page() { return <p data-oid="title">Before</p>; }');
        const contract = approve(original, [{ oid: 'title', fields: ['text'] }]);
        const edited = getAstFromContent(original)!;
        const text = 'A long first line that the actual project formatter will wrap across multiple source lines while keeping its rendered words intact.\nA second line.';
        t.traverseFast(edited, (node) => {
            if (t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name, { name: 'p' })) updateNodeTextContent(node, text);
        });
        const candidate = await processJsx(await getContentFromAst(edited, original));
        expect(candidate).toMatch(/<br data-oid="[A-Za-z0-9_.:-]+"\s*\/>/);
        expect(validate(candidate, original, contract)).toEqual({ source: candidate,
            operations: [{ oid: 'title', field: 'text', previousValue: 'Before', value: text }],
        });
        expect(approve(candidate, contract.bindings).fingerprint).toBe(contract.fingerprint);
    });

    it('keeps line-break attributes, comments, duplicate IDs and unapproved whitespace outside the text exception', () => {
        for (const lineBreak of [
            '<br data-oid="title" />', '<br data-oid="valid" title="extra" />',
            '<br data-oid="invalid value" />', '<br data-oid={"expression"} />',
            '<br data-oid="first" data-oid="second" />', '<br {...props} />',
            '<br data-oid="valid" /* injected */ />',
        ]) rejects(() => validate(source.replace('>Hello<', `>Hello${lineBreak}again<`)));
        rejects(() => validate(source.replace('>About</a>', '> About</a>')), 'UNAPPROVED_CHANGE');
    });

    it('accepts only compiler-empty separator formatting and keeps the existing fingerprint format', () => {
        const original = `export default function Page() {
  return <main data-oid="root">
    <img data-oid="photo" src="/images/one.png" alt="Photo" />
    <h1 data-oid="title">First<br data-oid="o.i8gu8" />Second</h1>
    <a data-oid="link" href="/about">About</a>
  </main>;
}`;
        const selected: CloudContentBinding[] = [{ oid: 'title', fields: ['text'] }];
        const contract = approve(original, selected);
        const candidate = original.replace('/>\n    <h1', '/>\n\n    <h1')
            .replace('o.i8gu8', 'wjyq.0v').replace('Second</h1>', 'Changed</h1>');
        expect(validate(candidate, original, contract).operations).toEqual([
            { oid: 'title', field: 'text', previousValue: 'First\nSecond', value: 'First\nChanged' },
        ]);
        const nextContract = approve(candidate, selected);
        // Hashes deliberately still distinguish source representations. This
        // also admits contracts generated before comparison normalization.
        expect(nextContract.fingerprint).not.toBe(contract.fingerprint);
        const second = candidate.replace('Changed</h1>', 'Again</h1>');
        expect(validate(second, candidate, nextContract).operations[0]?.value).toBe('First\nAgain');
        rejects(() => validate(second, candidate, contract), 'STALE_CONTRACT');
        expect(validate(original, second, approve(second, selected)).operations[0]?.value).toBe('First\nSecond');

        for (const separator of [' ', '  ', '\n visible\n', '\n\u00a0\n', '\n{/* new comment */}\n']) {
            rejects(() => validate(original.replace('/>\n    <h1', `/>${separator}<h1`), original, contract));
        }
        expect(validate(original.replace('/>\n    <h1', '/><h1'), original, contract).operations).toEqual([]);
        rejects(() => validate(candidate.replace('alt="Photo"', 'alt="Changed"'), original, contract), 'UNAPPROVED_CHANGE');
        rejects(() => validate(candidate.replace('>About</a>', '>Changed</a>'), original, contract), 'UNAPPROVED_CHANGE');
        const spaced = original.replace('/>\n    <h1', '/> <h1');
        rejects(() => validate(original, spaced, approve(spaced, selected)), 'UNAPPROVED_CHANGE');
    });

    it('accepts a canvas heading edit when the formatter wraps untouched text and adds empty JSX separators', async () => {
        const original = `export default function Page() {
  return <main data-oid="root"><h1 data-oid="title">{"Before"}</h1><p data-oid="description">{"We help independent businesses find their voice and bring it to life, from the first conversation to the finished website."}</p><a data-oid="link" href="/about" className="mt-8 inline-flex border-b border-foreground pb-1 text-base font-medium">Let’s talk about your project</a><p data-oid="body">Clear identities and useful websites. Each project starts with the people who will use it.</p><div data-oid="slot"></div></main>;
}`;
        const selected: CloudContentBinding[] = [{ oid: 'title', fields: ['text'] }];
        const contract = approve(original, selected);
        const edited = getAstFromContent(original)!;
        t.traverseFast(edited, (node) => {
            if (t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name, { name: 'h1' })) {
                updateNodeTextContent(node, 'Built together, ready for tomorrow.');
            }
        });
        const candidate = await formatContent('app/page.tsx', await getContentFromAst(edited, original));
        expect(candidate).not.toBe(original);
        expect(candidate).toMatch(/\n[ \t]+Let’s talk about your project\n/);
        expect(validate(candidate, original, contract)).toEqual({ source: candidate, operations: [
            { oid: 'title', field: 'text', previousValue: 'Before', value: 'Built together, ready for tomorrow.' },
        ] });
        const nextContract = approve(candidate, selected);
        expect(nextContract.fingerprint).not.toBe(contract.fingerprint);
        const second = candidate.replace('Built together, ready for tomorrow.', 'Ready for another edit.');
        expect(validate(second, candidate, nextContract).operations[0]?.value).toBe('Ready for another edit.');
        rejects(() => validate(second, candidate, contract), 'STALE_CONTRACT');

        for (const replacement of [' Let’s talk about your project', 'Let’s talk about your project ', 'Let’s  talk about your project', 'Let’s talk about another project', 'Let’s\u00a0talk about your project']) {
            rejects(() => validate(original.replace('Let’s talk about your project', replacement), original, contract), 'UNAPPROVED_CHANGE');
        }
        rejects(() => validate(candidate.replace('href="/about"', 'href="/elsewhere"'), original, contract), 'UNAPPROVED_CHANGE');
        rejects(() => validate(candidate.replace('Let’s talk about your project', '{/* added comment */}Let’s talk about your project'), original, contract), 'UNAPPROVED_CHANGE');
        rejects(() => validate(candidate.replace('voice and bring', 'voice and change'), original, contract), 'UNAPPROVED_CHANGE');
    });

    it('allows a formatting-only candidate without changing the bytes returned for persistence', () => {
        const candidate = source.replace("from 'react'", 'from "react"').replace('function Page()', 'function  Page()');
        expect(validate(candidate)).toEqual({ source: candidate, operations: [] });
    });

    it('rejects executable code, imports, directives, comments and unapproved attributes even alongside a valid text edit', () => {
        for (const candidate of [
            source.replace('<main>', '<main><script>alert(1)</script>'),
            source.replace("from 'react'", "from 'hostile-package'"),
            source.replace('"use client"', '"use server"'),
            source.replace("builder's comment", 'customer comment'),
            source.replace('<main>', '<main title="changed">'),
            source.replace('return <main>', 'globalThis.fetch("https://attacker.test"); return <main>'),
            source.replace('>Hello<', '>{process.env.SECRET}<'),
            source.replace('data-oid="title"', 'data-oid="title" onClick="alert(1)"'),
        ]) rejects(() => validate(candidate.replace('First photo', 'A valid new alt')));
    });

    it('rejects comments or styled markup disguised as a text value', () => {
        for (const replacement of ['<strong>Hello</strong>', '{/* injected */}Hello', '{"Hello" /* injected */}', 'Hello<br title="new" />']) {
            rejects(() => validate(source.replace('>Hello<', `>${replacement}<`)));
        }
    });

    it('rejects duplicate IDs anywhere in the page and duplicate ID attributes', () => {
        rejects(() => approve(source.replace('<main>', '<main data-oid="title">')), 'INVALID_TARGET');
        rejects(() => validate(source.replace('<main>', '<main><p data-oid="title">Duplicate</p>')), 'INVALID_TARGET');
        rejects(() => approve(source.replace('data-oid="title"', 'data-oid="title" data-oid="another"')), 'INVALID_TARGET');
    });

    it('rejects repeated, indirect and executable ancestor contexts', () => {
        const target = '<p data-oid="title">Hello</p>';
        const selected: CloudContentBinding[] = [{ oid: 'title', fields: ['text'] }];
        for (const original of [
            `export default function Page() { return <main>{items.map(() => ${target})}</main>; }`,
            `export default function Page() { function Card() { return ${target}; } return <main><Card /><Card /></main>; }`,
            `function Card() { return ${target}; } export default function Page() { return <main><Card /><Card /></main>; }`,
            `export default function Page() { return <Wrapper>${target}</Wrapper>; }`,
            `export default function Page() { return <main><Wrapper>${target}</Wrapper></main>; }`,
            `export default function Page() { return <script>${target}</script>; }`,
            `export default function Page() { return <style>${target}</style>; }`,
            `export default function Page() { return <main onClick={() => alert('clicked')}>${target}</main>; }`,
            `export default function Page() { return <main {...props}>${target}</main>; }`,
            `export default function Page() { for (const item of items) { return <main>${target}</main>; } }`,
            `export default function Page() { const render = () => <main>${target}</main>; return render(); }`,
        ]) rejects(() => approve(original, selected), 'INVALID_TARGET');
    });

    it('rejects self-closing text targets but supports explicit empty text elements', () => {
        const selected: CloudContentBinding[] = [{ oid: 'title', fields: ['text'] }];
        rejects(() => approve('export default function Page() { return <p data-oid="title" />; }', selected), 'INVALID_TARGET');
        const original = 'export default function Page() { return <p data-oid="title"></p>; }';
        const candidate = original.replace('></p>', '>Hello</p>');
        expect(validate(candidate, original, approve(original, selected)).operations[0]?.value).toBe('Hello');
    });

    it('refuses approvals outside a page or on custom, executable, dynamic or spread targets', () => {
        for (const path of ['app/layout.tsx', 'components/page.tsx', 'app/../page.tsx', '/app/page.tsx', 'app\\page.tsx']) {
            rejects(() => approve(source, bindings, path), 'INVALID_TARGET');
        }
        expect(approve(source, bindings, 'src/app/about/page.tsx').path).toBe('src/app/about/page.tsx');
        for (const original of [
            source.replace(/h1/g, 'Heading'), source.replace(/h1/g, 'script'),
            source.replace('data-oid="title"', 'data-oid="title" {...props}'),
            source.replace('className="text-left"', 'className={styles.title}'),
            source.replace('>Hello<', '>{title}<'),
        ]) rejects(() => approve(original), 'INVALID_TARGET');
    });

    it('rejects a stale structural approval after builder changes without letting the candidate revert it', () => {
        for (const current of [
            source.replace('<main>', '<main className="new-layout">'),
            source.replace(/h1/g, 'h2'),
            source.replace("builder's comment", 'new builder comment'),
            source.replace('return <main>', 'const title = "new"; return <main>'),
        ]) rejects(() => validate(source.replace('>Hello<', '>Changed<'), current), 'STALE_CONTRACT');
    });

    it('limits image URLs to the caller supplied project asset set', () => {
        for (const value of ['https://example.com/pic.png', '//example.com/pic.png', 'data:image/svg+xml,test', '/images/missing.png', '/images/../one.png']) {
            rejects(() => validate(source.replace('/images/one.png', value)), 'INVALID_VALUE');
        }
    });

    it('requires explicit per-target image and link choices, not ownership or safe protocols alone', () => {
        const selected: CloudContentBinding[] = [
            { oid: 'photo', fields: ['src'], allowedValues: { src: ['/images/one.png'] } },
            { oid: 'link', fields: ['href'], allowedValues: { href: ['/about'] } },
        ];
        const contract = approve(source, selected);
        rejects(() => validate(source.replace('/images/one.png', '/images/two.png'), source, contract), 'INVALID_VALUE');
        rejects(() => validate(source.replace('href="/about"', 'href="https://example.com/work"'), source, contract), 'INVALID_VALUE');
        rejects(() => approve(source, [{ oid: 'photo', fields: ['src'] }]), 'INVALID_TARGET');
        rejects(() => approve(source, [{ oid: 'link', fields: ['href'] }]), 'INVALID_TARGET');
        rejects(() => validate(source.replace('First photo', 'Changed'), source, contract), 'UNAPPROVED_CHANGE');
    });

    it('validates unused approved choices and includes choices in the structural fingerprint', () => {
        for (const href of ['javascript:alert(1)', 'http://insecure.test', '//evil.test', 'mailto:a@b.test%0d%0aBcc:c@d.test']) {
            rejects(() => approve(source, [{ oid: 'link', fields: ['href'], allowedValues: { href: ['/about', href] } }]), 'INVALID_VALUE');
        }
        rejects(() => approve(source, [{ oid: 'photo', fields: ['src'], allowedValues: { src: ['/images/one.png', '/images/missing.png'] } }]), 'INVALID_VALUE');
        const one = approve(source, [{ oid: 'link', fields: ['href'], allowedValues: { href: ['/about'] } }]);
        const two = approve(source, [{ oid: 'link', fields: ['href'], allowedValues: { href: ['/about', '/contact'] } }]);
        expect(one.fingerprint).not.toBe(two.fingerprint);
    });

    it('supports human variant names but never partial classes, unsafe names, or missing attributes', () => {
        const selected: CloudContentBinding[] = [{ oid: 'title', fields: ['className'], choices: { left: 'text-left', center: 'text-center' }, choiceLabels: { left: 'Vänster sida', center: 'I mitten' } }];
        const result = validate(source.replace('text-left', 'text-center'), source, approve(source, selected));
        expect(result.operations[0]?.choice).toBe('center');
        expect(() => convexToJson(selected)).not.toThrow();
        rejects(() => validate(source.replace('text-left', 'text-center hidden'), source, approve(source, selected)), 'INVALID_VALUE');
        for (const name of [' ', 'Bad\nname', 'Vänster sida', '$choice', '__proto__', 'constructor', 'prototype']) {
            rejects(() => approve(source, [{ oid: 'title', fields: ['className'], choices: { [name]: 'text-left' } }]), 'INVALID_TARGET');
        }
        rejects(() => approve(source.replace(' alt="First photo"', ''), [{ oid: 'photo', fields: ['alt'] }]), 'INVALID_TARGET');
    });

    it('rejects script, insecure, protocol-relative and obfuscated links', () => {
        for (const value of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', '//evil.test', '/\\evil.test', 'java&#10;script:alert(1)', 'mailto:test@example.com%0d%0aBcc:other@example.com']) {
            rejects(() => validate(source.replace('href="/about"', `href="${value}"`)), 'INVALID_VALUE');
        }
        for (const value of ['/work#hello', '../about', '#contact', '?view=work', 'mailto:hello@example.com', 'tel:+46812345']) {
            expect(validate(source.replace('href="/about"', `href="${value}"`)).operations[0]?.value).toBe(value);
        }
    });

    it('rejects arbitrary CSS, oversized strings and invalid source', () => {
        rejects(() => validate(source.replace('text-left', 'text-[999px]')), 'INVALID_VALUE');
        rejects(() => validate(source.replace('>Hello<', `>${'x'.repeat(10_001)}<`)), 'INVALID_VALUE');
        rejects(() => validate('export default function {'), 'INVALID_SOURCE');
    });
});
