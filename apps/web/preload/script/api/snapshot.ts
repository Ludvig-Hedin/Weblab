/**
 * Capture a frozen, post-hydration HTML snapshot of the current document
 * for offline preview rendering. Inlines computed styles on every visible
 * element and strips <script> tags so the snapshot can be served via
 * `srcdoc` from the parent origin without relying on the live dev server.
 *
 * Trade-offs: interactivity inside the snapshot is lost (no JS), but
 * visual fidelity (layout, color, typography, computed CSS variables) is
 * preserved. Penpal still drives optimistic visual edits on top of this
 * static DOM via the parent ↔ child bridge.
 */

const HEAVY_TAGS = new Set([
    'SCRIPT',
    'NEXT-ROUTE-ANNOUNCER',
    'NOSCRIPT',
]);

// Only inline properties that meaningfully affect visual fidelity offline.
// Inlining all 200+ computed properties per element bloats the snapshot 10–100x.
const ESSENTIAL_PROPS = new Set([
    'display', 'visibility', 'opacity',
    'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-width', 'border-style', 'border-color', 'border-radius',
    'box-sizing', 'overflow', 'overflow-x', 'overflow-y',
    'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'align-items', 'align-self', 'justify-content', 'justify-self', 'gap',
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
    'color', 'background', 'background-color', 'background-image',
    'font-size', 'font-family', 'font-weight', 'font-style', 'line-height',
    'text-align', 'text-decoration', 'text-transform', 'letter-spacing',
    'box-shadow', 'transform', 'cursor',
]);

function inlineComputedStyles(root: Element): void {
    const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let current: Node | null = treeWalker.currentNode;
    while (current) {
        if (current instanceof HTMLElement) {
            try {
                const computed = window.getComputedStyle(current);
                const declarations: string[] = [];
                for (const prop of ESSENTIAL_PROPS) {
                    const value = computed.getPropertyValue(prop);
                    if (!value) continue;
                    declarations.push(`${prop}: ${value}`);
                }
                if (declarations.length > 0) {
                    // Preserve any existing inline styles — they may carry
                    // critical dynamic values set by JS at runtime.
                    const existing = current.getAttribute('style');
                    current.setAttribute(
                        'style',
                        existing ? `${declarations.join('; ')}; ${existing}` : declarations.join('; '),
                    );
                }
            } catch {
                /* skip elements where computed style is unavailable */
            }
        }
        current = treeWalker.nextNode();
    }
}

function stripScripts(root: Element): void {
    const removeNodes: Element[] = [];
    root.querySelectorAll('*').forEach((el) => {
        if (HEAVY_TAGS.has(el.tagName)) {
            removeNodes.push(el);
        }
    });
    for (const el of removeNodes) {
        el.parentElement?.removeChild(el);
    }
}

export function serializeDocumentForOffline(): {
    html: string;
    baseUrl: string;
} {
    const baseUrl = window.location.origin;
    const cloned = document.documentElement.cloneNode(true) as HTMLElement;

    stripScripts(cloned);
    inlineComputedStyles(cloned);

    // Ensure relative URLs resolve against the live dev-server origin so
    // referenced images/links keep working when the network is back.
    const head = cloned.querySelector('head');
    if (head) {
        const base = document.createElement('base');
        base.setAttribute('href', `${baseUrl}/`);
        head.insertBefore(base, head.firstChild);
    }

    return {
        html: `<!DOCTYPE html>\n${cloned.outerHTML}`,
        baseUrl,
    };
}
