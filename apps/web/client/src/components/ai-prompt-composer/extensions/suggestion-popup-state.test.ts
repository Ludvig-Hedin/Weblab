import { describe, expect, it } from 'bun:test';

import { createSuggestionPopupHandle, isSuggestionPopupOpen } from './suggestion-popup-state';

describe('suggestion-popup-state', () => {
    it('reports closed when no popup is shown', () => {
        expect(isSuggestionPopupOpen()).toBe(false);
    });

    it('opens while a handle is shown, closes on hide', () => {
        const popup = createSuggestionPopupHandle();
        popup.show();
        expect(isSuggestionPopupOpen()).toBe(true);
        popup.hide();
        expect(isSuggestionPopupOpen()).toBe(false);
    });

    it('stays open until ALL popups hide (mention + slash coexisting)', () => {
        const mention = createSuggestionPopupHandle();
        const slash = createSuggestionPopupHandle();
        mention.show();
        slash.show();
        mention.hide();
        expect(isSuggestionPopupOpen()).toBe(true);
        slash.hide();
        expect(isSuggestionPopupOpen()).toBe(false);
    });

    it('treats repeated show() as idempotent (Escape-hide then re-show)', () => {
        const popup = createSuggestionPopupHandle();
        popup.show();
        popup.show();
        popup.hide();
        expect(isSuggestionPopupOpen()).toBe(false);
    });
});
