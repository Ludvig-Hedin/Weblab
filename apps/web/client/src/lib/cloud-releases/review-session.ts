export const REVIEW_COOKIE = '__Host-weblab-release-review';
export const REVIEW_EXCHANGE_PATH = '__weblab_review_access';
const secret = (value: string) => /^[a-f0-9]{64}$/.test(value);

export function reviewSession(cookie: string | null) {
    const values = (cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${REVIEW_COOKIE}=`));
    const value = values.length === 1 ? values[0]!.slice(REVIEW_COOKIE.length + 1) : '';
    return secret(value) ? value : null;
}
export function reviewCookie(value: string, expiresAt: number, now = Date.now()) {
    if (!secret(value) || expiresAt <= now || expiresAt > now + 15 * 60_000) throw new Error('Invalid review session');
    return `${REVIEW_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt - now) / 1000)}`;
}
export async function reviewExchangeTicket(request: Request, trustedOrigin: string) {
    const app = new URL(trustedOrigin);
    if (app.protocol !== 'https:' || app.origin !== trustedOrigin || request.method !== 'POST'
        || request.headers.get('origin') !== trustedOrigin || new URL(request.url).search
        || request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/x-www-form-urlencoded') throw new Error('Invalid review exchange');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing review ticket');
    let body = '', size = 0;
    const decoder = new TextDecoder();
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > 512) throw new Error('Review ticket too large');
            body += decoder.decode(next.value, { stream: true });
        }
        body += decoder.decode();
    } finally { await reader.cancel().catch(() => undefined); }
    const params = new URLSearchParams(body), tickets = params.getAll('ticket');
    if ([...params.keys()].length !== 1 || tickets.length !== 1 || !secret(tickets[0]!)) throw new Error('Invalid review ticket');
    return tickets[0]!;
}
