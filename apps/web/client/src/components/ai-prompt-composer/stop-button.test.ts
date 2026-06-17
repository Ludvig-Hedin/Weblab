import { describe, expect, it } from 'bun:test';

import { isStopButtonDisabled } from './stop-button';

describe('isStopButtonDisabled', () => {
    const noop = () => undefined;

    it('keeps Stop enabled while a handler exists, even when the composer is disabled', () => {
        // Regression: an offline-heartbeat blip flips the composer disabled
        // mid-stream. Stop must stay clickable so the user can abort.
        expect(isStopButtonDisabled({ composerDisabled: true, onStop: noop })).toBe(false);
    });

    it('keeps Stop enabled when the composer is enabled', () => {
        expect(isStopButtonDisabled({ composerDisabled: false, onStop: noop })).toBe(false);
    });

    it('disables Stop only when there is no handler to call', () => {
        expect(isStopButtonDisabled({ composerDisabled: false })).toBe(true);
        expect(isStopButtonDisabled({ composerDisabled: false, onStop: undefined })).toBe(true);
        expect(isStopButtonDisabled({ composerDisabled: true })).toBe(true);
    });
});
