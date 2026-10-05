import type { T } from '../packages';
import { t } from '../packages';

// A bare `<br/>` is the line-break marker this function itself inserts between
// text segments. On re-edit it must be treated as part of the OLD text run
// (removed/replaced), not as "preserved markup" — otherwise every repeated
// multi-line edit to the same node leaves its previous <br/> behind and they
// accumulate without bound.
function isTextRunLineBreak(child: T.JSXElement['children'][number]): boolean {
    return (
        t.isJSXElement(child) &&
        child.openingElement.selfClosing &&
        t.isJSXIdentifier(child.openingElement.name) &&
        child.openingElement.name.name === 'br'
    );
}

export function updateNodeTextContent(node: T.JSXElement, textContent: string): void {
    const isText = (child: T.JSXElement['children'][number]) =>
        t.isJSXText(child) ||
        isTextRunLineBreak(child) ||
        (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression));
    // Replace the whole old run, including our literal string containers and
    // line breaks. Re-editing encoded text must not leave its old value behind.
    const firstTextIndex = node.children.findIndex(
        (child) => isText(child) && !(t.isJSXText(child) && getRenderedJsxText(child.value) === ''),
    );
    const anchor = firstTextIndex === -1
        ? 0
        : node.children.slice(0, firstTextIndex).filter((child) => !isText(child)).length;
    const preserved: T.JSXElement['children'] = node.children.filter((child) => !isText(child));
    preserved.splice(anchor, 0, ...buildTextRun(textContent));
    node.children = preserved;
}

/**
 * The text a JSXText child renders, per the JSX whitespace rules (same as
 * Babel's `cleanJSXElementLiteralChild`): lines are trimmed at their inner
 * edges, whitespace-only lines are dropped and the rest joined with a space.
 */
export function getRenderedJsxText(value: string): string {
    const lines = value.split(/\r\n|\n|\r/);
    let lastNonEmptyLine = 0;
    lines.forEach((line, i) => {
        if (/[^ \t]/.test(line)) {
            lastNonEmptyLine = i;
        }
    });
    let str = '';
    lines.forEach((line, i) => {
        let trimmed = line.replace(/\t/g, ' ');
        if (i !== 0) {
            trimmed = trimmed.replace(/^[ ]+/, '');
        }
        if (i !== lines.length - 1) {
            trimmed = trimmed.replace(/[ ]+$/, '');
        }
        if (trimmed) {
            if (i !== lastNonEmptyLine) {
                trimmed += ' ';
            }
            str += trimmed;
        }
    });
    return str;
}

interface JsxTextGap {
    /** Child indices (into node.children) that make up this gap. */
    childIndices: number[];
    text: string;
    /** Index of the element child that closes this gap; null for the last gap. */
    closingIndex: number | null;
}

/**
 * Split an element's children into "gaps": the text/<br> runs before, between
 * and after its non-<br> element children. Mirrors the DOM-side model of the
 * inline text editor. Returns null when a child renders text the model can't
 * see (e.g. `{expression}`), so callers refuse the edit.
 */
export function getJsxTextGaps(node: T.JSXElement): JsxTextGap[] | null {
    const gaps: JsxTextGap[] = [{ childIndices: [], text: '', closingIndex: null }];
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]!;
        const gap = gaps[gaps.length - 1]!;
        if (t.isJSXText(child)) {
            gap.childIndices.push(i);
            gap.text += getRenderedJsxText(child.value);
        } else if (isTextRunLineBreak(child)) {
            gap.childIndices.push(i);
            gap.text += '\n';
        } else if (t.isJSXElement(child)) {
            gap.closingIndex = i;
            gaps.push({ childIndices: [], text: '', closingIndex: null });
        } else if (t.isJSXExpressionContainer(child)) {
            const expression = child.expression;
            if (t.isJSXEmptyExpression(expression)) {
                gap.childIndices.push(i);
            } else if (t.isStringLiteral(expression)) {
                gap.childIndices.push(i);
                gap.text += expression.value;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
    return gaps;
}

function buildTextRun(text: string): T.JSXElement['children'] {
    const run: T.JSXElement['children'] = [];
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (line) {
            // JSX-significant characters would turn typed text into markup
            // or an expression; a string container keeps them literal.
            run.push(
                /[&{}<>]/.test(line) || line.trim() !== line || line.includes('\t')
                    ? t.jsxExpressionContainer(t.stringLiteral(line))
                    : t.jsxText(line),
            );
        }
        if (index < lines.length - 1) {
            run.push(t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('br'), [], true), null, [], true));
        }
    });
    return run;
}

/**
 * Apply whole-block text edits: rewrite only the listed gaps, keeping every
 * element child (spans, <strong>, …) in place. Each gap must still render
 * exactly `oldText`; otherwise the source changed under the editor and the
 * write is refused (throws) rather than guessing.
 */
export function updateNodeTextSlots(
    node: T.JSXElement,
    slots: { index: number; oldText: string; newText: string }[],
): void {
    const gaps = getJsxTextGaps(node);
    if (!gaps) {
        throw new Error('Inline text edit refused: element has dynamic children');
    }
    const replacements = new Map<number, T.JSXElement['children']>();
    for (const slot of slots) {
        const gap = gaps[slot.index];
        if (!gap || gap.text !== slot.oldText) {
            throw new Error('Inline text edit refused: source text no longer matches the canvas');
        }
        // Keep {/* comments */} of the gap; everything else is the text run.
        const comments = gap.childIndices
            .map((i) => node.children[i]!)
            .filter(
                (child) =>
                    t.isJSXExpressionContainer(child) && t.isJSXEmptyExpression(child.expression),
            );
        replacements.set(slot.index, [...buildTextRun(slot.newText), ...comments]);
    }
    if (replacements.size === 0) {
        return;
    }

    const next: T.JSXElement['children'] = [];
    gaps.forEach((gap, gapIndex) => {
        const replacement = replacements.get(gapIndex);
        if (replacement) {
            next.push(...replacement);
        } else {
            next.push(...gap.childIndices.map((i) => node.children[i]!));
        }
        if (gap.closingIndex !== null) {
            next.push(node.children[gap.closingIndex]!);
        }
    });
    node.children = next;
}
