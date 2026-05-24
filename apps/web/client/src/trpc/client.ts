/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// Post-migration silent stub for `@/trpc/client`. Vanilla client used by
// class-based MobX stores. Calls resolve to undefined / no-op silently.
// Each consumer is being migrated to use Convex via
// `@/components/store/lib/convex-http-client`.

function makeStubProxy(): any {
    return new Proxy(function () {}, {
        get(_target, prop) {
            if (typeof prop === 'symbol') return undefined;
            const name = String(prop);
            if (name === 'mutate' || name === 'query' || name === 'fetch') {
                return async () => undefined;
            }
            if (name === 'subscribe') {
                return () => ({ unsubscribe: () => undefined });
            }
            return makeStubProxy();
        },
        apply: () => undefined,
    });
}

const stub: any = makeStubProxy();

export const trpcClient: any = stub;
export const apiUtils: any = stub;
export const apiClient: any = stub;
export const trpcApi: any = stub;
export const api: any = stub;
export default stub;
