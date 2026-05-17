// Browser stub for @vercel/sandbox — the real package uses Node.js built-ins
// (fs, stream, timers) and must not be bundled in the browser context.
// The browser uses VercelBrowserProvider (tRPC) instead; this stub satisfies
// the static import graph without including any Node code.

const _notAvailable = (): never => {
    throw new Error('@vercel/sandbox is not available in the browser');
};

export class Sandbox {
    static async create(_opts?: unknown) {
        return _notAvailable();
    }
    static async get(_opts?: unknown) {
        return _notAvailable();
    }
    static async list(_opts?: unknown) {
        return _notAvailable();
    }
}
