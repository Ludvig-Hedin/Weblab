import { useCallback, useState } from 'react';

/**
 * Multi-select state for the Assets panel — tracks whether select mode is on
 * and which asset paths are currently selected.
 */
export const useAssetSelection = () => {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggle = useCallback((path: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const clear = useCallback(() => setSelected(new Set()), []);

    const enterSelectionMode = useCallback(() => setSelectionMode(true), []);

    const exitSelectionMode = useCallback(() => {
        setSelectionMode(false);
        setSelected(new Set());
    }, []);

    return {
        selectionMode,
        selected,
        toggle,
        clear,
        enterSelectionMode,
        exitSelectionMode,
    };
};
