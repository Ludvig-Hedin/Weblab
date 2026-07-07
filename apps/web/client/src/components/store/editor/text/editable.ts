import { getAstFromCodeblock, t } from '@weblab/parser';

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
        // Whitespace-only string containers ({' '}) are a formatting idiom,
        // not content — blocking them would over-block very common elements.
        // Non-whitespace literals still render visible text the inline editor
        // would duplicate, so only whitespace passes.
        if (t.isStringLiteral(expression) && expression.value.trim() === '') {
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
