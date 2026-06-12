import { describe, expect, test } from 'bun:test';
import {
    detachInstanceHtml,
    extractHtmlComponent,
    findInstancesInPage,
    parseComponentManifest,
    restampPage,
    stampInstance,
    stripComponentMarkers,
} from 'src/component';
import { htmlPipeline } from 'src/pipelines';
import { serialize } from 'parse5';

const MASTER = `<script type="application/json" data-weblab-manifest>
{
  "name": "Card",
  "props": {
    "title": { "type": "text", "default": "Card title" },
    "image": { "type": "image", "default": "/placeholder.png" },
    "showCta": { "type": "switch", "default": true },
    "variant": { "type": "variant", "default": "light",
                 "variants": { "light": "card--light", "dark": "card--dark" } }
  }
}
</script>
<div class="card {{variant:class}}" data-oid="a1">
  <img src="{{image}}" data-oid="b2">
  <h3 data-oid="c3">{{title}}</h3>
  <a href="#" data-wb-if="showCta" data-oid="d4">Learn more</a>
  <slot name="body"><p data-oid="e5">Fallback body</p></slot>
</div>`;

describe('parseComponentManifest', () => {
    test('derives a ComponentDef from the partial', () => {
        const def = parseComponentManifest(MASTER, 'weblab/components/card.html');
        expect(def).not.toBeNull();
        expect(def!.name).toBe('Card');
        expect(def!.kind).toBe('html');
        expect(def!.rootOid).toBe('a1');
        const byName = Object.fromEntries(def!.props.map((p) => [p.name, p]));
        expect(byName.title?.type).toBe('text');
        expect(byName.showCta?.type).toBe('switch');
        expect(byName.variant?.type).toBe('variant');
        expect(def!.variants?.defaultVariant).toBe('light');
        expect(def!.slots.map((s) => s.name)).toEqual(['body']);
    });
});

describe('stampInstance', () => {
    test('substitutes props, scopes oids, resolves variant, honors data-wb-if', () => {
        const stamped = stampInstance(MASTER, {
            componentKey: 'weblab/components/card.html',
            instanceId: 'i123',
            props: { title: 'Hello', variant: 'dark', showCta: false },
            slots: {},
        });
        expect(stamped).not.toBeNull();
        expect(stamped!).toContain('Hello');
        expect(stamped!).toContain('card--dark');
        expect(stamped!).toContain('data-oid="a1~i123"');
        expect(stamped!).toContain('data-oid="c3~i123"');
        expect(stamped!).not.toContain('Learn more'); // showCta false
        expect(stamped!).toContain('data-weblab-component="weblab/components/card.html"');
        expect(stamped!).toContain('data-weblab-instance="i123"');
        expect(stamped!).toContain('src="/placeholder.png"'); // default
        expect(stamped!).toContain('Fallback body'); // slot fallback
        expect(stamped!).toContain('data-wb-slot-content="body"');
        expect(stamped!).not.toContain('data-weblab-manifest');
    });

    test('fills slots with instance content', () => {
        const stamped = stampInstance(MASTER, {
            componentKey: 'card',
            instanceId: 'i1',
            props: {},
            slots: { body: '<p data-oid="page1">Custom body</p>' },
        });
        expect(stamped!).toContain('Custom body');
        expect(stamped!).toContain('data-oid="page1"'); // page-native oid kept
        expect(stamped!).not.toContain('Fallback body');
    });
});

describe('restampPage', () => {
    const page = (inner: string) =>
        `<!doctype html><html><head><title>t</title></head><body>${inner}</body></html>`;

    test('re-renders instances from an edited master, preserving props/slots; idempotent', () => {
        const stamped = stampInstance(MASTER, {
            componentKey: 'weblab/components/card.html',
            instanceId: 'i9',
            props: { title: 'Mine' },
            slots: { body: '<p data-oid="pg7">Slot kept</p>' },
        })!;
        const pageContent = page(stamped);

        const editedMaster = MASTER.replace('class="card', 'class="card card--v2');
        const first = restampPage(pageContent, editedMaster, 'weblab/components/card.html');
        expect(first.changed).toBe(true);
        expect(first.content).toContain('card--v2');
        expect(first.content).toContain('Mine'); // per-instance prop preserved
        expect(first.content).toContain('Slot kept'); // slot content preserved
        expect(first.content).toContain('data-oid="a1~i9"'); // stable scoped oids

        const second = restampPage(first.content, editedMaster, 'weblab/components/card.html');
        expect(second.changed).toBe(false);
    });
});

