import { describe, expect, test } from 'bun:test';

import type { ContentTextTarget, ContentTextTargetErrorCode } from './content-target';
import {
    ContentTextTargetError,
    readContentTextTarget,
    replaceContentTextTarget,
} from './content-target';

// Representative source from the reviewed proof copy. CSS expressions and unrelated rendering stay frozen.
const hero = `import Image from "next/image";
import styles from "./hero.module.css";
const proofLogos = ["/brand/proof-1.svg"];
export function Hero() {
  return (
    <header className={styles.hero} data-oid="h0kh8ch">
      <Image className={styles.grain} src="/media/hero-grain.webp" alt="" fill />
      <div className={styles.copy} data-oid="q9l-j.t">
        <h1 data-oid="m.lrkv0">
          <span className={\`\${styles.revealItem} \${styles.headingLineOne}\`} data-oid="g33m-:z">AI agents for</span>
          <span className={\`\${styles.revealItem} \${styles.headingLineTwo}\`} data-oid="r6ggni1">IP and patent analysis</span>
        </h1>
        <p data-oid="5e0z6uq">Invalidity, infringement, and FTO analyses in minutes.</p>
      </div>
      <div>{proofLogos.map((logo) => <img src={logo} key={logo} data-oid="hl8tw6z" />)}</div>
    </header>);
}`;
const faq = `import type { ChatFaqItem } from "@/components/sections/chat-faq";
// These IDs and their order remain fixed.
export const homeFaqItems: readonly ChatFaqItem[] = [
  { id: "audience", question: "Who is Stilta for?", answer: "For IP firms and in-house IP teams." },
  { id: "pricing", question: "How is Stilta priced?", answer: "Per-project or a site license." },
];
`;
const component: ContentTextTarget = {
    kind: 'component-literal',
    exportName: 'Hero',
    oid: 'g33m-:z',
};
const data: ContentTextTarget = {
    kind: 'data-leaf',
    exportName: 'homeFaqItems',
    itemId: 'audience',
    property: 'answer',
};

function refuses(run: () => unknown, code: ContentTextTargetErrorCode): void {
    let error: unknown;
    try {
        run();
    } catch (caught) {
        error = caught;
    }
    expect(error).toBeInstanceOf(ContentTextTargetError);
    expect((error as ContentTextTargetError).code).toBe(code);
}

