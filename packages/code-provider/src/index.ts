import type { CodesandboxProviderOptions } from './providers/codesandbox';
import type { NodeFsProviderOptions } from './providers/nodefs';
import type { VercelSandboxProviderOptions } from './providers/vercel-sandbox';
import type { Provider, StaticProvider } from './types';
import { CodeProvider } from './providers';
import { CodesandboxProvider } from './providers/codesandbox';
import { NodeFsProvider } from './providers/nodefs';

export * from './providers';
export { CodesandboxProvider } from './providers/codesandbox';
export { NodeFsProvider } from './providers/nodefs';
// Server-side consumers (Convex actions with `'use node';`) import the
// Vercel provider class directly to avoid relying on subpath export
// resolution at deploy time. The browser barrel intentionally omits this
// export — the class transitively imports `@vercel/sandbox` which is
// Node-only. The `exports.browser` field in package.json routes browser
// builds to `index.browser.ts`, which never sees this line.
export { VercelSandboxProvider } from './providers/vercel-sandbox';
export type { VercelSandboxProviderOptions } from './providers/vercel-sandbox';
export * from './types';

export interface CreateClientOptions {
    providerOptions: ProviderInstanceOptions;
}

/**
 * Providers are designed to be singletons; be mindful of this when creating multiple clients
 * or when instantiating in the backend (stateless vs stateful).
 */
export async function createCodeProviderClient(
    codeProvider: CodeProvider,
    { providerOptions }: CreateClientOptions,
) {
    const provider = await newProviderInstance(codeProvider, providerOptions);
    await provider.initialize({});
    return provider;
}

export async function getStaticCodeProvider(codeProvider: CodeProvider): Promise<StaticProvider> {
    if (codeProvider === CodeProvider.CodeSandbox) {
        return CodesandboxProvider;
    }

    if (codeProvider === CodeProvider.NodeFs) {
        return NodeFsProvider;
    }

    if (codeProvider === CodeProvider.VercelSandbox) {
        const { VercelSandboxProvider } = await import('./providers/vercel-sandbox');
        return VercelSandboxProvider;
    }
    throw new Error(`Unimplemented code provider: ${codeProvider}`);
}

export interface ProviderInstanceOptions {
    codesandbox?: CodesandboxProviderOptions;
    nodefs?: NodeFsProviderOptions;
    vercelSandbox?: VercelSandboxProviderOptions;
}

async function newProviderInstance(
    codeProvider: CodeProvider,
    providerOptions: ProviderInstanceOptions,
): Promise<Provider> {
    if (codeProvider === CodeProvider.CodeSandbox) {
        if (!providerOptions.codesandbox) {
            throw new Error('Codesandbox provider options are required.');
        }
        return new CodesandboxProvider(providerOptions.codesandbox);
    }

    if (codeProvider === CodeProvider.NodeFs) {
        if (!providerOptions.nodefs) {
            throw new Error('NodeFs provider options are required.');
        }
        return new NodeFsProvider(providerOptions.nodefs);
    }

    if (codeProvider === CodeProvider.VercelSandbox) {
        if (!providerOptions.vercelSandbox) {
            throw new Error('Vercel Sandbox provider options are required.');
        }
        const { VercelSandboxProvider } = await import('./providers/vercel-sandbox');
        return new VercelSandboxProvider(providerOptions.vercelSandbox);
    }

    throw new Error(`Unimplemented code provider: ${codeProvider}`);
}
