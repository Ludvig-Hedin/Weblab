/**
 * Tracks whether any mention (`@`) or slash (`/`) suggestion popup is currently
 * open and visible.
 *
 * The editor's `editorProps.handleKeyDown` runs BEFORE the @tiptap/suggestion
 * plugin's own keydown props. The parent composer's `onKeyDown` (wired through
 * `handleKeyDown`) unconditionally `preventDefault()`s Enter to send the
 * message — which short-circuited the editor handler before the popup's
 * Enter-to-select (and Escape-to-close) ever ran. The editor consults this
 * registry to hand those keys to the suggestion plugin while a popup is open.
 *
 * Module-level state is safe: at most one composer is mounted at a time, and a
 * Set of per-session tokens correctly handles the mention+slash pair plus the
 * Escape-hide / re-show transitions.
 */
const visiblePopups = new Set<symbol>();

export interface SuggestionPopupHandle {
    /** Mark this popup visible — call from onStart / onUpdate. */
    show: () => void;
    /** Mark this popup hidden (Escape) or destroyed — call from onKeyDown(Escape) / onExit. */
    hide: () => void;
}

export function createSuggestionPopupHandle(): SuggestionPopupHandle {
    const token = Symbol('suggestion-popup');
    return {
        show: () => {
            visiblePopups.add(token);
        },
        hide: () => {
            visiblePopups.delete(token);
        },
    };
}

export function isSuggestionPopupOpen(): boolean {
    return visiblePopups.size > 0;
}

/**
 * Clear all tracked popups. Safety net for the composer to call on unmount in
 * case a suggestion session ends without its `onExit` (e.g. the editor is
 * destroyed mid-session) — without this the flag could leak `true` and keep
 * swallowing Enter/Escape after the popup is gone. Safe because at most one
 * composer is mounted at a time.
 */
export function resetSuggestionPopups(): void {
    visiblePopups.clear();
}
