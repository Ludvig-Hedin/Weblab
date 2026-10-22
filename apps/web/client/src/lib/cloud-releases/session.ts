import { ConvexHttpClient } from 'convex/browser';

/** One operation keeps its initiating session, including after token refresh. */
export class ReleaseSession {
    constructor(private readonly options: {
        backend: string;
        current: () => boolean;
        getToken: () => Promise<string | null>;
        signal: AbortSignal;
    }) {}

    get current() { return this.options.current() && !this.options.signal.aborted; }
    guard() { if (!this.current) throw new Error('CLOUD_RELEASE_SESSION_CHANGED'); }

    async call<T>(work: (client: ConvexHttpClient) => Promise<T>): Promise<T> {
        this.guard();
        const token = await this.options.getToken();
        this.guard();
        if (!token) throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
        const guardedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            this.guard();
            return globalThis.fetch(input, { ...init, signal: init?.signal
                ? AbortSignal.any([this.options.signal, init.signal]) : this.options.signal });
        }) as typeof globalThis.fetch;
        const client = new ConvexHttpClient(this.options.backend, { fetch: guardedFetch });
        client.setAuth(token);
        const result = await work(client);
        this.guard();
        return result;
    }

    async verifyActor(expected: string, read: (client: ConvexHttpClient) => Promise<{ actorId: string }>) {
        const actual = await this.call(read);
        if (actual.actorId !== expected) throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
    }
}
