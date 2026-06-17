import { afterEach, describe, expect, it } from 'bun:test';

import { ChatType } from '@weblab/models';

import { getToolClassesFromType } from './toolset';

const toolNames = (chatType: ChatType): string[] =>
    getToolClassesFromType(chatType).map((c) => c.toolName);

describe('getToolClassesFromType — image-tool key gating', () => {
    const prev = process.env.OPENAI_API_KEY;
    afterEach(() => {
        if (prev === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = prev;
    });

    it('keeps client image tools when OPENAI_API_KEY is absent (client bundle has no key)', () => {
        delete process.env.OPENAI_API_KEY;
        const names = toolNames(ChatType.EDIT);
        // Regression: these are ClientTools dispatched in the browser via
        // handleToolCall. They need no key and must stay available, or the
        // server->client generated-image hand-off throws "tool not available".
        expect(names).toContain('add_generated_image_to_project');
        expect(names).toContain('replace_image_in_element');
        // Server-side generation tools are correctly hidden without the key.
        expect(names).not.toContain('generate_image');
        expect(names).not.toContain('edit_image');
    });

    it('exposes every image tool when OPENAI_API_KEY is set (server with key)', () => {
        process.env.OPENAI_API_KEY = 'test-key';
        const names = toolNames(ChatType.EDIT);
        expect(names).toContain('generate_image');
        expect(names).toContain('edit_image');
        expect(names).toContain('add_generated_image_to_project');
        expect(names).toContain('replace_image_in_element');
    });
});