describe('component content text targets', () => {
    test('finds the native Hero span through frozen CSS attributes and ignores unrelated map rendering', () => {
        expect(readContentTextTarget(hero, component)).toBe('AI agents for');
        const result = replaceContentTextTarget(
            hero,
            component,
            'AI agents for',
            'Research teams use',
        );
        expect(result).toBe(
            hero.replace('>AI agents for</span>', '>{"Research teams use"}</span>'),
        );
        expect(readContentTextTarget(result, component)).toBe('Research teams use');
    });

    test('preserves CRLF, imports, both heading spans and all bytes outside the leaf', () => {
        const source = hero.replace(/\n/g, '\r\n');
        expect(replaceContentTextTarget(source, component, 'AI agents for', 'New heading')).toBe(
            source.replace('>AI agents for</span>', '>{"New heading"}</span>'),
        );
        expect(replaceContentTextTarget(source, component, 'AI agents for', 'AI agents for')).toBe(
            source,
        );
    });

    test('rejects missing export, missing OID and OIDs owned by another component', () => {
        refuses(
            () => readContentTextTarget(hero, { ...component, exportName: 'Other' }),
            'EXPORT_NOT_FOUND',
        );
        refuses(
            () => readContentTextTarget(hero, { ...component, oid: 'missing' }),
            'OID_NOT_FOUND',
        );
        const source = `${hero}\nexport function Other() { return <p data-oid="other">Other</p>; }`;
        refuses(
            () => readContentTextTarget(source, { ...component, oid: 'other' }),
            'UNSUPPORTED_COMPONENT',
        );
    });

    test('rejects duplicate matching OIDs anywhere in the file, including string expressions', () => {
        for (const attribute of [
            'data-oid="g33m-:z"',
            'data-oid={"g33m-:z"}',
            'data-oid={`g33m-:z`}',
        ]) {
            refuses(
                () =>
                    readContentTextTarget(
                        `${hero}\nconst other = <p ${attribute}>Other</p>;`,
                        component,
                    ),
                'DUPLICATE_OID',
            );
        }
    });

    test('refuses conditional returns, callback targets and named arrows', () => {
        refuses(
            () =>
                readContentTextTarget(
                    hero.replace('return (', 'if (ready) return null; return ('),
                    component,
                ),
            'UNSUPPORTED_COMPONENT',
        );
        const callback =
            'export function Hero() { return <div>{items.map(item => <span data-oid="g33m-:z">Text</span>)}</div>; }';
        refuses(() => readContentTextTarget(callback, component), 'UNSUPPORTED_COMPONENT');
        refuses(
            () =>
                readContentTextTarget(
                    'export const Hero = () => <span data-oid="g33m-:z">Text</span>;',
                    component,
                ),
            'UNSUPPORTED_COMPONENT',
        );
    });

    test('refuses rich text, dynamic text and ambiguous attributes', () => {
        for (const child of [
            '<strong>AI agents for</strong>',
            '{title}',
            '{call()}',
            '{ready ? "Yes" : "No"}',
            '{/* preserved comment */}Text',
        ]) {
            refuses(
                () =>
                    readContentTextTarget(
                        hero.replace('>AI agents for</span>', `>${child}</span>`),
                        component,
                    ),
                'NON_LITERAL_TEXT',
            );
        }
        for (const attribute of [
            '{...props}',
            'children="Override"',
            'dangerouslySetInnerHTML={html}',
            'className="second"',
        ]) {
            refuses(
                () =>
                    readContentTextTarget(
                        hero.replace('data-oid="g33m-:z"', `data-oid="g33m-:z" ${attribute}`),
                        component,
                    ),
                'UNSUPPORTED_ELEMENT',
            );
        }
        refuses(
            () => readContentTextTarget(hero, { ...component, oid: 'm.lrkv0' }),
            'NON_LITERAL_TEXT',
        );
    });

    test('reads JSX entities and rendered whitespace, then round trips significant characters and line breaks', () => {
        const source = hero.replace('>AI agents for</span>', '>\n  A &amp; B\n  together\n</span>');
        expect(readContentTextTarget(source, component)).toBe('A & B together');
        const value = ' <script>{notCode}</script> & "quote" \\path\nNext\r\n\tline\u2028\u2029😀 ';
        const result = replaceContentTextTarget(source, component, 'A & B together', value);
        expect(readContentTextTarget(result, component)).toBe(value);
        expect(
            readContentTextTarget(
                replaceContentTextTarget(result, component, value, ''),
                component,
            ),
        ).toBe('');
    });
});

