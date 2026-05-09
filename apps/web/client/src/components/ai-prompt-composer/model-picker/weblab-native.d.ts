import type { ProviderKind } from '@weblab/ai/client';

/**
 * Shape of the desktop Electron preload bridge exposed via
 * `contextBridge.exposeInMainWorld('weblabNative', …)`. Lives as an ambient
 * declaration so any module under chat-input/ can read `window.weblabNative`
 * without re-declaring the type.
 */
export type WeblabNativeBridge = {
    platform?: string;
    target?: 'desktop';
    version?: string;
    openOAuth?: (url: string) => Promise<boolean>;
    cli?: {
        providerStatus?: () => Promise<
            Partial<
                Record<
                    ProviderKind,
                    { installed: boolean; authStatus: 'ready' | 'sign-in'; version?: string }
                >
            >
        >;
        startStream?: (req: unknown) => Promise<{ ok: boolean; error?: string }>;
        abort?: (streamId: string) => void;
        onEvent?: (listener: (event: unknown) => void) => () => void;
        ollamaPullModel?: (
            model: string,
            pullId: string,
        ) => Promise<{ ok: boolean; error?: string }>;
        onOllamaPullProgress?: (
            listener: (event: { pullId: string; line: string }) => void,
        ) => () => void;
        ollamaQuit?: () => Promise<{ ok: boolean; error?: string }>;
    };
};

declare global {
    interface Window {
        weblabNative?: WeblabNativeBridge;
    }
}
