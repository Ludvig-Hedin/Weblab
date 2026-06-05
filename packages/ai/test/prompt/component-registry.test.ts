import { describe, expect, it } from 'bun:test';

import { COMPONENT_REGISTRY } from '@weblab/constants';

import { getCachedSystemBlocks } from '../../src/prompt/cache-blocks';
import {
    AI_SLOP_CHECKLIST,
    COMPONENT_REGISTRY_PROMPT,
    DESIGN_SYSTEM_PROMPT,
} from '../../src/prompt/constants';
import { getSystemPrompt } from '../../src/prompt/provider';

describe('COMPONENT_REGISTRY catalog', () => {
    it('is non-empty and every item is well-formed', () => {
        expect(COMPONENT_REGISTRY.length).toBeGreaterThan(0);
        for (const c of COMPONENT_REGISTRY) {
            expect(c.name).toBeTruthy();
            expect(['shadcn', 'watermelon']).toContain(c.lib);
            expect(c.componentName).toMatch(/^[A-Z]/);
            expect(c.importPath.startsWith('@/components/')).toBe(true);
            expect(c.installUrl).toMatch(/^https:\/\/.+\.json$/);
        }
    });

    it('has no duplicate lib+name pairs', () => {
        const keys = COMPONENT_REGISTRY.map((c) => `${c.lib}/${c.name}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('routes shadcn vs watermelon imports to the right folder', () => {
        for (const c of COMPONENT_REGISTRY) {
            const expected = c.lib === 'watermelon' ? 'watermelon-ui' : 'ui';
            expect(c.importPath).toContain(`/components/${expected}/`);
        }
    });
});

describe('COMPONENT_REGISTRY_PROMPT', () => {
    it('declares the default stack and the no-invented-styling rule', () => {
        expect(COMPONENT_REGISTRY_PROMPT).toContain('Next.js');
        expect(COMPONENT_REGISTRY_PROMPT).toContain('shadcn/ui');
        expect(COMPONENT_REGISTRY_PROMPT.toLowerCase()).toContain('never hardcode');
        expect(COMPONENT_REGISTRY_PROMPT).toContain('tokens.css');
    });

    it('lists every catalog component with its import path', () => {
        for (const c of COMPONENT_REGISTRY) {
            expect(COMPONENT_REGISTRY_PROMPT).toContain(c.importPath);
        }
    });

    it('includes the existing-project match rule and the escape hatch', () => {
        expect(COMPONENT_REGISTRY_PROMPT).toContain('EXISTING PROJECTS');
        expect(COMPONENT_REGISTRY_PROMPT).toContain('ESCAPE HATCH');
    });
});

describe('DESIGN_SYSTEM_PROMPT overrides', () => {
    it('keeps reference + existing-project + forbidden-as-defaults rules', () => {
        expect(DESIGN_SYSTEM_PROMPT).toContain('Rule 0');
        expect(DESIGN_SYSTEM_PROMPT).toContain('the existing project always wins');
        expect(DESIGN_SYSTEM_PROMPT).toContain('defaults, not censorship');
        // never introduce new colors/fonts into an existing project
        expect(DESIGN_SYSTEM_PROMPT.toLowerCase()).toContain('never introduce a new color');
    });
});

describe('system prompt assembly', () => {
    it('nextjs stable block carries design, registry, and checklist', () => {
        const { stable } = getCachedSystemBlocks({ framework: 'nextjs' });
        expect(stable).toContain('<design-system>');
        expect(stable).toContain('<component-registry>');
        expect(stable).toContain('<anti-slop-checklist>');
        // a sample catalog import path is present
        expect(stable).toContain('@/components/ui/button');
    });

    it('static-html gets design + checklist but NOT the shadcn registry', () => {
        const { stable } = getCachedSystemBlocks({ framework: 'static-html' });
        expect(stable).toContain('<design-system>');
        expect(stable).toContain('<anti-slop-checklist>');
        expect(stable).not.toContain('<component-registry>');
        expect(stable).not.toContain('<shadcn-block-catalog>');
    });

    it('legacy provider path also injects all three blocks for nextjs', () => {
        const prompt = getSystemPrompt(undefined, 'nextjs');
        expect(prompt).toContain('<design-system>');
        expect(prompt).toContain('<component-registry>');
        expect(prompt).toContain('<anti-slop-checklist>');
    });

    it('checklist is the final instruction (gate runs last)', () => {
        const { stable } = getCachedSystemBlocks({ framework: 'nextjs' });
        expect(AI_SLOP_CHECKLIST.length).toBeGreaterThan(0);
        expect(stable.trimEnd().endsWith('</anti-slop-checklist>')).toBe(true);
    });
});
