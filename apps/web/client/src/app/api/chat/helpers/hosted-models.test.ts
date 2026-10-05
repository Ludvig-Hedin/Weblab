import { describe, expect, it } from 'bun:test';

import {
    DEFAULT_INLINE_EDIT_MODEL,
    DEFAULT_TAB_COMPLETE_MODEL,
    OPENROUTER_MODELS,
} from '@weblab/models';

import { isAllowedHostedEditorModel } from './hosted-models';

describe('isAllowedHostedEditorModel', () => {
    it('allows the curated chat models and the editor defaults', () => {
        expect(isAllowedHostedEditorModel(OPENROUTER_MODELS.GROK_4_7)).toBe(true);
        expect(isAllowedHostedEditorModel(DEFAULT_INLINE_EDIT_MODEL)).toBe(true);
        expect(isAllowedHostedEditorModel(DEFAULT_TAB_COMPLETE_MODEL)).toBe(true);
    });

    it('rejects unpriced OpenRouter slugs and the auto sentinel', () => {
        expect(isAllowedHostedEditorModel('some-lab/unpriced-model')).toBe(false);
        expect(isAllowedHostedEditorModel('auto')).toBe(false);
    });
});