describe('keyed data content text targets', () => {
    test('replaces only the requested record property and preserves types and comments', () => {
        expect(readContentTextTarget(faq, data)).toBe('For IP firms and in-house IP teams.');
        const result = replaceContentTextTarget(
            faq,
            data,
            'For IP firms and in-house IP teams.',
            'For patent teams.',
        );
        expect(result).toBe(
            faq.replace('"For IP firms and in-house IP teams."', '"For patent teams."'),
        );
        expect(readContentTextTarget(result, { ...data, itemId: 'pricing' })).toBe(
            'Per-project or a site license.',
        );
        expect(readContentTextTarget(result, { ...data, property: 'question' })).toBe(
            'Who is Stilta for?',
        );
    });

    test('addresses records by immutable ID rather than order or editable question', () => {
        const source =
            'export const homeFaqItems = [{ id: "pricing", answer: "Same" }, { id: "audience", answer: "Same" }];';
        expect(replaceContentTextTarget(source, data, 'Same', 'Changed')).toBe(
            'export const homeFaqItems = [{ id: "pricing", answer: "Same" }, { id: "audience", answer: "Changed" }];',
        );
        refuses(() => readContentTextTarget(source, { ...data, property: 'id' }), 'INVALID_TARGET');
    });

    test('rejects duplicate IDs, absent IDs, missing items and missing properties', () => {
        refuses(
            () => readContentTextTarget(faq.replace('id: "pricing"', 'id: "audience"'), data),
            'DUPLICATE_ITEM_ID',
        );
        refuses(
            () => readContentTextTarget(faq.replace('id: "pricing", ', ''), data),
            'UNSUPPORTED_LIST',
        );
        refuses(() => readContentTextTarget(faq, { ...data, itemId: 'missing' }), 'ITEM_NOT_FOUND');
        refuses(
            () => readContentTextTarget(faq, { ...data, property: 'missing' }),
            'PROPERTY_NOT_FOUND',
        );
        refuses(
            () => readContentTextTarget(faq, { ...data, exportName: 'Other' }),
            'EXPORT_NOT_FOUND',
        );
    });

    test('rejects spreads, getters, computed keys, aliases, nonliteral values and calls', () => {
        for (const expression of [
            '[{ id: "audience", ...other, answer: "Text" }]',
            '[{ id: "audience", get answer() { return "Text"; } }]',
            '[{ id: "audience", ["answer"]: "Text" }]',
            '[{ id: "audience", answer: other }]',
            '[{ id: "audience", answer: call() }]',
            '[{ id: "audience", answer: `Text` }]',
            '[{ id: "audience", answer: "Text", question: call() }]',
            '[{ id: "audience", answer: "Text", answer: "Other" }]',
            '[{ id: "audience", answer: "Text" }, ...other]',
            '[record]',
            'other',
            'makeItems()',
        ]) {
            refuses(
                () => readContentTextTarget(`export const homeFaqItems = ${expression};`, data),
                'UNSUPPORTED_LIST',
            );
        }
        refuses(
            () => readContentTextTarget(faq.replace('export const', 'export let'), data),
            'UNSUPPORTED_LIST',
        );
        refuses(
            () => readContentTextTarget(`${faq}\nhomeFaqItems[0].id = "other";`, data),
            'UNSUPPORTED_LIST',
        );
        refuses(
            () => readContentTextTarget(`${faq}\nconst alias = homeFaqItems;`, data),
            'UNSUPPORTED_LIST',
        );
        refuses(
            () =>
                readContentTextTarget(
                    'export const homeFaqItems = [{ id: "audience", answer: 42 }];',
                    data,
                ),
            'NON_LITERAL_TEXT',
        );
    });

    test('safely quotes data, preserving surrounding single-quoted source', () => {
        const source = "export const homeFaqItems = [{id: 'audience', answer: 'Old'}];";
        const value = 'Quotes " \' \\ and \nnew lines < > & {}';
        const result = replaceContentTextTarget(source, data, 'Old', value);
        expect(result).toBe(source.replace("'Old'", JSON.stringify(value)));
        expect(readContentTextTarget(result, data)).toBe(value);
    });
});

describe('content target bounds and stale value guards', () => {
    test('rejects stale text without changing anything', () => {
        refuses(
            () => replaceContentTextTarget(hero, component, 'Stale', 'New'),
            'PREVIOUS_VALUE_MISMATCH',
        );
        refuses(
            () => replaceContentTextTarget(faq, data, 'Stale', 'New'),
            'PREVIOUS_VALUE_MISMATCH',
        );
    });

    test('limits both stored and requested text and disallows control characters', () => {
        for (const value of [
            'x'.repeat(5_001),
            'Bad\u0000text',
            'Bad\u007ftext',
            'Bad\u000btext',
        ]) {
            refuses(
                () => replaceContentTextTarget(hero, component, 'AI agents for', value),
                'INVALID_VALUE',
            );
        }
        const source = hero.replace('>AI agents for</span>', `>${'x'.repeat(5_001)}</span>`);
        refuses(() => readContentTextTarget(source, component), 'INVALID_VALUE');
        const allowed = 'x'.repeat(5_000);
        expect(
            readContentTextTarget(
                replaceContentTextTarget(hero, component, 'AI agents for', allowed),
                component,
            ),
        ).toBe(allowed);
    });

    test('limits UTF-8 source bytes and refuses invalid source', () => {
        refuses(
            () => readContentTextTarget(`/*${'é'.repeat(375_000)}*/${hero}`, component),
            'INVALID_SOURCE',
        );
        refuses(() => readContentTextTarget('export function {', component), 'INVALID_SOURCE');
    });
});
