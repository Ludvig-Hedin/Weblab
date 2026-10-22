import { describe, expect, it } from 'bun:test';

import { getCliToolLabel } from './tool-label';

describe('getCliToolLabel', () => {
    it('labels Claude Code file tools with the project-relative path', () => {
        expect(
            getCliToolLabel({ provider: 'claude-code', tool: 'Edit', status: 'done', input: { file_path: 'app/page.tsx' } }),
        ).toEqual({ title: 'Edited app/page.tsx', icon: 'edit' });
        expect(
            getCliToolLabel({ provider: 'claude-code', tool: 'Read', status: 'running', input: { file_path: 'a.css' } }).title,
        ).toBe('Read a.css');
    });

    it('labels Codex file changes and commands', () => {
        expect(
            getCliToolLabel({ provider: 'codex', tool: 'file_change', status: 'done', input: { files: [{ path: 'x.ts' }, { path: 'y.ts' }] } }).title,
        ).toBe('Edited 2 files');
        expect(
            getCliToolLabel({ provider: 'codex', tool: 'command', status: 'error', input: { command: 'npm i' } }),
        ).toEqual({ title: 'Command “npm i”', icon: 'terminal' });
    });

    it('falls back to a readable tool name', () => {
        expect(getCliToolLabel({ provider: 'codex', tool: 'figma.get_file', status: 'done' }).title).toBe('Figma Get File');
    });
});
