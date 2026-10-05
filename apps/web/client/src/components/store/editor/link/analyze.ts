import type { T } from '@weblab/parser';
import { getAstFromContent, t, traverse } from '@weblab/parser';

export type LinkType = 'page' | 'url' | 'email' | 'phone' | 'section';

export const LINK_TYPES: readonly LinkType[] = ['page', 'url', 'section', 'email', 'phone'];

/** A JSX attribute as written in source. */
export type AttrState =
    | { state: 'missing' }
    | { state: 'literal'; value: string }
    | { state: 'dynamic' };

export interface LinkSourceInfo {
    /** Tag name as written in source (`a`, `Link`, `button`, `Button`, …). */
    tag: string;
    href: AttrState;
    target: AttrState;
    /** `{...props}` on the element: some attributes come from code. */
    hasSpread: boolean;
    /** Plain-text label, or null when the children are not a single text run. */
    label: string | null;
    /**
     * True for a plain `<button>` with no click handler, form role or spread,
     * which can become `<a href>` without changing what it does.
     */
    canConvertToLink: boolean;
}

const BUTTON_ONLY_ATTRS = new Set([
    'disabled',
    'form',
    'formAction',
    'formMethod',
    'formEncType',
    'formNoValidate',
    'formTarget',
    'name',
    'value',
    'popoverTarget',
    'popoverTargetAction',
]);

function readAttr(opening: T.JSXOpeningElement, name: string): AttrState {
    const attr = opening.attributes.find(
        (a): a is T.JSXAttribute => t.isJSXAttribute(a) && a.name.name === name,
    );
    if (!attr) return { state: 'missing' };
    if (attr.value == null) return { state: 'dynamic' };
    if (t.isStringLiteral(attr.value)) return { state: 'literal', value: attr.value.value };
    if (t.isJSXExpressionContainer(attr.value)) {
        const expr = attr.value.expression;
        if (t.isStringLiteral(expr)) return { state: 'literal', value: expr.value };
        if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) {
            return {
                state: 'literal',
                value: expr.quasis.map((q) => q.value.cooked ?? '').join(''),
            };
        }
    }
    return { state: 'dynamic' };
}

function tagNameOf(opening: T.JSXOpeningElement): string {
    const name = opening.name;
    if (t.isJSXIdentifier(name)) return name.name;
    if (t.isJSXMemberExpression(name)) {
        const parts: string[] = [];
        let current: T.JSXMemberExpression | T.JSXIdentifier = name;
        while (t.isJSXMemberExpression(current)) {
            parts.unshift(current.property.name);
            current = current.object;
        }
        if (t.isJSXIdentifier(current)) parts.unshift(current.name);
        return parts.join('.');
    }
    return '';
}

/** Returns the single visible text run of an element, or null if it has other children. */
function readLabel(element: T.JSXElement): string | null {
    let text: string | null = null;
    for (const child of element.children) {
        if (t.isJSXText(child)) {
            if (child.value.trim() === '') continue;
            if (text !== null) return null;
            text = child.value;
            continue;
        }
        if (t.isJSXExpressionContainer(child) && t.isJSXEmptyExpression(child.expression)) {
            continue; // `{/* comment */}`
        }
        return null;
    }
    if (text === null) return null;
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Reads the link-relevant facts from one element's JSX source. Returns null
 * when the snippet can't be parsed.
 */
export function analyzeLinkSource(code: string): LinkSourceInfo | null {
    const ast = getAstFromContent(code);
    if (!ast) return null;

    let element: T.JSXElement | null = null;
    traverse(ast, {
        JSXElement(path) {
            element = path.node;
            path.stop();
        },
    });
    if (!element) return null;
    const el: T.JSXElement = element;
    const opening = el.openingElement;

    const tag = tagNameOf(opening);
    const hasSpread = opening.attributes.some((a) => t.isJSXSpreadAttribute(a));
    const type = readAttr(opening, 'type');
    const hasHandlerOrFormRole = opening.attributes.some(
        (a) =>
            t.isJSXAttribute(a) &&
            t.isJSXIdentifier(a.name) &&
            (/^on[A-Z]/.test(a.name.name) || BUTTON_ONLY_ATTRS.has(a.name.name)),
    );
    const typeIsPlainButton =
        type.state === 'missing' || (type.state === 'literal' && type.value === 'button');

    return {
        tag,
        href: readAttr(opening, 'href'),
        target: readAttr(opening, 'target'),
        hasSpread,
        label: opening.selfClosing ? null : readLabel(el),
        canConvertToLink:
            tag === 'button' && !hasSpread && !hasHandlerOrFormRole && typeIsPlainButton,
    };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d][\d\s().-]{4,}$/;
const DOMAIN_RE = /^[^\s/]+\.[^\s]{2,}/;
const SECTION_ID_RE = /^[A-Za-z][\w:.-]*$/;

/** Guesses which link type an existing href belongs to. */
export function classifyHref(href: string): LinkType {
    const value = href.trim();
    if (value.startsWith('mailto:')) return 'email';
    if (value.startsWith('tel:')) return 'phone';
    if (value.startsWith('#')) return 'section';
    if (value.startsWith('/') && !value.startsWith('//')) return 'page';
    return 'url';
}

/** The part of an href the user edits for a given type (no `mailto:` etc.). */
export function hrefToFieldValue(type: LinkType, href: string): string {
    switch (type) {
        case 'email':
            return href.replace(/^mailto:/, '').split('?')[0] ?? '';
        case 'phone':
            return href.replace(/^tel:/, '');
        case 'section':
            return href.replace(/^#/, '');
        default:
            return href;
    }
}

export type BuildHrefResult = { ok: true; href: string } | { ok: false; problem: LinkProblem };

export type LinkProblem = 'emptyValue' | 'badUrl' | 'badEmail' | 'badPhone' | 'badSection';

/** Turns what the user typed or picked into a finished href, or explains why not. */
export function buildHref(type: LinkType, raw: string): BuildHrefResult {
    const value = raw.trim();
    if (!value) return { ok: false, problem: 'emptyValue' };
    switch (type) {
        case 'page':
            return value.startsWith('/')
                ? { ok: true, href: value }
                : { ok: true, href: `/${value}` };
        case 'url': {
            if (/\s/.test(value)) return { ok: false, problem: 'badUrl' };
            if (/^https?:\/\/[^\s/]+/i.test(value)) return { ok: true, href: value };
            if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return { ok: false, problem: 'badUrl' };
            if (value.startsWith('/')) return { ok: true, href: value };
            if (DOMAIN_RE.test(value)) return { ok: true, href: `https://${value}` };
            return { ok: false, problem: 'badUrl' };
        }
        case 'email': {
            const email = value.replace(/^mailto:/, '');
            return EMAIL_RE.test(email)
                ? { ok: true, href: `mailto:${email}` }
                : { ok: false, problem: 'badEmail' };
        }
        case 'phone': {
            const phone = value.replace(/^tel:/, '');
            if (!PHONE_RE.test(phone)) return { ok: false, problem: 'badPhone' };
            return { ok: true, href: `tel:${phone.replace(/[^\d+]/g, '')}` };
        }
        case 'section': {
            const id = value.replace(/^#/, '');
            return SECTION_ID_RE.test(id)
                ? { ok: true, href: `#${id}` }
                : { ok: false, problem: 'badSection' };
        }
    }
}

/** JSX text can't hold these characters without escaping, so the label field refuses them. */
export function isSafeLabel(text: string): boolean {
    return !/[{}<>]/.test(text);
}
