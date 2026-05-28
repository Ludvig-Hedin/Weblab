import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { LocalModelOption } from '@weblab/models';
import { OLLAMA_DEFAULT_BASE_URL } from '@weblab/models';

import { getSupabaseUser } from '../../chat/helpers';

interface OllamaTagsResponse {
    models: Array<{
        name: string;
        size: number;
        modified_at: string;
    }>;
}

function formatBytes(bytes: number | undefined): string {
    // Ollama's `/api/tags` occasionally omits `size` for partially-downloaded
    // models. Without this guard `bytes / (1024 ** 3)` is NaN, which becomes
    // the literal string "NaN GB" in the UI dropdown.
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
}

// Ollama is a local-machine service. Reject anything that isn't a loopback
// host so a malicious caller can't pivot this endpoint into an SSRF probe
// against internal/cloud-metadata IPs.
const ALLOWED_OLLAMA_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isAllowedOllamaUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        const hostname = url.hostname.toLowerCase();
        return ALLOWED_OLLAMA_HOSTNAMES.has(hostname);
    } catch {
        return false;
    }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const user = await getSupabaseUser(req);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawBaseUrl = searchParams.get('baseUrl') ?? OLLAMA_DEFAULT_BASE_URL;
    if (!isAllowedOllamaUrl(rawBaseUrl)) {
        return NextResponse.json({ available: false, models: [] }, { status: 400 });
    }
    // Strip trailing /api (or /api/) so users who paste the full API URL don't
    // produce a doubled /api/api/tags path.
    const baseUrl = rawBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
        const res = await fetch(`${baseUrl}/api/tags`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            return NextResponse.json({ available: false, models: [] });
        }

        const data = (await res.json()) as OllamaTagsResponse;
        const models: LocalModelOption[] = (data.models ?? []).map((m) => ({
            label: m.name,
            model: `ollama/${m.name}` as const,
            size: formatBytes(m.size),
        }));

        return NextResponse.json({ available: true, models });
    } catch {
        clearTimeout(timeoutId);
        return NextResponse.json({ available: false, models: [] });
    }
}
