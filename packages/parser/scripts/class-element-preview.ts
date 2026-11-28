import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

import type { buildElementContext } from '../src/classes/element-context';

declare global {
    interface Window {
        classElementContext: typeof buildElementContext;
    }
}

// Execute the exact preload helper in the inspected document.
export async function installElementContext(page: Page) {
    const build = await Bun.build({
        entrypoints: [fileURLToPath(new URL('../src/classes/element-context.ts', import.meta.url))],
        target: 'browser',
    });
    if (!build.success) throw Error(build.logs.map((log) => log.message).join('\n'));
    const url =
        'data:text/javascript;base64,' +
        Buffer.from(await build.outputs[0]!.text()).toString('base64');
    await page.evaluate(async (src) => {
        const mod = (await import(src)) as { buildElementContext: typeof buildElementContext };
        window.classElementContext = mod.buildElementContext;
    }, url);
}
