import { EMPTY_INTERACTIONS_DOCUMENT } from '@weblab/models';

/**
 * Framework scaffold file sets shared between the cloud (Vercel Sandbox writes
 * them via `sandbox.writeFiles`) and local-first mode (the desktop NodeFs bridge
 * writes them to the picked folder via `localfs.write`). Pure data so it's safe
 * to import in the browser/renderer.
 *
 * Keep these in sync with `scaffoldStaticHtmlProject` in
 * providers/vercel-sandbox/index.ts until the cloud path adopts this module.
 */
export interface ScaffoldFile {
    path: string;
    content: string;
}

/** Port the static-HTML `serve` dev server binds. Matches the cloud scaffold. */
export const STATIC_HTML_SCAFFOLD_PORT = 8080;

export function getStaticHtmlScaffoldFiles(): ScaffoldFile[] {
    return [
        {
            path: 'package.json',
            content: JSON.stringify(
                {
                    name: 'weblab-static-html',
                    private: true,
                    scripts: {
                        // `-s` = SPA mode (rewrite unknown routes to index.html).
                        // `-l tcp://0.0.0.0:<port>` binds the host interface.
                        dev: `serve -s --no-clipboard -l tcp://0.0.0.0:${STATIC_HTML_SCAFFOLD_PORT}`,
                        start: `serve -s --no-clipboard -l tcp://0.0.0.0:${STATIC_HTML_SCAFFOLD_PORT}`,
                    },
                    dependencies: {
                        serve: '^14.2.4',
                    },
                },
                null,
                2,
            ),
        },
        {
            path: 'index.html',
            content:
                '<!doctype html>\n' +
                '<html lang="en">\n' +
                '  <head>\n' +
                '    <meta charset="utf-8" />\n' +
                '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
                '    <title>New Weblab project</title>\n' +
                '    <link rel="stylesheet" href="./styles.css" />\n' +
                '  </head>\n' +
                '  <body>\n' +
                '    <main></main>\n' +
                '  </body>\n' +
                '</html>\n',
        },
        {
            path: 'styles.css',
            content:
                ':root { color-scheme: light dark; font-family: system-ui, sans-serif; }\n' +
                'body { margin: 0; min-height: 100vh; }\n',
        },
        {
            path: 'public/_weblab/interactions.json',
            content: JSON.stringify(EMPTY_INTERACTIONS_DOCUMENT, null, 2),
        },
        {
            path: 'public/_weblab/interactions-initial.css',
            content: '',
        },
    ];
}
