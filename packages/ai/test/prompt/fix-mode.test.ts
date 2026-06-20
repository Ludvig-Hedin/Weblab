import { describe, expect, it } from 'bun:test';

import { ChatType } from '@weblab/models';

import { getSystemPromptFromType } from '../../src/agents/root';
import { FIX_SYSTEM_PROMPT } from '../../src/prompt/constants';
import { getPlanModeSystemPrompt } from '../../src/prompt/plan';
import {
    getAskModeSystemPrompt,
    getCreatePageSystemPrompt,
    getFixModeSystemPrompt,
    getSystemPrompt,
} from '../../src/prompt/provider';

const FRAMEWORK = 'nextjs' as const;

describe('getFixModeSystemPrompt', () => {
    it('includes the full Build prompt plus the fix-mode block', () => {
        const fix = getFixModeSystemPrompt([], FRAMEWORK, []);
        const build = getSystemPrompt([], FRAMEWORK, []);
        // FIX reuses the entire Build prompt so it keeps the full edit toolset
        // guidance (framework, design system, shell, anti-slop).
        expect(fix).toContain(build);
        // …then layers the focusing instruction on top.
        expect(fix).toContain(FIX_SYSTEM_PROMPT);
        expect(fix).toContain('<fix-mode>');
    });

    it('differs from the plain Build (EDIT) prompt', () => {
        const fix = getFixModeSystemPrompt([], FRAMEWORK, []);
        const build = getSystemPrompt([], FRAMEWORK, []);
        expect(fix).not.toBe(build);
        // The steering text is the only thing EDIT lacks.
        expect(build).not.toContain(FIX_SYSTEM_PROMPT);
    });
});

describe('getSystemPromptFromType — prompt-selection switch', () => {
    it('routes FIX to the dedicated fix-mode prompt', () => {
        const selected = getSystemPromptFromType(ChatType.FIX, [], FRAMEWORK, []);
        const expected = getFixModeSystemPrompt([], FRAMEWORK, []);
        expect(selected).toBe(expected);
        expect(selected).toContain(FIX_SYSTEM_PROMPT);
    });

    it('keeps FIX distinct from EDIT (no longer collapsed into default)', () => {
        const fix = getSystemPromptFromType(ChatType.FIX, [], FRAMEWORK, []);
        const edit = getSystemPromptFromType(ChatType.EDIT, [], FRAMEWORK, []);
        expect(fix).not.toBe(edit);
        expect(fix).toContain(FIX_SYSTEM_PROMPT);
        expect(edit).not.toContain(FIX_SYSTEM_PROMPT);
    });

    it('EDIT/default still returns the plain Build prompt', () => {
        const edit = getSystemPromptFromType(ChatType.EDIT, [], FRAMEWORK, []);
        expect(edit).toBe(getSystemPrompt([], FRAMEWORK, []));
    });

    it('does not change ASK / PLAN / CREATE routing', () => {
        expect(getSystemPromptFromType(ChatType.ASK, [], FRAMEWORK, [])).toBe(
            getAskModeSystemPrompt([], FRAMEWORK, []),
        );
        expect(getSystemPromptFromType(ChatType.PLAN, [], FRAMEWORK, [])).toBe(
            getPlanModeSystemPrompt([], FRAMEWORK, []),
        );
        expect(getSystemPromptFromType(ChatType.CREATE, [], FRAMEWORK, [])).toBe(
            getCreatePageSystemPrompt([], FRAMEWORK, []),
        );
        // ASK is read-only mode — must not carry fix steering.
        expect(getSystemPromptFromType(ChatType.ASK, [], FRAMEWORK, [])).not.toContain(
            FIX_SYSTEM_PROMPT,
        );
    });
});
