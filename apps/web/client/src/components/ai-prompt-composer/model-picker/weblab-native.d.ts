import type { ProviderKind } from '@weblab/ai/client';
import type { NativePublishingBridge } from '@/lib/local-publishing';

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
    openExternal?: (url: string) => Promise<boolean>;
    claimLoginHandoff?: (ticket: string, state: string) => Promise<boolean>;
    publishing?: NativePublishingBridge;
    cli?: {
        providerStatus?: () => Promise<
            Partial<
                Record<
                    ProviderKind,
                    {
                        installed: boolean;
                        /** 'unknown': the CLI's own status check could not tell. */
                        authStatus: 'ready' | 'sign-in' | 'unknown';
                        version?: string;
                        blockedCode?: 'isolation-unverified';
                    }
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
