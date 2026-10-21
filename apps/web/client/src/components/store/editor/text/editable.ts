import { INLINE_TEXT_TAGS } from '@weblab/constants';
import { getAstFromCodeblock, getJsxTextGaps, t } from '@weblab/parser';

import type { T } from '@weblab/parser';

/**
 * Source-AST gate for inline text editing.
 *
 * The DOM cannot distinguish static JSX text from a rendered `{expression}` —
 * both arrive as text nodes — so the check must run against the element's
 * source snippet. Committing an inline edit on an element with dynamic
 * children would write the rendered value next to the preserved expression
 * (duplicated content) and bake bindings in as literals.
 *
 * Returns:
 * - `true`  — every child round-trips cleanly through the text write path
 * - `false` — element has dynamic/markup children; block inline editing
 * - `null`  — snippet could not be parsed; caller treats as "can't determine"
 */
export function canEditJsxChildrenAsText(code: string): boolean | null {
    const jsxElement = getAstFromCodeblock(code);
    if (!jsxElement) {
        return null;
    }
    return jsxElement.children.every(isPlainTextChild);
}

const INLINE_TEXT_TAG_SET = new Set(INLINE_TEXT_TAGS);

/**
 * Gate for whole-block editing (a heading whose lines are <span>s, or a
 * paragraph with <strong>/<a>): every child is plain text or a text-level
 * lowercase element whose own children recursively pass the same check, so
 * the per-run write can keep all elements and change only their text.
 */
export function canEditJsxChildrenAsRichText(code: string): boolean | null {
    const jsxElement = getAstFromCodeblock(code);
    if (!jsxElement) {
        return null;
    }
    return isRichTextElement(jsxElement);
}

function isRichTextElement(node: T.JSXElement): boolean {
    if (!getJsxTextGaps(node)) {
        return false;
    }
    return node.children.every((child) => {
        if (!t.isJSXElement(child)) {
            return isPlainTextChild(child);
        }
        if (isPlainTextChild(child)) {
            return true; // <br/>
        }
        const name = child.openingElement.name;
        if (!t.isJSXIdentifier(name) || !INLINE_TEXT_TAG_SET.has(name.name)) {
            return false;
        }
        // Spread props could inject children/dangerouslySetInnerHTML.
        if (child.openingElement.attributes.some((attr) => t.isJSXSpreadAttribute(attr))) {
            return false;
        }
        return isRichTextElement(child);
    });
}

function isPlainTextChild(child: T.JSXElement['children'][number]): boolean {
    if (t.isJSXText(child)) {
        return true;
    }
    // <br/> is the line-break marker the text write path itself manages.
    if (
        t.isJSXElement(child) &&
        child.openingElement.selfClosing &&
        t.isJSXIdentifier(child.openingElement.name) &&
        child.openingElement.name.name === 'br'
    ) {
        return true;
    }
    if (t.isJSXExpressionContainer(child)) {
        const expression = child.expression;
        // {/* comment */} renders nothing and is preserved verbatim on write.
        if (t.isJSXEmptyExpression(expression)) {
            return true;
        }
        // The writer replaces static string containers along with JSXText.
        // This also makes text encoded for braces/entities re-editable.
        if (t.isStringLiteral(expression)) {
            return true;
        }
    }
    return false;
}

const HTML_FILE_RE = /\.html?$/i;

/** Static HTML has no dynamic children — any text element is inline-editable. */
export function isHtmlSourcePath(path: string): boolean {
    return HTML_FILE_RE.test(path);
}
