import { afterEach, describe, expect, mock, test } from 'bun:test';

import {
    copyPreloadScriptToPublic,
    getPreloadScriptContent,
} from '@/components/store/editor/sandbox/preload-script';
import type { RouterConfig } from '@weblab/models';

const routerConfig = {
    type: 'app',
    basePath: 'src/app',
} as RouterConfig;

afterEach(() => {
    mock.restore();
});

describe('getPreloadScriptContent', () => {
    test('falls back to a later source when the first fetch fails', async () => {
        const fetchMock = mock(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.startsWith('http')) {
                return new Response('console.log("ok")', { status: 200 });
            }
            return new Response('missing', { status: 404, statusText: 'Not Found' });
        });

        global.fetch = fetchMock as typeof fetch;

        const content = await getPreloadScriptContent();

        expect(content).toContain('console.log');
        expect(fetchMock).toHaveBeenCalled();
    });

    test('throws when every source fails', async () => {
        global.fetch = mock(async () => {
            throw new Error('network down');
        }) as typeof fetch;

        await expect(getPreloadScriptContent()).rejects.toThrow(
            'Failed to load preload script',
        );
    });
});

describe('copyPreloadScriptToPublic', () => {
    test('rethrows when preload injection fails so the sandbox can retry', async () => {
        global.fetch = mock(async () => {
            return new Response('console.log("ok")', { status: 200 });
        }) as typeof fetch;

        const provider = {
            createDirectory: mock(async () => {}),
            writeFile: mock(async () => {}),
            listFiles: mock(async () => ({ files: [] })),
        };

        await expect(
            copyPreloadScriptToPublic(provider as never, routerConfig),
        ).rejects.toThrow('No layout files found');
    });
});
