import { describe, expect, it } from 'bun:test';

import type { DomElement } from '@weblab/models';
import { StyleChangeType } from '@weblab/models/style';

import type { EditorEngine } from '../engine';
import type { UpdateStyleAction } from '@weblab/models/actions';
import { StyleManager } from './index';

const element = (frameId: string, computed: Record<string, string>) =>
    ({
        oid: 'element-1',
        domId: 'dom-1',
        frameId,
        branchId: 'branch',
        styles: { defined: {}, computed },
    }) as unknown as DomElement;

function setup(
    siblingElement: DomElement | Promise<DomElement> = element('tablet-frame', { color: 'blue' }),
) {
    const selected = element('desktop-frame', { color: 'red' });
    const desktop = {
        frame: {
            id: 'desktop-frame',
            groupId: 'group-1',
            branchId: 'branch',
            breakpoint: { id: 'desktop', width: 1024 },
        },
    };
    const tablet = {
        frame: {
            id: 'tablet-frame',
            groupId: 'group-1',
            branchId: 'branch',
            breakpoint: { id: 'tablet', width: 768 },
        },
        view: {
            isPenpalReady: () => true,
            getElementByOid: async () => siblingElement,
        },
    };
    const engine = {
        elements: { selected: [selected] },
        breakpoints: { activeId: 'tablet' },
        frames: {
            get: (id: string) => id === desktop.frame.id ? desktop : tablet,
            getAll: () => [desktop, tablet],
            getByGroupId: () => [desktop, tablet],
        },
        action: { resetResponsiveStyle: async (action: UpdateStyleAction) => {
            for (const target of action.targets) {
                if (target.oid) manager.recordOverrideForOid(target.oid, target.breakpoint!.id, target.change.updated);
            }
            return true;
        } },
    } as unknown as EditorEngine;
    const manager = new StyleManager(engine);
    return { manager, selected, engine: manager['editorEngine'] };
}

describe('StyleManager responsive overrides', () => {
    it('shows a computed sibling difference without writing it into source', async () => {
        const { manager, selected } = setup();

        await manager['seedOverridesFromSiblings'](selected);

        expect(manager.isOverriddenAt('element-1', 'color', 'tablet')).toBe(true);
        expect(manager.breakpointMapFor('element-1', 'color')).toEqual({});
    });

    it('does not let an in-flight computed snapshot replace an authored edit', async () => {
        let resolveSibling!: (value: DomElement) => void;
        const sibling = new Promise<DomElement>((resolve) => { resolveSibling = resolve; });
        const { manager, selected } = setup(sibling);

        const pendingSeed = manager['seedOverridesFromSiblings'](selected);
        manager.recordOverrideForOid('element-1', 'tablet', { color: 'green' });
        resolveSibling(element('tablet-frame', { color: 'blue' }));
        await pendingSeed;

        expect(manager.getOverrideValue('element-1', 'color', 'tablet')).toBe('green');
        expect(manager.breakpointMapFor('element-1', 'color')).toEqual({ tablet: 'green' });
    });

    it('normalizes property names and preserves custom value type', () => {
        const { manager } = setup();
        manager.recordOverrideForOid('element-1', 'tablet', {
            backgroundColor: { value: 'brand-primary', type: StyleChangeType.Custom },
        });

        expect(manager.getOverrideValue('element-1', 'background-color', 'tablet'))
            .toBe('brand-primary');
        expect(manager.breakpointMapFor('element-1', 'backgroundColor')).toEqual({});
    });

    it('keeps a cleared value removed when a stale computed seed arrives', async () => {
        let resolveSibling!: (value: DomElement) => void;
        const sibling = new Promise<DomElement>((resolve) => { resolveSibling = resolve; });
        const { manager, selected } = setup(sibling);
        manager.recordOverrideForOid('element-1', 'tablet', { color: 'green' });
        manager.requestSourceRebase = () => {};

        const pendingSeed = manager['seedOverridesFromSiblings'](selected);
        await manager.clearBreakpointOverride('element-1', 'color', 'tablet');
        resolveSibling(element('tablet-frame', { color: 'green' }));
        await pendingSeed;

        expect(manager.getOverrideValue('element-1', 'color', 'tablet')).toBeNull();
        expect(manager.isOverriddenAt('element-1', 'color', 'tablet')).toBe(false);
        expect(manager.breakpointMapFor('element-1', 'color')).toEqual({});
        expect(manager.removedBreakpointMapFor('element-1', 'color')).toEqual({ tablet: '' });
    });

    it('a refused source reset leaves the old binding and override intact', async () => {
        const { manager, engine, selected } = setup();
        await manager['seedOverridesFromSiblings'](selected);
        manager.recordOverrideForOid('element-1', 'tablet', {
            color: { value: 'brand', type: StyleChangeType.Custom },
        });
        expect(manager.isOverriddenAt('element-1', 'color', 'tablet')).toBe(true);
        engine.action.resetResponsiveStyle = async () => false;
        expect(await manager.clearBreakpointOverride('element-1', 'color', 'tablet')).toBe(false);
        expect(manager.getOverrideValue('element-1', 'color', 'tablet')).toBe('brand');
        expect(manager.isOverriddenAt('element-1', 'color', 'tablet')).toBe(true);
        expect(manager.removedBreakpointMapFor('element-1', 'color')).toEqual({});
    });
});
