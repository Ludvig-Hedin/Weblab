/**
 * Debounce keyed by a derived string. Calls with DIFFERENT keys debounce
 * independently (each key has its own timer), so a later call for one key never
 * cancels a pending call for another.
 *
 * A single shared `lodash.debounce` keyed by nothing drops the earlier call when
 * two different keys fire within the window — e.g. the editor's responsive
 * source-rebase used one shared debounce, so editing two properties within
 * ~600ms silently lost the first property's write. Keying by `(oid, property)`
 * fixes that.
 *
 * The returned function carries a `.cancel()` that clears every pending timer
 * (used on teardown). Keep it out of any MobX `makeAutoObservable` annotation —
 * MobX would wrap the function field as an action and strip `.cancel`.
 */
export function keyedDebounce<T>(
    fn: (arg: T) => void,
    waitMs: number,
    keyOf: (arg: T) => string,
): ((arg: T) => void) & { cancel: () => void } {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const run = (arg: T): void => {
        const key = keyOf(arg);
        const existing = timers.get(key);
        if (existing !== undefined) clearTimeout(existing);
        timers.set(
            key,
            setTimeout(() => {
                timers.delete(key);
                fn(arg);
            }, waitMs),
        );
    };

    run.cancel = (): void => {
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
    };

    return run;
}
