// Browser entry point for @weblab/code-provider.
// Does NOT include the vercel-sandbox provider — that package uses Node.js
// built-ins (fs, stream, timers) and must only run server-side.
// In the browser, Vercel Sandbox is accessed via VercelBrowserProvider (tRPC).

import type { CodesandboxProviderOptions } from './providers/codesandbox';
import type { NodeFsProviderOptions } from './providers/nodefs';
import type { Provider, StaticProvider } from './types';
import { CodeProvider } from './providers';
import { CodesandboxProvider } from './providers/codesandbox';
import { NodeFsProvider } from './providers/nodefs';

export * from './providers';
export { CodesandboxProvider } from './providers/codesandbox';
export { NodeFsProvider } from './providers/nodefs';
export * from './scaffold-templates';
export * from './types';

export interface CreateClientOptions {
    providerOptions: ProviderInstanceOptions;
}

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
    throw new Error(`Code provider ${codeProvider} is not available in the browser`);
}

export interface ProviderInstanceOptions {
    codesandbox?: CodesandboxProviderOptions;
    nodefs?: NodeFsProviderOptions;
    vercelSandbox?: Record<string, unknown>;
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
    throw new Error(`Code provider ${codeProvider} is not available in the browser`);
}
