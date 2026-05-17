import type { InteractionsDocument } from './types';

export async function fetchConfig(url: string): Promise<InteractionsDocument | null> {
    try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return null;
        const json = (await res.json()) as InteractionsDocument;
        if (!json || typeof json !== 'object') return null;
        if (json.version !== 1) {
            console.warn('[weblab-ix] Unsupported interactions config version', json.version);
            return null;
        }
        return json;
    } catch (err) {
        console.warn('[weblab-ix] Failed to load interactions config', err);
        return null;
    }
}

export function getConfigUrl(): string | null {
    const script = document.currentScript as HTMLScriptElement | null;
    if (script) {
        const explicit = script.getAttribute('data-interactions-src');
        if (explicit) return explicit;
    }
    const found = document.querySelector<HTMLScriptElement>(
        'script[data-interactions-src]',
    );
    return found?.getAttribute('data-interactions-src') ?? null;
}