describe('detach + strip', () => {
    test('detachInstanceHtml removes markers and re-oids the copy', () => {
        const stamped = stampInstance(MASTER, {
            componentKey: 'card',
            instanceId: 'i5',
            props: { title: 'Keep me' },
            slots: {},
        })!;
        const ast = htmlPipeline.parse(`<!doctype html><html><body>${stamped}</body></html>`)!;
        const detached = detachInstanceHtml(ast.root as never, 'i5');
        expect(detached).toBe(true);
        const out = serialize(ast.root as never);
        expect(out).toContain('Keep me');
        expect(out).not.toContain('data-weblab-component');
        expect(out).not.toContain('~i5');
    });

    test('stripComponentMarkers removes bookkeeping for publish', () => {
        const stamped = stampInstance(MASTER, {
            componentKey: 'card',
            instanceId: 'i6',
            props: {},
            slots: {},
        })!;
        const ast = htmlPipeline.parse(`<!doctype html><html><body>${stamped}</body></html>`)!;
        expect(stripComponentMarkers(ast.root as never)).toBe(true);
        const out = serialize(ast.root as never);
        expect(out).not.toContain('data-weblab-component');
        expect(out).not.toContain('data-wb-slot-content');
    });
});

describe('nested instances in slots', () => {
    test('outer slot scan skips nested-instance slot regions (no content loss on restamp)', () => {
        const inner = stampInstance(MASTER, {
            componentKey: 'weblab/components/inner.html',
            instanceId: 'inner1',
            props: { title: 'Inner title' },
            slots: { body: '<em data-oid="pg-em">inner content</em>' },
        })!;
        const outer = stampInstance(MASTER, {
            componentKey: 'weblab/components/card.html',
            instanceId: 'outer1',
            props: { title: 'Outer title' },
            slots: { body: `<span data-oid="pg-span">outer content</span>${inner}` },
        })!;
        const page = `<!doctype html><html><body>${outer}</body></html>`;

        const ast = htmlPipeline.parse(page)!;
        const found = findInstancesInPage(ast.root as never, 'weblab/components/card.html');
        expect(found).toHaveLength(1);
        // The outer instance's body slot must contain BOTH the span and the
        // whole nested instance — not be overwritten by the inner's region.
        expect(found[0]!.instance.slots.body).toContain('outer content');
        expect(found[0]!.instance.slots.body).toContain('inner content');
        expect(found[0]!.instance.slots.body).toContain('data-weblab-instance="inner1"');

        // Restamp the outer master: nested instance + span both survive.
        const result = restampPage(page, MASTER, 'weblab/components/card.html');
        expect(result.content).toContain('outer content');
        expect(result.content).toContain('inner content');
        expect(result.content).toContain('data-weblab-instance="inner1"');
    });
});

describe('extractHtmlComponent', () => {
    test('builds a master partial + stamped replacement', () => {
        const result = extractHtmlComponent({
            selectedHtml: '<div class="hero" data-oid="x1"><h1 data-oid="x2">Hi</h1></div>',
            componentKey: 'weblab/components/hero.html',
            componentName: 'Hero',
        });
        expect(result).not.toBeNull();
        expect(result!.masterContent).toContain('data-weblab-manifest');
        expect(result!.masterContent).toContain('"name": "Hero"');
        expect(result!.stamped).toContain(`data-oid="x1~${result!.instanceId}"`);
        expect(result!.stamped).toContain('data-weblab-component="weblab/components/hero.html"');
    });

    test('findInstancesInPage reads markers back', () => {
        const stamped = stampInstance(MASTER, {
            componentKey: 'card',
            instanceId: 'i7',
            props: { title: 'Read back' },
            slots: {},
        })!;
        const ast = htmlPipeline.parse(`<!doctype html><html><body>${stamped}</body></html>`)!;
        const found = findInstancesInPage(ast.root as never);
        expect(found).toHaveLength(1);
        expect(found[0]!.instance.instanceId).toBe('i7');
        expect(found[0]!.instance.props.title).toBe('Read back');
        expect(Object.keys(found[0]!.instance.slots)).toEqual(['body']);
    });
});
