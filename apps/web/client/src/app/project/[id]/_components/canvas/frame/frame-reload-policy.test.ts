import { describe, expect, it } from 'bun:test';

import {
    planReload,
    RELOAD_BASE_DELAY_MS,
    RELOAD_INCREMENT_MS,
    RELOAD_MAX_ATTEMPTS,
    SELF_HEAL_INTERVAL_MS,
    SELF_HEAL_MAX_ATTEMPTS,
} from './frame-reload-policy';

describe('planReload', () => {
    it('uses escalating short delays during the fast auto-retry budget', () => {
        const first = planReload(1);
        expect(first.shouldReload).toBe(true);
        expect(first.capped).toBe(false);
        expect(first.delayMs).toBe(RELOAD_BASE_DELAY_MS);

        const last = planReload(RELOAD_MAX_ATTEMPTS);
        expect(last.shouldReload).toBe(true);
        expect(last.capped).toBe(false);
        expect(last.delayMs).toBe(
            RELOAD_BASE_DELAY_MS + RELOAD_INCREMENT_MS * (RELOAD_MAX_ATTEMPTS - 1),
        );
    });

    it('keeps self-healing past the fast budget so a late-booting sandbox recovers', () => {
        // This is the regression: before the fix, attempt > RELOAD_MAX_ATTEMPTS
        // returned early and never reloaded again — stranding the user even
        // after the sandbox became healthy.
        const plan = planReload(RELOAD_MAX_ATTEMPTS + 1);
        expect(plan.shouldReload).toBe(true);
        expect(plan.capped).toBe(true); // manual Retry panel is shown…
        expect(plan.delayMs).toBe(SELF_HEAL_INTERVAL_MS); // …but we still re-fetch
    });

    it('keeps self-healing up to the self-heal ceiling', () => {
        const plan = planReload(RELOAD_MAX_ATTEMPTS + SELF_HEAL_MAX_ATTEMPTS);
        expect(plan.shouldReload).toBe(true);
        expect(plan.capped).toBe(true);
    });

    it('never permanently gives up — gentle self-heal continues so a slow boot recovers', () => {
        // Vercel cold boot (npm install + next dev on a fresh sandbox) can run
        // past any fixed ceiling. useSandboxLiveness is a no-op, so the gentle
        // self-heal reload is the ONLY thing that re-arms the iframe when the dev
        // server finally serves — it must keep going indefinitely.
        const plan = planReload(RELOAD_MAX_ATTEMPTS + SELF_HEAL_MAX_ATTEMPTS + 50);
        expect(plan.shouldReload).toBe(true);
        expect(plan.capped).toBe(true);
        expect(plan.delayMs).toBe(SELF_HEAL_INTERVAL_MS);
    });
});
