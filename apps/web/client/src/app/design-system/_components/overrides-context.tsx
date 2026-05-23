'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getRepoRoot } from '../actions';

export type TokenOverrides = Record<string, string>;

interface PersistedShape {
    overrides: TokenOverrides;
    radiusScale: number;
    transitionSpeed: number;
}

interface OverridesContextValue {
    overrides: TokenOverrides;
    savedOverrides: TokenOverrides;
    radiusScale: number;
    transitionSpeed: number;
    isDirty: boolean;
    setToken: (cssVar: string, value: string) => void;
    resetToken: (cssVar: string) => void;
    resetTokens: (cssVars: string[]) => void;
    setRadiusScale: (n: number) => void;
    setTransitionSpeed: (n: number) => void;
    save: () => void;
    discard: () => void;
    resetAll: () => void;
}

interface EditModeContextValue {
    editMode: boolean;
    toggle: () => void;
    set: (v: boolean) => void;
}

interface InspectorContextValue {
    current: string | null;
    open: (id: string) => void;
    close: () => void;
}

interface RepoContextValue {
    repoRoot: string | null;
}

const STORAGE_KEY = 'weblab-ds-overrides';

const OverridesContext = createContext<OverridesContextValue | null>(null);
const EditModeContext = createContext<EditModeContextValue | null>(null);
const InspectorContext = createContext<InspectorContextValue | null>(null);
const RepoContext = createContext<RepoContextValue>({ repoRoot: null });

function loadPersisted(): PersistedShape {
    const defaults: PersistedShape = {
        overrides: {},
        radiusScale: 1,
        transitionSpeed: 1,
    };
    try {
        if (typeof window === 'undefined') return defaults;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return defaults;
        const obj = parsed as Record<string, unknown>;
        if (obj.overrides && typeof obj.overrides === 'object') {
            return {
                overrides: obj.overrides as TokenOverrides,
                radiusScale: typeof obj.radiusScale === 'number' ? obj.radiusScale : 1,
                transitionSpeed: typeof obj.transitionSpeed === 'number' ? obj.transitionSpeed : 1,
            };
        }
        return {
            overrides: obj as TokenOverrides,
            radiusScale: 1,
            transitionSpeed: 1,
        };
    } catch {
        return defaults;
    }
}

export function OverridesProvider({ children }: { children: ReactNode }) {
    const [overrides, setOverrides] = useState<TokenOverrides>({});
    const [savedOverrides, setSavedOverrides] = useState<TokenOverrides>({});
    const [radiusScale, setRadiusScaleState] = useState(1);
    const [transitionSpeed, setTransitionSpeedState] = useState(1);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        const p = loadPersisted();
        setOverrides(p.overrides);
        setSavedOverrides(p.overrides);
        setRadiusScaleState(p.radiusScale);
        setTransitionSpeedState(p.transitionSpeed);
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const style =
            document.getElementById('ds-overrides') ??
            (() => {
                const s = document.createElement('style');
                s.id = 'ds-overrides';
                document.head.appendChild(s);
                return s;
            })();
        const radiusVars = `--radius: ${radiusScale}rem;`;
        const animVars = `--ds-anim-duration: ${Math.round(transitionSpeed * 300)}ms;`;
        const overrideVars = Object.entries(overrides)
            .map(([k, v]) => `${k}: ${v};`)
            .join('\n');
        style.textContent = `:root { ${radiusVars} ${animVars} ${overrideVars} }`;
    }, [overrides, radiusScale, transitionSpeed]);

    const setToken = useCallback((cssVar: string, value: string) => {
        setOverrides((prev) => ({ ...prev, [cssVar]: value }));
    }, []);

    const resetToken = useCallback((cssVar: string) => {
        setOverrides((prev) => {
            const n = { ...prev };
            delete n[cssVar];
            return n;
        });
    }, []);

    const resetTokens = useCallback((cssVars: string[]) => {
        setOverrides((prev) => {
            const n = { ...prev };
            cssVars.forEach((k) => delete n[k]);
            return n;
        });
    }, []);

    const save = useCallback(() => {
        try {
            const payload: PersistedShape = {
                overrides,
                radiusScale,
                transitionSpeed,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            setSavedOverrides({ ...overrides });
        } catch {
            // noop
        }
    }, [overrides, radiusScale, transitionSpeed]);

    const discard = useCallback(() => {
        setOverrides({ ...savedOverrides });
    }, [savedOverrides]);

    const resetAll = useCallback(() => {
        setOverrides({});
        setSavedOverrides({});
        setRadiusScaleState(1);
        setTransitionSpeedState(1);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // noop
        }
    }, []);

    const isDirty = useMemo(
        () => hydrated && JSON.stringify(overrides) !== JSON.stringify(savedOverrides),
        [hydrated, overrides, savedOverrides],
    );

    const value: OverridesContextValue = {
        overrides,
        savedOverrides,
        radiusScale,
        transitionSpeed,
        isDirty,
        setToken,
        resetToken,
        resetTokens,
        setRadiusScale: setRadiusScaleState,
        setTransitionSpeed: setTransitionSpeedState,
        save,
        discard,
        resetAll,
    };

    return <OverridesContext.Provider value={value}>{children}</OverridesContext.Provider>;
}

export function EditModeProvider({ children }: { children: ReactNode }) {
    const [editMode, setEditMode] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('edit') === '1') setEditMode(true);
    }, []);

    const toggle = useCallback(() => setEditMode((v) => !v), []);

    return (
        <EditModeContext.Provider value={{ editMode, toggle, set: setEditMode }}>
            {children}
        </EditModeContext.Provider>
    );
}

export function InspectorProvider({ children }: { children: ReactNode }) {
    const [current, setCurrent] = useState<string | null>(null);
    const open = useCallback((id: string) => setCurrent(id), []);
    const close = useCallback(() => setCurrent(null), []);
    return (
        <InspectorContext.Provider value={{ current, open, close }}>
            {children}
        </InspectorContext.Provider>
    );
}

export function RepoRootProvider({ children }: { children: ReactNode }) {
    const [repoRoot, setRepoRoot] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        void getRepoRoot().then((root) => {
            if (!cancelled) setRepoRoot(root);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return <RepoContext.Provider value={{ repoRoot }}>{children}</RepoContext.Provider>;
}

export function useOverrides() {
    const ctx = useContext(OverridesContext);
    if (!ctx) throw new Error('useOverrides must be used inside OverridesProvider');
    return ctx;
}

export function useEditMode() {
    const ctx = useContext(EditModeContext);
    if (!ctx) throw new Error('useEditMode must be used inside EditModeProvider');
    return ctx;
}

export function useInspector() {
    const ctx = useContext(InspectorContext);
    if (!ctx) throw new Error('useInspector must be used inside InspectorProvider');
    return ctx;
}

export function useRepoRoot(): string | null {
    return useContext(RepoContext).repoRoot;
}
