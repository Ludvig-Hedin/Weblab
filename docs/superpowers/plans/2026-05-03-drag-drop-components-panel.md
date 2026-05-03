# Drag-and-Drop Components Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Components Panel tab to the editor's left sidebar with two sections: (1) pre-built UI component templates with nested structure, and (2) auto-discovered user React components from the project, both draggable onto the canvas.

**Architecture:** Pre-built templates extend the existing `DropElementProperties` / native HTML5 drag-and-drop pipeline by adding a `children` field for recursive element insertion. User components use a new tRPC endpoint that parses `.tsx`/`.jsx` source files via Babel, returning discovered React component names; a new `application/weblab-component` MIME type carries the drag payload; the canvas drop handler and a new `insertDroppedComponent` action inject the JSX element + import statement into the target page file.

**Tech Stack:** Next.js App Router, MobX (`observer`), tRPC + Zod, `@babel/parser` + `@babel/traverse`, native HTML5 drag-and-drop, `@weblab/models`, `@weblab/ui`

---

## Context

`LeftPanelTabValue.COMPONENTS` already exists in `packages/models/src/editor/index.ts` and the `"components"` i18n key exists in `messages/en.json` — both are unused placeholders. The INSERT tab already has a complete drag-and-drop implementation (`handlePresetDragStart` + `gesture.tsx:handleDrop` + `insert/index.ts:insertDroppedElement`) that this feature reuses and extends.

---

## File Map

**Create:**
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx` — Main `ComponentsTab` component (templates + user components)
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/component-card.tsx` — Draggable user component card
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/templates.ts` — Pre-built template definitions
- `apps/web/server/src/api/routers/components.ts` — tRPC router + `extractReactComponents` scanner
- `apps/web/server/src/api/routers/__tests__/components.test.ts` — Unit tests for scanner

**Modify:**
- `apps/web/client/src/components/hotkey.ts` — Add `SIDEBAR_COMPONENTS = new Hotkey('alt+7', 'Components')`
- `apps/web/client/messages/en.json` — Change `"components": "Elements"` → `"components": "Components"`
- `packages/models/src/element/element.ts` — Add `children?: DropElementProperties[]` + `ComponentInsertData` interface
- `packages/models/src/actions/` _(find via grep for `ActionType`)_ — Add `INSERT_COMPONENT` action type + interface
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx` — Wire up the new tab (icon, hotkey, label, render)
- `apps/web/client/src/components/store/editor/insert/index.ts` — Extend `insertDroppedElement` for children + add `insertDroppedComponent`
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx` — Handle `application/weblab-component` drop
- `apps/web/server/src/api/root.ts` — Register `componentsRouter`

---

## Task 1: Wire up the Components tab

**Files:**
- Modify: `apps/web/client/src/components/hotkey.ts`
- Modify: `apps/web/client/messages/en.json`
- Create: `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx`
- Modify: `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx`

- [ ] **Step 1: Add SIDEBAR_COMPONENTS hotkey**

In `apps/web/client/src/components/hotkey.ts`, after the last `SIDEBAR_*` line, add:
```typescript
static readonly SIDEBAR_COMPONENTS = new Hotkey('alt+7', 'Components');
```

- [ ] **Step 2: Fix translation label**

In `apps/web/client/messages/en.json`, under `editor.panels.layers.tabs`, change:
```json
"components": "Elements"
```
to:
```json
"components": "Components"
```

- [ ] **Step 3: Create the ComponentsTab scaffold**

Create `components-tab/index.tsx`:
```typescript
'use client';
import { observer } from 'mobx-react-lite';

export const ComponentsTab = observer(() => {
    return (
        <div className="text-active flex h-full w-full flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-foreground-primary text-sm font-medium">Components</span>
            </div>
            <div className="flex-1 overflow-auto px-3 pb-4">
                {/* Sections added in later tasks */}
            </div>
        </div>
    );
});
```

- [ ] **Step 4: Add the tab to design-panel/index.tsx**

At the top of the file, add the import:
```typescript
import { ComponentsTab } from './components-tab';
```

In the `tabs` array (after the INSERT entry), add:
```typescript
{
    value: LeftPanelTabValue.COMPONENTS,
    icon: <Icons.Component className="h-5 w-5" />,
    hotkey: Hotkey.SIDEBAR_COMPONENTS,
},
```

In the `getTabLabel` switch, add:
```typescript
case LeftPanelTabValue.COMPONENTS:
    return t(transKeys.editor.panels.layers.tabs.components);
```

In the content panel rendering block, add alongside the other tab conditionals:
```typescript
{selectedTab === LeftPanelTabValue.COMPONENTS && <ComponentsTab />}
```

- [ ] **Step 5: Run typecheck**

Run: `bun typecheck`
Expected: 0 errors

- [ ] **Step 6: Verify tab appears**

Start dev server (`bun dev`). Open the editor. Confirm the Components tab icon appears in the left sidebar and clicking it opens a blank panel. Confirm `alt+7` toggles it.

- [ ] **Step 7: Commit**

```bash
git add apps/web/client/src/components/hotkey.ts
git add apps/web/client/messages/en.json
git add "apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx"
git add "apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx"
git commit -m "feat: add Components tab scaffold to design panel left sidebar"
```

---

## Task 2: Extend DropElementProperties for nested children

**Files:**
- Modify: `packages/models/src/element/element.ts`
- Modify: `apps/web/client/src/components/store/editor/insert/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/models/src/element/__tests__/drop-properties.test.ts` (find existing test directory first with `find packages/models -name '*.test.ts' | head -3`):
```typescript
import { describe, it, expect } from 'bun:test';
import type { DropElementProperties } from '../element';

