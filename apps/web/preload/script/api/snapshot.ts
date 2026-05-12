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

const HEAVY_TAGS = new Set(['SCRIPT', 'NEXT-ROUTE-ANNOUNCER', 'NOSCRIPT']);

// Only inline properties that meaningfully affect visual fidelity offline.
// Inlining all 200+ computed properties per element bloats the snapshot 10–100x.
const ESSENTIAL_PROPS = new Set([
    'display',
    'visibility',
    'opacity',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'z-index',
    'width',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'box-sizing',
    'overflow',
    'overflow-x',
    'overflow-y',
    'flex',
    'flex-direction',
    'flex-wrap',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'align-items',
    'align-self',
    'justify-content',
    'justify-self',
    'gap',
    'grid-template-columns',
    'grid-template-rows',
    'grid-column',
    'grid-row',
    'color',
    'background',
    'background-color',
    'background-image',
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'line-height',
    'text-align',
    'text-decoration',
    'text-transform',
    'letter-spacing',
    'box-shadow',
    'transform',
    'cursor',
]);

// Walk live and clone trees in lockstep. getComputedStyle only returns
// meaningful values on connected nodes — a detached clone yields CSS initial
// values, which silently destroys visual fidelity.
function inlineComputedStylesLockstep(liveRoot: Element, cloneRoot: Element): void {
    const liveWalker = document.createTreeWalker(liveRoot, NodeFilter.SHOW_ELEMENT);
    const cloneWalker = document.createTreeWalker(cloneRoot, NodeFilter.SHOW_ELEMENT);
    let liveNode: Node | null = liveWalker.currentNode;
    let cloneNode: Node | null = cloneWalker.currentNode;
    while (liveNode && cloneNode) {
        if (liveNode instanceof HTMLElement && cloneNode instanceof HTMLElement) {
            try {
                const computed = window.getComputedStyle(liveNode);
                const declarations: string[] = [];
                for (const prop of ESSENTIAL_PROPS) {
                    const value = computed.getPropertyValue(prop);
                    if (!value) continue;
                    declarations.push(`${prop}: ${value}`);
                }
                if (declarations.length > 0) {
                    // Preserve any existing inline styles — they may carry
                    // critical dynamic values set by JS at runtime.
                    const existing = cloneNode.getAttribute('style');
                    cloneNode.setAttribute(
                        'style',
                        existing
                            ? `${declarations.join('; ')}; ${existing}`
                            : declarations.join('; '),
                    );
                }
            } catch {
                /* skip elements where computed style is unavailable */
            }
        }
        liveNode = liveWalker.nextNode();
        cloneNode = cloneWalker.nextNode();
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

const SENSITIVE_ATTR_RE = /^(auth|token|session|apikey|api-key|secret|password|credential)/i;

function redactSensitiveContent(root: Element): void {
    // Clear form field values — prevents passwords, tokens, or PII from leaking.
    root.querySelectorAll('input, textarea, select').forEach((el) => {
        if (el instanceof HTMLInputElement) {
            el.removeAttribute('value');
            el.value = '';
            // Email/password inputs sometimes carry user data in placeholder
            // (autocomplete hints) or title attributes — strip both.
            if (el.type === 'email' || el.type === 'password') {
                el.removeAttribute('placeholder');
                el.removeAttribute('title');
            }
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = false;
                el.removeAttribute('checked');
            }
        } else if (el instanceof HTMLTextAreaElement) {
            el.textContent = '';
        } else if (el instanceof HTMLSelectElement) {
            // Clearing .value alone leaves `selected` attributes on <option>
            // elements, which survive outerHTML serialization and leak the
            // user's selection. Strip selection state from each option.
            el.querySelectorAll('option').forEach((opt) => {
                opt.selected = false;
                opt.removeAttribute('selected');
            });
            el.selectedIndex = -1;
        }
    });
    // Drop attributes whose names match sensitive patterns (including data-* variants).
    root.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.startsWith('data-') ? attr.name.slice(5) : attr.name;
            if (SENSITIVE_ATTR_RE.test(name)) {
                el.removeAttribute(attr.name);
            }
        }
    });
}

export function serializeDocumentForOffline(): {
    html: string;
    baseUrl: string;
} {
    const baseUrl = window.location.origin;
    const cloned = document.documentElement.cloneNode(true) as HTMLElement;

    // Inline styles BEFORE stripping scripts so live and clone trees stay
    // structurally aligned during the lockstep walk.
    inlineComputedStylesLockstep(document.documentElement, cloned);
    stripScripts(cloned);
    redactSensitiveContent(cloned);

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
