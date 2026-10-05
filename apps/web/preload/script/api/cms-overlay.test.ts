import { describe, expect, test } from 'bun:test';
import { EditorAttributes } from '@weblab/constants';
import { CmsBindingKind, type CmsBindingPayload } from '@weblab/models';
import { setCmsData, type CmsDataPayload } from './cms';

// A small DOM fixture avoids adding a browser dependency. Children are real
// fixture objects, so identity, detachment and listener preservation are tested.
class FixtureStyle {
    private properties = new Map<string, { value: string; priority: string }>();
    getPropertyValue(name: string): string { return this.properties.get(name)?.value ?? ''; }
    getPropertyPriority(name: string): string { return this.properties.get(name)?.priority ?? ''; }
    setProperty(name: string, value: string, priority = ''): void { this.properties.set(name, { value, priority }); }
    removeProperty(name: string): void { this.properties.delete(name); }
    set backgroundImage(value: string) { this.setProperty('background-image', value); }
}

class FixtureNode {
    childNodes: FixtureNode[] = [];
    parentNode: FixtureNode | null = null;
    dataset: Record<string, string> = {};
    style = new FixtureStyle();
    private attributes = new Map<string, string>();
    private listeners = new Map<string, (() => void)[]>();
    private text = '';
    private markup = '';

    constructor(readonly ownerDocument: FixtureDocument, readonly tagName: string) {}
    get isConnected(): boolean { return this === this.ownerDocument.body || (this.parentNode?.isConnected ?? false); }
    get firstChild(): FixtureNode | null { return this.childNodes[0] ?? null; }
    get textContent(): string { return this.tagName === '#TEXT' ? this.text : this.childNodes.map((child) => child.textContent).join(''); }
    set textContent(value: string | null) {
        if (this.tagName === '#TEXT') { this.text = value ?? ''; return; }
        this.replaceChildren(...(value ? [this.ownerDocument.createTextNode(value)] : []));
    }
    get innerHTML(): string { return this.markup; }
    set innerHTML(value: string) {
        this.markup = value;
        if (value && !this.ownerDocument.templates.has(value)) throw new Error('Unexpected HTML reconstruction');
        this.replaceChildren(...(this.ownerDocument.templates.get(value)?.() ?? []));
    }
    getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
    setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
    removeAttribute(name: string): void { this.attributes.delete(name); }
    set src(value: string) { this.setAttribute('src', value); }
    appendChild(child: FixtureNode): void { child.remove(); this.childNodes.push(child); child.parentNode = this; }
    replaceChildren(...children: FixtureNode[]): void {
        for (const child of this.childNodes) child.parentNode = null;
        this.childNodes = [];
        for (const child of children) this.appendChild(child);
    }
    remove(): void {
        if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
        this.parentNode = null;
    }
    addEventListener(name: string, listener: () => void): void { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]); }
    click(): void { for (const listener of this.listeners.get('click') ?? []) listener(); }
    private matches(selector: string): boolean {
        const match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
        if (!match) throw new Error(`Unsupported fixture selector: ${selector}`);
        const value = this.getAttribute(match[1]!);
        return match[2] === undefined ? value !== null : value === match[2];
    }
    closest(selector: string): FixtureNode | null { return this.matches(selector) ? this : this.parentNode?.closest(selector) ?? null; }
    querySelectorAll(selector: string): FixtureNode[] {
        const found: FixtureNode[] = [];
        for (const child of this.childNodes) {
            if (child.tagName !== '#TEXT' && child.matches(selector)) found.push(child);
            found.push(...child.querySelectorAll(selector));
        }
        return found;
    }
}

class FixtureDocument {
    body = new FixtureNode(this, 'BODY');
    templates = new Map<string, () => FixtureNode[]>();
    createElement(tag: string): FixtureNode { return new FixtureNode(this, tag.toUpperCase()); }
    createTextNode(text: string): FixtureNode { const node = new FixtureNode(this, '#TEXT'); node.textContent = text; return node; }
    querySelectorAll(selector: string): FixtureNode[] { return this.body.querySelectorAll(selector); }
    querySelector(selector: string): FixtureNode | null { return this.querySelectorAll(selector)[0] ?? null; }
    bound(oid: string, tag = 'div', text = 'Source'): FixtureNode {
        const node = this.createElement(tag);
        node.setAttribute(EditorAttributes.DATA_WEBLAB_ID, oid);
        node.textContent = text;
        this.body.appendChild(node);
        return node;
    }
}

function withDocument(run: (doc: FixtureDocument) => void): void {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const doc = new FixtureDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
    try { run(doc); }
    finally {
        if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
        else Reflect.deleteProperty(globalThis, 'document');
    }
}