describe('DropElementProperties.children', () => {
    it('accepts a nested children array', () => {
        const template: DropElementProperties = {
            tagName: 'section',
            styles: { padding: '4rem' },
            textContent: null,
            children: [
                { tagName: 'h1', styles: {}, textContent: 'Title' },
                { tagName: 'p',  styles: {}, textContent: 'Body' },
            ],
        };
        expect(template.children).toHaveLength(2);
        expect(template.children![0].tagName).toBe('h1');
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `bun test packages/models`
Expected: FAIL — `children` does not exist on type

- [ ] **Step 3: Add `children` to DropElementProperties**

In `packages/models/src/element/element.ts`, update the interface:
```typescript
export interface DropElementProperties {
    tagName: string;
    styles: Record<string, string>;
    textContent: string | null;
    attributes?: Record<string, string>;
    children?: DropElementProperties[];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test packages/models`
Expected: PASS

- [ ] **Step 5: Read insertDroppedElement before modifying**

Read `apps/web/client/src/components/store/editor/insert/index.ts` lines 516-569 (the full `insertDroppedElement` body). Note the `domId` of the newly inserted element — this is the parent ID needed for child insertion.

- [ ] **Step 6: Extend insertDroppedElement with recursive child insertion**

After the existing insertion logic produces `rootDomId`, add (right before the function returns):
```typescript
if (properties.children?.length && frame.view) {
    await this.insertChildElements(frame, rootDomId, properties.children);
}
```

Add the private helper:
```typescript
private async insertChildElements(
    frame: FrameData,
    parentDomId: string,
    children: DropElementProperties[],
): Promise<void> {
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childDomId = generateId(); // use the same ID generator as the existing code
        const childOid = generateOid();

        const childElement: ActionElement = {
            domId: childDomId,
            oid: childOid,
            tagName: child.tagName,
            styles: child.styles,
            textContent: child.textContent,
            attributes: {
                ...child.attributes,
                [EditorAttributes.DATA_WEBLAB_ID]: childOid,
                [EditorAttributes.DATA_WEBLAB_DOM_ID]: childDomId,
                [EditorAttributes.DATA_WEBLAB_INSERTED]: 'true',
            },
        };

        const insertAction: InsertElementAction = {
            type: ActionType.INSERT_ELEMENT,
            element: childElement,
            location: { domId: parentDomId, index: i },
            editText: null,
            pasteParams: null,
        };

        await this.editorEngine.action.run(insertAction);

        if (child.children?.length) {
            await this.insertChildElements(frame, childDomId, child.children);
        }
    }
}
```

**Note:** Verify the exact `InsertElementAction.location` shape by reading the models. It may use `{ parentDomId, index }` or similar — match the existing code.

- [ ] **Step 7: Run typecheck**

Run: `bun typecheck`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add packages/models/src/element/element.ts
git add "apps/web/client/src/components/store/editor/insert/index.ts"
git add packages/models/src/element/__tests__/drop-properties.test.ts
git commit -m "feat: extend DropElementProperties with children for nested template insertion"
```

---

## Task 3: Define pre-built component templates

**Files:**
- Create: `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/templates.ts`

- [ ] **Step 1: Create templates.ts**

Create `components-tab/templates.ts`:
```typescript
import type { DropElementProperties } from '@weblab/models/element';

export type TemplateCategory = 'sections' | 'content' | 'navigation' | 'forms';

export interface ComponentTemplate {
    key: string;
    label: string;
    description: string;
    category: TemplateCategory;
    properties: DropElementProperties;
}

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
    { value: 'sections', label: 'Sections' },
    { value: 'content', label: 'Content' },
    { value: 'navigation', label: 'Navigation' },
    { value: 'forms', label: 'Forms' },
];

export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
    {
        key: 'hero-centered',
        label: 'Hero',
        description: 'Centered hero with heading, body text, and CTA button',
        category: 'sections',
        properties: {
            tagName: 'section',
            styles: {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '5rem 2rem',
                textAlign: 'center', gap: '1.5rem',
            },
            textContent: null,
            children: [
                {
                    tagName: 'h1',
                    styles: { fontSize: '3rem', fontWeight: '700', lineHeight: '1.2' },
                    textContent: 'Build something great',
                },
                {
                    tagName: 'p',
                    styles: { fontSize: '1.125rem', color: '#6b7280', maxWidth: '32rem' },
                    textContent: 'Start with a solid foundation and build your vision faster.',
                },
                {
                    tagName: 'button',
                    styles: {
                        padding: '0.75rem 2rem', backgroundColor: '#000', color: '#fff',
                        borderRadius: '0.5rem', fontSize: '1rem', fontWeight: '500',
                        cursor: 'pointer', border: 'none',
                    },
                    textContent: 'Get started',
                },
            ],
        },
    },
    {
        key: 'cta-section',
        label: 'CTA Section',
        description: 'Call-to-action with heading and two buttons',
        category: 'sections',
        properties: {
            tagName: 'section',
            styles: {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '2rem', padding: '4rem 2rem',
                backgroundColor: '#f9fafb', textAlign: 'center',
            },
            textContent: null,
            children: [
                {
                    tagName: 'h2',
                    styles: { fontSize: '2.25rem', fontWeight: '700' },
                    textContent: 'Ready to get started?',
                },
                {
                    tagName: 'p',
                    styles: { fontSize: '1rem', color: '#6b7280', maxWidth: '28rem' },
                    textContent: 'Join thousands of teams already using our platform.',
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'button',
                            styles: {
                                padding: '0.75rem 1.75rem', backgroundColor: '#000', color: '#fff',
                                borderRadius: '0.5rem', fontWeight: '500', border: 'none', cursor: 'pointer',
                            },
                            textContent: 'Start for free',
                        },
                        {
                            tagName: 'button',
                            styles: {
                                padding: '0.75rem 1.75rem', backgroundColor: 'transparent', color: '#000',
                                borderRadius: '0.5rem', fontWeight: '500', border: '1px solid #000', cursor: 'pointer',
                            },
                            textContent: 'Learn more',
                        },
                    ],
                },
            ],
        },
    },
    {
        key: 'feature-card',
        label: 'Feature Card',
        description: 'Card with icon placeholder, title, and description',
        category: 'content',
        properties: {
            tagName: 'div',
            styles: {
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
                padding: '1.5rem', borderRadius: '0.75rem',
                border: '1px solid #e5e7eb', backgroundColor: '#fff',
            },
            textContent: null,
            children: [
                {
                    tagName: 'div',
                    styles: {
                        width: '2.5rem', height: '2.5rem',
                        borderRadius: '0.5rem', backgroundColor: '#f3f4f6',
                    },
                    textContent: null,
                },
                {
                    tagName: 'h3',
                    styles: { fontSize: '1.125rem', fontWeight: '600' },
                    textContent: 'Feature title',
                },
                {
                    tagName: 'p',
                    styles: { fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.5' },
                    textContent: 'Describe what makes this feature valuable to your users.',
                },
            ],
        },
    },
    {
        key: 'testimonial-card',
        label: 'Testimonial',
        description: 'Quote with author name, title, and avatar placeholder',
        category: 'content',
        properties: {
            tagName: 'div',
            styles: {
                display: 'flex', flexDirection: 'column', gap: '1rem',
                padding: '1.5rem', borderRadius: '0.75rem',
                border: '1px solid #e5e7eb', backgroundColor: '#fff',
            },
            textContent: null,
            children: [
                {
                    tagName: 'p',
                    styles: { fontSize: '0.875rem', color: '#374151', lineHeight: '1.6', fontStyle: 'italic' },
                    textContent: '"This product completely changed how our team works. Highly recommend."',
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
                    textContent: null,
                    children: [
                        {
                            tagName: 'div',
                            styles: { width: '2.5rem', height: '2.5rem', borderRadius: '50%', backgroundColor: '#e5e7eb' },
                            textContent: null,
                        },
                        {
                            tagName: 'div',
                            styles: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
                            textContent: null,
                            children: [
                                { tagName: 'span', styles: { fontSize: '0.875rem', fontWeight: '600' }, textContent: 'Jane Smith' },
                                { tagName: 'span', styles: { fontSize: '0.75rem', color: '#9ca3af' }, textContent: 'CEO at Acme' },
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        key: 'pricing-card',
        label: 'Pricing Card',
        description: 'Pricing tier with price, features list, and CTA button',
        category: 'content',
        properties: {
            tagName: 'div',
            styles: {
                display: 'flex', flexDirection: 'column', gap: '1.25rem',
                padding: '2rem', borderRadius: '0.75rem',
                border: '1px solid #e5e7eb', backgroundColor: '#fff', maxWidth: '22rem',
            },
            textContent: null,
            children: [
                { tagName: 'h3', styles: { fontSize: '1.125rem', fontWeight: '600' }, textContent: 'Pro' },
                {
                    tagName: 'div',
                    styles: { display: 'flex', alignItems: 'baseline', gap: '0.25rem' },
                    textContent: null,
                    children: [
                        { tagName: 'span', styles: { fontSize: '2.5rem', fontWeight: '700' }, textContent: '$29' },
                        { tagName: 'span', styles: { fontSize: '0.875rem', color: '#6b7280' }, textContent: '/month' },
                    ],
                },
                {
                    tagName: 'ul',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.625rem', paddingLeft: '0', listStyle: 'none' },
                    textContent: null,
                    children: [
                        { tagName: 'li', styles: { fontSize: '0.875rem' }, textContent: '✓ Unlimited projects' },
                        { tagName: 'li', styles: { fontSize: '0.875rem' }, textContent: '✓ Priority support' },
                        { tagName: 'li', styles: { fontSize: '0.875rem' }, textContent: '✓ Custom domain' },
                    ],
                },
                {
                    tagName: 'button',
                    styles: {
                        padding: '0.75rem', backgroundColor: '#000', color: '#fff',
                        borderRadius: '0.5rem', fontWeight: '500', border: 'none',
                        cursor: 'pointer', width: '100%',
                    },
                    textContent: 'Get started',
                },
            ],
        },
    },
    {
        key: 'stats-row',
        label: 'Stats Row',
        description: 'Three stat numbers with labels in a row',
        category: 'sections',
        properties: {
            tagName: 'div',
            styles: {
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '2rem', padding: '3rem 2rem', textAlign: 'center',
            },
            textContent: null,
            children: [
                {
                    tagName: 'div',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
                    textContent: null,
                    children: [
                        { tagName: 'span', styles: { fontSize: '2.25rem', fontWeight: '700' }, textContent: '10k+' },
                        { tagName: 'span', styles: { fontSize: '0.875rem', color: '#6b7280' }, textContent: 'Users' },
                    ],
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
                    textContent: null,
                    children: [
                        { tagName: 'span', styles: { fontSize: '2.25rem', fontWeight: '700' }, textContent: '99%' },
                        { tagName: 'span', styles: { fontSize: '0.875rem', color: '#6b7280' }, textContent: 'Uptime' },
                    ],
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
                    textContent: null,
                    children: [
                        { tagName: 'span', styles: { fontSize: '2.25rem', fontWeight: '700' }, textContent: '24/7' },
                        { tagName: 'span', styles: { fontSize: '0.875rem', color: '#6b7280' }, textContent: 'Support' },
                    ],
                },
            ],
        },
    },
    {
        key: 'simple-navbar',
        label: 'Navbar',
        description: 'Navigation bar with logo placeholder and nav links',
        category: 'navigation',
        properties: {
            tagName: 'nav',
            styles: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 2rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fff',
            },
            textContent: null,
            children: [
                {
                    tagName: 'span',
                    styles: { fontSize: '1.125rem', fontWeight: '700' },
                    textContent: 'Logo',
                },
                {
                    tagName: 'div',
                    styles: { display: 'flex', gap: '2rem', alignItems: 'center' },
                    textContent: null,
                    children: [
                        { tagName: 'a', styles: { fontSize: '0.875rem', color: '#374151', textDecoration: 'none' }, textContent: 'Features', attributes: { href: '#' } },
                        { tagName: 'a', styles: { fontSize: '0.875rem', color: '#374151', textDecoration: 'none' }, textContent: 'Pricing', attributes: { href: '#' } },
                        { tagName: 'a', styles: { fontSize: '0.875rem', color: '#374151', textDecoration: 'none' }, textContent: 'Docs', attributes: { href: '#' } },
                        {
                            tagName: 'button',
                            styles: {
                                padding: '0.5rem 1.25rem', backgroundColor: '#000', color: '#fff',
                                borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: '500',
                                border: 'none', cursor: 'pointer',
                            },
                            textContent: 'Sign up',
                        },
                    ],
                },
            ],
        },
    },
];
```

- [ ] **Step 2: Run typecheck**

Run: `bun typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add "apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/templates.ts"
git commit -m "feat: add pre-built component template definitions (Hero, CTA, Card, Pricing, Navbar)"
```

---

## Task 4: Build ComponentsTab — Templates section

**Files:**
- Modify: `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx`

- [ ] **Step 1: Replace scaffold with full Templates UI**

Replace the entire file `components-tab/index.tsx` with:
```typescript
'use client';
import { useCallback, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { DropElementProperties } from '@weblab/models/element';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import type { ComponentTemplate } from './templates';
import { COMPONENT_TEMPLATES, TEMPLATE_CATEGORIES } from './templates';

export const ComponentsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const filteredTemplates = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return COMPONENT_TEMPLATES;
        return COMPONENT_TEMPLATES.filter((t) =>
            [t.label, t.description, t.key].join(' ').toLowerCase().includes(q),
        );
    }, [searchQuery]);

    const groupedTemplates = useMemo(() => {
        const groups: Record<string, ComponentTemplate[]> = {};
        for (const t of filteredTemplates) {
            (groups[t.category] ??= []).push(t);
        }
        return groups;
    }, [filteredTemplates]);

    const handleTemplateDragStart = useCallback(
        (event: React.DragEvent<HTMLButtonElement>, properties: DropElementProperties) => {
            event.dataTransfer.setData('application/json', JSON.stringify(properties));
            event.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    const handleTemplateClick = useCallback(
        (template: ComponentTemplate) => {
            editorEngine.state.setPendingInsertElement(template.properties);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            toast('Click on the canvas to place this component.');
        },
        [editorEngine.state],
    );

    return (
        <div className="text-active flex h-full w-full flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-foreground-primary text-sm font-medium">Components</span>
            </div>

            <div className="px-3 pb-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        className="h-8 pr-8 pl-7 text-xs"
                        placeholder="Search templates"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground-primary absolute top-1/2 right-2 -translate-y-1/2"
                            onClick={() => setSearchQuery('')}
                        >
                            <Icons.CrossS className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto px-3 pb-4">
                <div className="flex flex-col gap-3">
                    {TEMPLATE_CATEGORIES.map(({ value, label }) => {
                        const templates = groupedTemplates[value] ?? [];
                        if (templates.length === 0) return null;
                        const isCollapsed = collapsed[value];
                        return (
                            <div key={value} className="flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    className="text-foreground-primary flex w-full items-center justify-between px-1 py-1 text-sm font-medium"
                                    onClick={() =>
                                        setCollapsed((p) => ({ ...p, [value]: !p[value] }))
                                    }
                                    aria-expanded={!isCollapsed}
                                >
                                    <span>{label}</span>
                                    <Icons.ChevronDown
                                        className={cn(
                                            'text-muted-foreground h-3.5 w-3.5 transition-transform',
                                            isCollapsed && '-rotate-90',
                                        )}
                                    />
                                </button>
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {templates.map((template) => (
                                            <TemplateCard
                                                key={template.key}
                                                template={template}
                                                onDragStart={handleTemplateDragStart}
                                                onClick={handleTemplateClick}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {filteredTemplates.length === 0 && (
                        <div className="text-muted-foreground flex items-center justify-center py-12 text-xs">
                            No matching templates
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

interface TemplateCardProps {
    template: ComponentTemplate;
    onDragStart: (e: React.DragEvent<HTMLButtonElement>, p: DropElementProperties) => void;
    onClick: (t: ComponentTemplate) => void;
}

const TemplateCard = ({ template, onDragStart, onClick }: TemplateCardProps) => (
    <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, template.properties)}
        onClick={() => onClick(template)}
        title={template.description}
        className="group bg-background-secondary/40 hover:bg-background-onlook border-border-primary/40 hover:border-border-primary relative flex aspect-video flex-col items-center justify-center gap-1.5 rounded-lg border p-2 transition-colors"
    >
        <Icons.Component className="text-foreground-primary h-5 w-5" />
        <span className="text-foreground-primary line-clamp-1 text-[11px]">{template.label}</span>
    </button>
);
```

- [ ] **Step 2: Run typecheck**

Run: `bun typecheck`
Expected: 0 errors

- [ ] **Step 3: Test template drag-and-drop**

Start dev server. Open any project in the editor. Open the Components tab (alt+7 or click icon). Drag the "Hero" template card onto the canvas. Verify:
- A `<section>` appears with nested `<h1>`, `<p>`, and `<button>` children
- All child elements are individually selectable in the layers panel
- Clicking a card shows the toast and lets you click-to-place on the canvas

- [ ] **Step 4: Commit**

```bash
git add "apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx"
git commit -m "feat: add Components tab with pre-built template grid and drag-and-drop"
```

---

## Task 5: Server-side user component scanner

**Files:**
- Read first: any existing file in `apps/web/server/src/api/routers/` to learn the exact tRPC pattern
- Read first: `apps/web/server/src/api/root.ts` to see router registration
- Create: `apps/web/server/src/api/routers/components.ts`
- Create: `apps/web/server/src/api/routers/__tests__/components.test.ts`
- Modify: `apps/web/server/src/api/root.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/server/src/api/routers/__tests__/components.test.ts`:
```typescript
import { describe, it, expect } from 'bun:test';
import { extractReactComponents } from '../components';

describe('extractReactComponents', () => {
    it('extracts named export function components', () => {
        const source = `
            export function HeroSection() {
                return <div>Hero</div>;
            }
        `;
        const result = extractReactComponents(source, 'src/components/hero.tsx');
        expect(result).toEqual([
            { name: 'HeroSection', filePath: 'src/components/hero.tsx', exportType: 'named' },
        ]);
    });

    it('extracts named export arrow components', () => {
        const source = `
            export const PricingCard = () => <div>Pricing</div>;
        `;
        const result = extractReactComponents(source, 'src/components/pricing.tsx');
        expect(result).toEqual([
            { name: 'PricingCard', filePath: 'src/components/pricing.tsx', exportType: 'named' },
        ]);
    });

    it('extracts default export function components', () => {
        const source = `
            export default function HomePage() {
                return <main>Home</main>;
            }
        `;
        const result = extractReactComponents(source, 'src/app/page.tsx');
        expect(result).toEqual([
            { name: 'HomePage', filePath: 'src/app/page.tsx', exportType: 'default' },
        ]);
    });

    it('ignores lowercase (non-component) functions', () => {
        const source = `
            export function formatDate(d: Date) { return d.toISOString(); }
        `;
        const result = extractReactComponents(source, 'src/utils/format.ts');
        expect(result).toHaveLength(0);
    });

    it('returns empty array for unparseable source', () => {
        const result = extractReactComponents('this is not valid JS {{{{', 'src/bad.tsx');
        expect(result).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test apps/web/server/src/api/routers/__tests__/components.test.ts`
Expected: FAIL — `extractReactComponents` not found

- [ ] **Step 3: Implement the component scanner**

Create `apps/web/server/src/api/routers/components.ts` (read an existing router first to match exact `protectedProcedure` / `router` import paths for this server):
```typescript
import { readdir, readFile } from 'fs/promises';
import { join, extname, relative, dirname } from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc'; // match exact import in existing routers

export interface DiscoveredComponent {
    name: string;
    filePath: string;
    exportType: 'default' | 'named';
}

export function extractReactComponents(source: string, filePath: string): DiscoveredComponent[] {
    const results: DiscoveredComponent[] = [];
    let ast;
    try {
        ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch {
        return results;
    }

    const namedComponents = new Set<string>();

    traverse(ast, {
        ExportNamedDeclaration(path) {
            const decl = path.node.declaration;
            if (
                decl?.type === 'FunctionDeclaration' &&
                decl.id?.name &&
                /^[A-Z]/.test(decl.id.name)
            ) {
                namedComponents.add(decl.id.name);
                results.push({ name: decl.id.name, filePath, exportType: 'named' });
            }
            if (decl?.type === 'VariableDeclaration') {
                for (const declarator of decl.declarations) {
                    if (
                        declarator.id.type === 'Identifier' &&
                        /^[A-Z]/.test(declarator.id.name) &&
                        (declarator.init?.type === 'ArrowFunctionExpression' ||
                            declarator.init?.type === 'FunctionExpression')
                    ) {
                        namedComponents.add(declarator.id.name);
                        results.push({ name: declarator.id.name, filePath, exportType: 'named' });
                    }
                }
            }
        },
        ExportDefaultDeclaration(path) {
            const decl = path.node.declaration;
            if (
                decl.type === 'FunctionDeclaration' &&
                decl.id?.name &&
                /^[A-Z]/.test(decl.id.name)
            ) {
                results.push({ name: decl.id.name, filePath, exportType: 'default' });
            }
            // `export default ComponentName` (identifier reference)
            if (decl.type === 'Identifier' && /^[A-Z]/.test(decl.name)) {
                const existing = results.find((r) => r.name === decl.name);
                if (existing) {
                    existing.exportType = 'default';
                } else {
                    results.push({ name: decl.name, filePath, exportType: 'default' });
                }
            }
        },
    });

    return results;
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '__tests__', 'test']);

async function scanDirectory(dir: string, projectRoot: string): Promise<DiscoveredComponent[]> {
    const results: DiscoveredComponent[] = [];

    async function walk(current: string) {
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) await walk(join(current, entry.name));
            } else if (['.tsx', '.jsx'].includes(extname(entry.name))) {
                const fullPath = join(current, entry.name);
                try {
                    const source = await readFile(fullPath, 'utf-8');
                    const relPath = relative(projectRoot, fullPath);
                    results.push(...extractReactComponents(source, relPath));
                } catch {
                    // skip unreadable files
                }
            }
        }
    }

    await walk(dir);
    return results;
}

export const componentsRouter = router({
    listProjectComponents: protectedProcedure
        .input(z.object({ projectRoot: z.string().min(1) }))
        .query(async ({ input }) => {
            const srcDir = join(input.projectRoot, 'src');
            return scanDirectory(srcDir, input.projectRoot);
        }),
});
```

- [ ] **Step 4: Run tests**

Run: `bun test apps/web/server/src/api/routers/__tests__/components.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Register router**

In `apps/web/server/src/api/root.ts`, add:
```typescript
import { componentsRouter } from './routers/components';

export const appRouter = router({
    // ... existing routers ...
    components: componentsRouter,
});
```

- [ ] **Step 6: Run full test suite + typecheck**

Run: `bun test && bun typecheck`
Expected: All pass, 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/server/src/api/routers/components.ts
git add "apps/web/server/src/api/routers/__tests__/components.test.ts"
git add apps/web/server/src/api/root.ts
git commit -m "feat: add tRPC components router with Babel-based React component scanner"
```

---

## Task 6: "My Components" section in ComponentsTab

**Files:**
- Add type to: `packages/models/src/element/element.ts`
- Create: `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/component-card.tsx`
- Modify: `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx`

- [ ] **Step 1: Add ComponentInsertData type to models**

In `packages/models/src/element/element.ts`, add:
```typescript
export interface ComponentInsertData {
    componentName: string;
    filePath: string;
    exportType: 'default' | 'named';
}
```

- [ ] **Step 2: Create component-card.tsx**

Create `components-tab/component-card.tsx`:
```typescript
import { Icons } from '@weblab/ui/icons';
import type { ComponentInsertData } from '@weblab/models/element';

interface ComponentCardProps {
    data: ComponentInsertData;
    onDragStart: (e: React.DragEvent<HTMLButtonElement>, data: ComponentInsertData) => void;
    onClick: (data: ComponentInsertData) => void;
}

export const ComponentCard = ({ data, onDragStart, onClick }: ComponentCardProps) => (
    <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, data)}
        onClick={() => onClick(data)}
        title={data.filePath}
        className="group bg-background-secondary/40 hover:bg-background-onlook border-border-primary/40 hover:border-border-primary flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors"
    >
        <Icons.Component className="text-foreground-primary h-4 w-4 flex-shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-foreground-primary line-clamp-1 text-[11px] font-medium">
                {data.componentName}
            </span>
            <span className="text-muted-foreground line-clamp-1 text-[10px]">{data.filePath}</span>
        </div>
    </button>
);
```

- [ ] **Step 3: Find where projectRoot is stored**

Run: `grep -r "projectRoot\|project_root\|projectPath" apps/web/client/src/components/store/editor --include="*.ts" --include="*.tsx" -l`

Read the relevant file(s) to understand how to get the current project's root path. This may be stored in `editorEngine.state`, `editorEngine.project`, or passed via URL params. Adjust the tRPC query input in the next step accordingly.

- [ ] **Step 4: Add "My Components" section to ComponentsTab**

At the top of `components-tab/index.tsx`, add imports:
```typescript
import { api } from '@/trpc/react';
import type { ComponentInsertData } from '@weblab/models/element';
import { ComponentCard } from './component-card';
```

Inside `ComponentsTab`, add the query (adjust `projectRoot` source from Step 3):
```typescript
const projectRoot = editorEngine.state.projectRoot ?? ''; // adjust based on Step 3 findings
const { data: userComponents, isLoading: isLoadingComponents } =
    api.components.listProjectComponents.useQuery(
        { projectRoot },
        { enabled: Boolean(projectRoot) },
    );
```

Add drag/click handlers for user components:
```typescript
const handleComponentDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, data: ComponentInsertData) => {
        e.dataTransfer.setData('application/weblab-component', JSON.stringify(data));
        e.dataTransfer.effectAllowed = 'copy';
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
    },
    [editorEngine.state],
);

const handleComponentClick = useCallback(
    (data: ComponentInsertData) => {
        // Stored and handled in Task 7
        editorEngine.insert.setPendingComponentInsert(data);
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
        toast('Click on the canvas to place this component.');
    },
    [editorEngine],
);
```

Add the "My Components" section at the top of the scrollable content area (before the templates):
```tsx
{/* My Components */}
<div className="mb-4 flex flex-col gap-1.5">
    <span className="text-foreground-primary px-1 py-1 text-sm font-medium">My Components</span>
    {isLoadingComponents ? (
        <p className="text-muted-foreground px-1 py-4 text-center text-xs">Scanning project…</p>
    ) : !userComponents?.length ? (
        <p className="text-muted-foreground px-1 py-4 text-center text-xs">
            No components found in src/
        </p>
    ) : (
        <div className="flex flex-col gap-1">
            {userComponents.map((comp) => (
                <ComponentCard
                    key={`${comp.filePath}:${comp.name}`}
                    data={comp}
                    onDragStart={handleComponentDragStart}
                    onClick={handleComponentClick}
                />
            ))}
        </div>
    )}
</div>

{/* Templates — existing section below */}
```

- [ ] **Step 5: Run typecheck**

Run: `bun typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add packages/models/src/element/element.ts
git add "apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/component-card.tsx"
git add "apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx"
git commit -m "feat: add My Components section with user project component discovery"
```

---

## Task 7: Canvas drop handling and React component insertion

> **Important:** This task involves deep integration with the action execution pipeline. Read every file listed below fully before modifying them.

**Files to read before starting:**
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx` (full)
- `apps/web/client/src/components/store/editor/insert/index.ts` (full)
- Search for `ActionType` definition: `grep -r "ActionType" packages/models/src --include="*.ts" -l`
- The action runner: search for `case ActionType.INSERT_ELEMENT` to find where actions are dispatched

**Files:**
- Modify: `packages/models/src/actions/` _(the file containing `ActionType`)_
- Modify: `apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx`
- Modify: `apps/web/client/src/components/store/editor/insert/index.ts`
- Modify: the action runner file (found via grep above)

- [ ] **Step 1: Add INSERT_COMPONENT action type**

In the file containing `ActionType` enum, add:
```typescript
INSERT_COMPONENT = 'insert-component',
```

In the file containing action interfaces, add:
```typescript
export interface InsertComponentAction {
    type: ActionType.INSERT_COMPONENT;
    location: InsertLocation; // match the shape used by InsertElementAction
    componentName: string;
    importPath: string;
    exportType: 'default' | 'named';
    oid: string;
}
```

Add `InsertComponentAction` to the `Action` union type.

- [ ] **Step 2: Handle component drop in gesture.tsx**

In `gesture.tsx`, find `handleDrop`. After the existing `application/json` parsing block, add:
```typescript
const componentJson = event.dataTransfer.getData('application/weblab-component');
if (componentJson) {
    try {
        const data: ComponentInsertData = JSON.parse(componentJson);
        // use the same frameData and dropPosition extraction pattern already in handleDrop
        await editorEngine.insert.insertDroppedComponent(frameData, dropPosition, data);
    } catch (e) {
        console.error('Failed to insert component', e);
    }
    return;
}
```

Import `ComponentInsertData` from `@weblab/models/element`.

- [ ] **Step 3: Add setPendingComponentInsert to insert store**

In `insert/index.ts`, add an observable and setter:
```typescript
@observable pendingComponentInsert: ComponentInsertData | null = null;

setPendingComponentInsert(data: ComponentInsertData | null) {
    this.pendingComponentInsert = data;
}
```

In the canvas click handler (search for where `pendingInsertElement` is consumed on canvas click — likely in `gesture.tsx` or a click handler in the frames store), add analogous handling for `pendingComponentInsert` that calls `insertDroppedComponent` at the clicked position.

- [ ] **Step 4: Implement insertDroppedComponent**

In `insert/index.ts`, add:
```typescript
async insertDroppedComponent(
    frame: FrameData,
    dropPosition: { x: number; y: number },
    data: ComponentInsertData,
): Promise<void> {
    if (!frame.view) return;

    const insertLocation = await frame.view.getInsertLocation(dropPosition.x, dropPosition.y);
    if (!insertLocation) return;

    // Determine the target file from the element at the insert location
    const targetFile = await this.getTargetFileForLocation(insertLocation);
    if (!targetFile) {
        console.warn('Could not determine target file for component insertion');
        return;
    }

    const importPath = computeRelativeImportPath(targetFile, data.filePath);

    const action: InsertComponentAction = {
        type: ActionType.INSERT_COMPONENT,
        location: insertLocation,
        componentName: data.componentName,
        importPath,
        exportType: data.exportType,
        oid: generateOid(), // use the same generator as existing insertion code
    };

    await this.editorEngine.action.run(action);
    this.pendingComponentInsert = null;
}

private async getTargetFileForLocation(location: InsertLocation): Promise<string | null> {
    // Read the existing code that resolves oid → source file path
    // This is likely via editorEngine.ast or the code panel's file resolution
    // Search for: this.editorEngine.ast.getFileForOid or similar
    return null; // replace with actual implementation after reading the code
}
```

Add the import path helper:
```typescript
function computeRelativeImportPath(fromFile: string, toComponentFile: string): string {
    const path = require('path') as typeof import('path');
    let rel = path.relative(path.dirname(fromFile), toComponentFile);
    rel = rel.replace(/\.(tsx|ts|jsx|js)$/, '');
    return rel.startsWith('.') ? rel : './' + rel;
}
```

- [ ] **Step 5: Handle INSERT_COMPONENT in the action runner**

In the action runner (found in Step 1's grep), add a case for `ActionType.INSERT_COMPONENT`:
```typescript
case ActionType.INSERT_COMPONENT: {
    const { componentName, importPath, exportType, location, oid } = action;
    // 1. Get the source file for the location
    const sourceFile = await this.getSourceFileForLocation(location);
    // 2. Use @weblab/parser to add the import statement to the source file
    //    Import: `import { ComponentName } from './importPath'`
    //    or `import ComponentName from './importPath'` for default exports
    // 3. Insert `<ComponentName />` at the JSX location
    // 4. Save the file and trigger reload
    //
    // NOTE: Read the existing INSERT_ELEMENT case handler fully before implementing.
    // The AST mutation pattern is established there — replicate it for JSX self-closing tag insertion.
    break;
}
```

**Note:** This step requires deep understanding of how `@weblab/parser` mutates JSX ASTs. Read the parser package and the existing INSERT_ELEMENT action handler first. If import injection is not already supported, add a `addImportToFile(ast, importName, importPath, exportType)` helper to `@weblab/parser`.

- [ ] **Step 6: End-to-end manual test**

Create a test component in a dev project: `src/components/TestBanner.tsx`:
```typescript
export function TestBanner() {
    return <div style={{ background: '#f0f', padding: '1rem' }}>Test Banner</div>;
}
```

Open the project in the editor. Open the Components tab. Verify `TestBanner` appears in "My Components" with its file path. Drag it onto the canvas. Verify:
- `<TestBanner />` is inserted in the page's JSX
- `import { TestBanner } from '../components/TestBanner'` (or the correct relative path) is added to the page file
- The magenta banner renders in the preview iframe

- [ ] **Step 7: Commit**

```bash
git add packages/models/src/actions/   # whichever file(s) changed
git add "apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx"
git add "apps/web/client/src/components/store/editor/insert/index.ts"
git add # action runner file
git commit -m "feat: implement drag-and-drop insertion for user React components with import injection"
```

---

## Verification Checklist

Run after all tasks are complete:

```
bun typecheck           # 0 errors
bun test                # all pass
```

Manual checks:
- [ ] Components tab icon visible in left sidebar
- [ ] `alt+7` toggles the Components tab
- [ ] Drag "Hero" template → nested section with `<h1>`, `<p>`, `<button>` appears on canvas
- [ ] Drag "Pricing Card" template → card with price, list items, and button appears
- [ ] Click any template → toast fires, canvas click places the component
- [ ] Search "hero" → only Hero/CTA templates show; search "pricing" → only Pricing Card
- [ ] Open a project with `.tsx` components → they appear under "My Components" with name + path
- [ ] Drag a user component → `<ComponentName />` inserted in page JSX + correct import added
- [ ] Click a user component → toast, then click canvas → same insertion
- [ ] Inserted user components render in the preview iframe
