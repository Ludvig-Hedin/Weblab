import { describe, expect, test } from 'bun:test';

import type { ContentImageTarget, ContentImageTargetErrorCode } from './content-image-target';
import {
    ContentImageTargetError,
    readContentImageTarget,
    replaceContentImageTarget,
} from './content-image-target';

// Real About/Security object shapes; prose is generic and no customer files are read by the test.
const source = `import type { TeamMember } from './team';
export const aboutHero = {
  eyebrowLead: "About", eyebrowTail: "Our team", heading: ["About us"],
  imageSrc: '/media/about/about-hero.webp',
  imageAlt: "Four colleagues in a living room.",
  imageWidth: 2752, imageHeight: 1548,
} as const;
export const teamMembers: TeamMember[] = [{ name: "A", imageSrc: "/media/team.webp" }];
`;
const target: ContentImageTarget = {
    kind: 'object-image',
    exportName: 'aboutHero',
    srcProperty: 'imageSrc',
    altProperty: 'imageAlt',
};
const previous = { src: '/media/about/about-hero.webp', alt: 'Four colleagues in a living room.' };
function refuses(run: () => unknown, code: ContentImageTargetErrorCode): void {
    let error: unknown;
    try {
        run();
    } catch (cause) {
        error = cause;
    }
    expect(error).toBeInstanceOf(ContentImageTargetError);
    expect((error as ContentImageTargetError).code).toBe(code);
}
describe('object image source targets', () => {
    test('reads a named exported const with const assertion and preserves unrelated exports', () => {
        expect(readContentImageTarget(source, target)).toEqual(previous);
        const security =
            'export const securityHero = { heading: ["Secure", "work"], imageSrc: "/media/security-hero.webp", imageAlt: "Workspace" } as const;';
        expect(readContentImageTarget(security, { ...target, exportName: 'securityHero' })).toEqual(
            { src: '/media/security-hero.webp', alt: 'Workspace' },
        );
    });
    test('changes only exact literal ranges with both fields and either source order', () => {
        const next = { src: '/weblab-upload-photo.webp', alt: 'Updated "team" & colleagues.' };
        const expected = source
            .replace("'/media/about/about-hero.webp'", JSON.stringify(next.src))
            .replace(JSON.stringify(previous.alt), JSON.stringify(next.alt));
        expect(replaceContentImageTarget(source, target, previous, next)).toBe(expected);
        const reversed = 'export const aboutHero = {imageAlt: "Old", imageSrc: "/media/old.webp"};';
        expect(
            replaceContentImageTarget(
                reversed,
                target,
                { src: '/media/old.webp', alt: 'Old' },
                next,
            ),
        ).toBe(
            `export const aboutHero = {imageAlt: ${JSON.stringify(next.alt)}, imageSrc: ${JSON.stringify(next.src)}};`,
        );
    });
    test('leaves untouched literals, comments, BOM and CRLF byte-identical, including a no-op', () => {
        const exact = '\ufeff' + source.replace(/\n/g, '\r\n');
        expect(replaceContentImageTarget(exact, target, previous, previous)).toBe(exact);
        expect(replaceContentImageTarget(exact, target, previous, { ...previous, alt: '' })).toBe(
            exact.replace(JSON.stringify(previous.alt), '""'),
        );
        const updated = replaceContentImageTarget(exact, target, previous, {
            ...previous,
            alt: 'Unicode \u2028 separator',
        });
        expect(updated).toContain('Unicode \\u2028 separator');
        expect(readContentImageTarget(updated, target).alt).toBe('Unicode \u2028 separator');
    });
    test('rejects stale previous values for either field', () => {
        for (const value of [
            { ...previous, src: '/media/other.webp' },
            { ...previous, alt: 'Wrong' },
        ])
            refuses(
                () => replaceContentImageTarget(source, target, value, previous),
                'PREVIOUS_VALUE_MISMATCH',
            );
    });
    test('rejects computed, duplicated, nonliteral and spread object properties', () => {
        for (const object of [
            '{imageSrc:"/a.webp", imageSrc:"/b.webp", imageAlt:"A"}',
            '{["imageSrc"]:"/a.webp", imageAlt:"A"}',
            '{imageSrc:"/a.webp", get imageAlt(){return "A"}}',
            '{imageSrc:asset, imageAlt:"A"}',
            '{imageSrc:`/a.webp`, imageAlt:"A"}',
            '{...other, imageSrc:"/a.webp", imageAlt:"A"}',
            '{imageSrc:"/a.webp", imageAlt:"A", __proto__:null}',
            '{imageSrc:"/a.webp", imageAlt:"A", heading:[dynamic]}',
        ])
            refuses(
                () => readContentImageTarget(`export const aboutHero=${object};`, target),
                'UNSUPPORTED_OBJECT',
            );
    });
    test('rejects aliases, mutation, mutable exports, missing fields and non-object assertions', () => {
        for (const extra of [
            'const alias = aboutHero;',
            'aboutHero.imageSrc = "/b.webp";',
            'Object.assign(aboutHero, {});',
        ])
            refuses(() => readContentImageTarget(source + extra, target), 'UNSUPPORTED_OBJECT');
        refuses(
            () =>
                readContentImageTarget(
                    source.replace('export const aboutHero', 'export let aboutHero'),
                    target,
                ),
            'UNSUPPORTED_OBJECT',
        );
        refuses(
            () => readContentImageTarget(source.replace('imageAlt:', 'other:'), target),
            'PROPERTY_NOT_FOUND',
        );
        refuses(
            () => readContentImageTarget(source.replace('as const', 'as unknown'), target),
            'UNSUPPORTED_OBJECT',
        );
        refuses(
            () => readContentImageTarget(source, { ...target, exportName: 'missing' }),
            'EXPORT_NOT_FOUND',
        );
        expect(
            readContentImageTarget(
                source + 'function unrelated(aboutHero: string) { return aboutHero; }',
                target,
            ),
        ).toEqual(previous);
    });
    test('rejects malformed identities, nonlocal source values and unsafe alt text', () => {
        for (const name of ['aboutHero\n', '1aboutHero', '', 'a'.repeat(161)])
            refuses(
                () => readContentImageTarget(source, { ...target, exportName: name }),
                'INVALID_TARGET',
            );
        for (const src of [
            'https://example.com/a.webp',
            '//example.com/a.webp',
            '/a/../b.webp',
            '/a%2fb.webp',
            '/a.webp?x=1',
            '/a.webp\n',
        ])
            refuses(
                () => replaceContentImageTarget(source, target, previous, { ...previous, src }),
                'INVALID_VALUE',
            );
        for (const alt of ['line\nbreak', 'tab\t', 'a'.repeat(1_001)])
            refuses(
                () => replaceContentImageTarget(source, target, previous, { ...previous, alt }),
                'INVALID_VALUE',
            );
    });
});
