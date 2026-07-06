import type { T } from '../packages';
import { t } from '../packages';

export function updateNodeTextContent(node: T.JSXElement, textContent: string): void {
    // TODO(bug-hunt): user text is written verbatim into a JSXText node, so
    // characters significant in JSX — `{`, `}`, `<`, `>` — are not escaped:
    // typing `{x}` becomes a JSX expression container (`x` is evaluated as an
    // identifier at runtime → ReferenceError) instead of being shown literally.
    // A JSX-aware text encoder is still needed here. (The separate child-wipe
    // bug — multi-line edits erasing nested <strong>/<a>/<span> markup — is
    // fixed below: only JSXText children are replaced; element / expression /
    // fragment children are preserved.)

    // Split the text content by newlines
    const parts = textContent.split('\n');

    // Single line: update the first NON-whitespace JSXText node. Whitespace-only
    // nodes (e.g. the "\n  " indentation that sits between tags in formatted
    // JSX) are skipped — editing one of those would leave the real visible text
    // run stale while silently mangling the source's formatting.
    if (parts.length === 1) {
        const textNode = node.children.find(
            (child): child is T.JSXText => t.isJSXText(child) && child.value.trim() !== '',
        );
        if (textNode) {
            textNode.value = textContent;
        } else {
            node.children.unshift(t.jsxText(textContent));
        }
        return;
    }

    // Multi-line: rebuild the text as JSXText segments separated by <br/>, then
    // splice that run back in WITHOUT discarding nested markup. We remove only
    // JSXText children; JSXElement / JSXExpressionContainer / JSXFragment / etc.
    // survive in their original relative order.
    const newTextRun: T.JSXElement['children'] = [];
    parts.forEach((part, index) => {
        if (part) {
            newTextRun.push(t.jsxText(part));
        }
        if (index < parts.length - 1) {
            newTextRun.push(
                t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('br'), [], true), null, [], true),
            );
        }
    });

    // Anchor the rebuilt run where the element's text originally lived relative
    // to its preserved siblings: at the first JSXText position (all children
    // before it are non-text, so its index also indexes into the preserved
    // array). With no text node at all, prepend — matching the single-line
    // no-text-node branch above. Distributing text between multiple preserved
    // elements isn't recoverable once mixed content is flattened to one string,
    // so a single anchor point is the faithful reconstruction.
    const firstTextIndex = node.children.findIndex((child) => t.isJSXText(child));
    const anchor = firstTextIndex === -1 ? 0 : firstTextIndex;
    // Explicit type: TS 5.5 infers `!isJSXText` as a negated type predicate and
    // would narrow this to exclude JSXText, rejecting the spliced-in text run.
    const preserved: T.JSXElement['children'] = node.children.filter(
        (child) => !t.isJSXText(child),
    );
    preserved.splice(anchor, 0, ...newTextRun);
    node.children = preserved;
}
