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

/**
 * Weblab design tokens baked into every blank Next.js project so it ships
 * on-brand BEFORE the AI touches it (tinted neutrals, impure black/white, one
 * teal whisper accent on ring/active only, flat). Maps the shadcn/ui CSS-var
 * contract via Tailwind v4 `@theme inline`, so catalog components render
 * correctly and `bg-background` / `text-foreground` / `border-border` work.
 *
 * Canonical source: component-registry/theme/tokens.css — keep the two in sync
 * (tracked in BACKLOG to codegen this from that file).
 */
export const WEBLAB_NEXTJS_GLOBALS_CSS = `@import 'tailwindcss';
@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.99 0.002 250);
  --foreground: oklch(0.2 0.01 250);
  --card: oklch(0.99 0.002 250);
  --card-foreground: oklch(0.2 0.01 250);
  --popover: oklch(0.99 0.002 250);
  --popover-foreground: oklch(0.2 0.01 250);
  --primary: oklch(0.22 0.012 250);
  --primary-foreground: oklch(0.98 0.002 250);
  --secondary: oklch(0.96 0.004 250);
  --secondary-foreground: oklch(0.22 0.012 250);
  --muted: oklch(0.96 0.004 250);
  --muted-foreground: oklch(0.5 0.012 250);
  --accent: oklch(0.95 0.005 250);
  --accent-foreground: oklch(0.22 0.012 250);
  --destructive: oklch(0.55 0.16 25);
  --destructive-foreground: oklch(0.98 0.002 250);
  --border: oklch(0.92 0.004 250);
  --input: oklch(0.92 0.004 250);
  --ring: oklch(0.62 0.07 195);
  --brand-accent: oklch(0.62 0.07 195);
  --chart-1: oklch(0.3 0.01 250);
  --chart-2: oklch(0.45 0.012 250);
  --chart-3: oklch(0.6 0.012 250);
  --chart-4: oklch(0.74 0.01 250);
  --chart-5: oklch(0.62 0.07 195);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.18 0.012 250);
  --foreground: oklch(0.96 0.003 250);
  --card: oklch(0.21 0.012 250);
  --card-foreground: oklch(0.96 0.003 250);
  --popover: oklch(0.21 0.012 250);
  --popover-foreground: oklch(0.96 0.003 250);
  --primary: oklch(0.96 0.003 250);
  --primary-foreground: oklch(0.2 0.012 250);
  --secondary: oklch(0.26 0.01 250);
  --secondary-foreground: oklch(0.96 0.003 250);
  --muted: oklch(0.26 0.01 250);
  --muted-foreground: oklch(0.68 0.012 250);
  --accent: oklch(0.28 0.01 250);
  --accent-foreground: oklch(0.96 0.003 250);
  --destructive: oklch(0.62 0.17 25);
  --destructive-foreground: oklch(0.98 0.002 250);
  --border: oklch(0.3 0.01 250);
  --input: oklch(0.32 0.01 250);
  --ring: oklch(0.6 0.07 195);
  --brand-accent: oklch(0.62 0.08 195);
  --chart-1: oklch(0.85 0.01 250);
  --chart-2: oklch(0.7 0.012 250);
  --chart-3: oklch(0.56 0.012 250);
  --chart-4: oklch(0.42 0.01 250);
  --chart-5: oklch(0.62 0.08 195);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-brand-accent: var(--brand-accent);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    border-color: var(--border);
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: system-ui, sans-serif;
  }
}
`;