const empty = (): CmsDataPayload => ({ bindings: {}, items: {}, itemsByCollection: {} });
function payload(values: Record<string, unknown>, bindings?: Record<string, CmsBindingPayload>): CmsDataPayload {
    const inferred: Record<string, CmsBindingPayload> = {};
    for (const oid of Object.keys(values)) inferred[oid] = {
        kind: CmsBindingKind.ITEM_FIELD, collectionId: 'collection', itemId: 'item', fieldKey: oid,
    };
    return {
        bindings: bindings ?? inferred,
        items: { item: { id: 'item', collectionId: 'collection', values } },
        itemsByCollection: { collection: ['item'] },
    };
}

describe('non-list CMS overlay recovery', () => {
    test('removed, missing and null values restore original children and their listeners', () => {
        for (const next of ['removed', 'missing', 'null'] as const) withDocument((doc) => {
            const node = doc.bound('title');
            const button = doc.createElement('button'); button.textContent = 'Original';
            let clicks = 0; button.addEventListener('click', () => { clicks++; });
            node.replaceChildren(button);
            setCmsData(payload({ title: 'CMS' }));
            expect(node.textContent).toBe('CMS');
            const update = next === 'removed' ? empty() : payload({ title: null });
            if (next === 'missing') update.items = {};
            setCmsData(update);
            expect(node.firstChild).toBe(button);
            expect(node.textContent).toBe('Original');
            button.click(); expect(clicks).toBe(1);
        });
    });

    test('successive payloads retain the authored baseline and render values as text', () => withDocument((doc) => {
        const node = doc.bound('title'); const original = node.firstChild;
        for (const title of ['First', 'Second', '<img onerror="bad()">', 0, false]) {
            setCmsData(payload({ title })); expect(node.textContent).toBe(String(title));
        }
        setCmsData(empty()); expect(node.firstChild).toBe(original); expect(node.textContent).toBe('Source');
    }));

    test('images restore relative src or absence without changing unrelated attributes', () => {
        for (const source of ['/original.png', null]) withDocument((doc) => {
            const node = doc.bound('photo', 'img', '');
            if (source !== null) node.setAttribute('src', source);
            node.setAttribute('alt', 'Source alt');
            setCmsData(payload({ photo: { url: 'https://cdn.example/cms.png' } }));
            node.setAttribute('alt', 'New source alt');
            setCmsData(empty());
            expect(node.getAttribute('src')).toBe(source); expect(node.getAttribute('alt')).toBe('New source alt');
        });
    });

    test('backgrounds restore authored value and important priority, including absence', () => {
        for (const source of ['url("source.png")', '']) withDocument((doc) => {
            const node = doc.bound('photo');
            if (source) node.style.setProperty('background-image', source, 'important');
            setCmsData(payload({ photo: { url: 'https://cdn.example/cms.png' } }));
            node.style.setProperty('color', 'red');
            setCmsData(empty());
            expect(node.style.getPropertyValue('background-image')).toBe(source);
            expect(node.style.getPropertyPriority('background-image')).toBe(source ? 'important' : '');
            expect(node.style.getPropertyValue('color')).toBe('red');
        });
    });

    test('HMR text edits and new children with identical text survive this payload', () => {
        for (const text of ['Source changed', 'CMS']) withDocument((doc) => {
            const node = doc.bound('title'); setCmsData(payload({ title: 'CMS' }));
            const replacement = doc.createTextNode(text); node.replaceChildren(replacement);
            setCmsData(payload({ title: 'CMS newer' }));
            expect(node.firstChild).toBe(replacement); expect(node.textContent).toBe(text);
            setCmsData(empty()); expect(node.firstChild).toBe(replacement);
        });
    });

    test('in-place text edits conflict even when child identity is unchanged', () => withDocument((doc) => {
        const node = doc.bound('title'); setCmsData(payload({ title: 'CMS' }));
        node.firstChild!.textContent = 'Source changed';
        setCmsData(payload({ title: 'CMS newer' })); expect(node.textContent).toBe('Source changed');
    }));

    test('source image and background changes, including priority, are not overwritten', () => withDocument((doc) => {
        const image = doc.bound('image', 'img', ''); const background = doc.bound('background');
        const data = payload({ image: { url: 'https://cdn.example/one.png' }, background: { url: 'https://cdn.example/one.png' } });
        setCmsData(data);
        image.setAttribute('src', '/hmr.png');
        background.style.setProperty('background-image', background.style.getPropertyValue('background-image'), 'important');
        setCmsData(data);
        expect(image.getAttribute('src')).toBe('/hmr.png');
        expect(background.style.getPropertyPriority('background-image')).toBe('important');
        setCmsData(empty()); expect(image.getAttribute('src')).toBe('/hmr.png');
        expect(background.style.getPropertyPriority('background-image')).toBe('important');
    }));

    test('disconnected nodes are dropped and replacements get their own baseline', () => withDocument((doc) => {
        const old = doc.bound('title'); setCmsData(payload({ title: 'CMS' })); old.remove();
        const replacement = doc.bound('title', 'div', 'New source');
        setCmsData(payload({ title: 'New CMS' }));
        doc.body.appendChild(old); setCmsData(empty());
        expect(old.textContent).toBe('CMS'); expect(replacement.textContent).toBe('New source');
    }));

    test('nodes adopted by another document are not restored from the old document', () => withDocument((doc) => {
        const node = doc.bound('title'); setCmsData(payload({ title: 'CMS' }));
        const other = new FixtureDocument();
        Object.defineProperty(node, 'ownerDocument', { value: other });
        other.body.appendChild(node);
        setCmsData(empty()); expect(node.textContent).toBe('CMS');
    }));

    test('an original child moved by source code is not stolen from its new parent', () => {
        for (const connected of [true, false]) withDocument((doc) => {
            const node = doc.bound('title');
            const button = doc.createElement('button'); button.textContent = 'Original';
            node.replaceChildren(button);
            setCmsData(payload({ title: 'CMS' }));
            const destination = doc.createElement('aside');
            if (connected) doc.body.appendChild(destination);
            destination.appendChild(button);
            setCmsData(payload({ title: 'New CMS' }));
            expect(button.parentNode).toBe(destination);
            expect(destination.firstChild).toBe(button);
            expect(node.textContent).toBe('CMS');
            setCmsData(empty()); expect(button.parentNode).toBe(destination);
        });
    });

    test('a detached original child adopted by another document is not reclaimed', () => withDocument((doc) => {
        const node = doc.bound('title');
        const button = doc.createElement('button'); button.textContent = 'Original';
        node.replaceChildren(button);
        setCmsData(payload({ title: 'CMS' }));
        const other = new FixtureDocument();
        Object.defineProperty(button, 'ownerDocument', { value: other });
        expect(button.parentNode).toBeNull();
        setCmsData(payload({ title: 'New CMS' }));
        expect(button.ownerDocument).toBe(other); expect(button.parentNode).toBeNull();
        expect(node.textContent).toBe('CMS');
        setCmsData(empty()); expect(button.ownerDocument).toBe(other); expect(button.parentNode).toBeNull();
    }));

    test('nested overlays restore parents before detached children', () => withDocument((doc) => {
        const parent = doc.bound('parent'); const child = doc.bound('child', 'button', 'Child source');
        parent.replaceChildren(child);
        setCmsData(payload({ child: 'Child CMS', parent: 'Parent CMS' }));
        expect(parent.textContent).toBe('Parent CMS'); expect(child.isConnected).toBe(false);
        setCmsData(empty());
        expect(parent.firstChild).toBe(child); expect(child.textContent).toBe('Child source');
    }));

    test('missing first-item and page-item bindings restore their source', () => withDocument((doc) => {
        const first = doc.bound('first'); const page = doc.bound('page');
        const data = payload({ title: 'CMS' }, {
            first: { kind: CmsBindingKind.FIRST_FIELD, collectionId: 'collection', fieldKey: 'title' },
            page: { kind: CmsBindingKind.PAGE_ITEM_FIELD, fieldKey: 'title' },
        });
        data.currentItem = data.items.item!;
        setCmsData(data); expect(first.textContent).toBe('CMS'); expect(page.textContent).toBe('CMS');
        setCmsData({ ...data, items: {}, itemsByCollection: {}, currentItem: null });
        expect(first.textContent).toBe('Source'); expect(page.textContent).toBe('Source');
    }));

    test('repeat clones still reset from their pristine template and never retain non-list overlays', () => withDocument((doc) => {
        const list = doc.bound('list'); list.setAttribute('data-weblab-list', '');
        const template = '<span data-oid="label">Template</span>';
        doc.templates.set(template, () => {
            const label = doc.createElement('span'); label.setAttribute(EditorAttributes.DATA_WEBLAB_ID, 'label');
            label.textContent = 'Template'; return [label];
        });
        list.innerHTML = template;
        const data = payload({ title: 'First' }, {
            list: { kind: CmsBindingKind.REPEAT, collectionId: 'collection' },
            label: { kind: CmsBindingKind.CURRENT_FIELD, fieldKey: 'title' },
        });
        setCmsData(data); expect(list.textContent).toBe('First'); expect(list.childNodes).toHaveLength(1);
        const previousClone = list.firstChild;
        setCmsData(payload({ title: 'Second' }, data.bindings));
        expect(list.textContent).toBe('Second'); expect(list.childNodes).toHaveLength(1);
        expect(list.firstChild).not.toBe(previousClone);
        setCmsData(empty()); expect(list.textContent).toBe('Template');
    }));
});
