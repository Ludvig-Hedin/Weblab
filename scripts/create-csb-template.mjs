#!/usr/bin/env node
// Creates a public Next.js sandbox on CodeSandbox to use as the
// `DEFAULT_NEW_PROJECT_TEMPLATE` for new Weblab projects. Replaces the
// broken BLANK template (`xzsy8c`) which is empty (no package.json,
// no .codesandbox/tasks.json) and causes every fresh project to fail
// with "Script not found 'dev'" + 502 on preview.
//
// The scaffold is injected via the SDK's `setup(session)` callback so
// the SDK manages the WebSocket session during creation (Bun's `ws`
// rejects the 101 handshake from a post-fork connect, but the in-flight
// session in setup works).
//
// Usage:
//   CSB_API_KEY=csb_v1_... bun scripts/create-csb-template.mjs

import { CodeSandbox } from '@codesandbox/sdk';

const apiKey = process.env.CSB_API_KEY;
if (!apiKey) {
    console.error('CSB_API_KEY env var required');
    process.exit(1);
}

const FILES = {
    'package.json': JSON.stringify(
        {
            name: 'weblab-blank-nextjs',
            version: '0.1.0',
            private: true,
            scripts: {
                dev: 'next dev -p 3000 -H 0.0.0.0',
                build: 'next build',
                start: 'next start -p 3000 -H 0.0.0.0',
                lint: 'next lint',
            },
            dependencies: {
                next: '15.1.6',
                react: '19.0.0',
                'react-dom': '19.0.0',
            },
            devDependencies: {
                '@types/node': '22.10.7',
                '@types/react': '19.0.7',
                '@types/react-dom': '19.0.3',
                typescript: '5.7.3',
            },
        },
        null,
        2,
    ),
    '.codesandbox/tasks.json': JSON.stringify(
        {
            setupTasks: [{ name: 'Install', command: 'npm install' }],
            tasks: {
                dev: {
                    name: 'Dev server',
                    command: 'npm run dev',
                    runAtStart: true,
                    preview: { port: 3000 },
                    restartOn: { files: ['package.json', 'next.config.mjs'] },
                },
                build: { name: 'Build', command: 'npm run build' },
            },
        },
        null,
        2,
    ),
    'tsconfig.json': JSON.stringify(
        {
            compilerOptions: {
                target: 'ES2017',
                lib: ['dom', 'dom.iterable', 'esnext'],
                allowJs: true,
                skipLibCheck: true,
                strict: true,
                noEmit: true,
                esModuleInterop: true,
                module: 'esnext',
                moduleResolution: 'bundler',
                resolveJsonModule: true,
                isolatedModules: true,
                jsx: 'preserve',
                incremental: true,
                plugins: [{ name: 'next' }],
                paths: { '@/*': ['./*'] },
            },
            include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
            exclude: ['node_modules'],
        },
        null,
        2,
    ),
    'next.config.mjs': `/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
};

export default nextConfig;
`,
    'next-env.d.ts': `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/building-your-application/configuring/typescript for more information.
`,
    'app/layout.tsx': `import React from 'react';

export const metadata = {
    title: 'Weblab',
    description: 'New Weblab project',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
`,
    'app/page.tsx': `export default function Home() {
    return (
        <main style={{ padding: '4rem', fontFamily: 'system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>Welcome to your new project</h1>
            <p style={{ marginTop: '1rem', color: '#555' }}>
                Start prompting in the chat to build something.
            </p>
        </main>
    );
}
`,
    'app/globals.css': `* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
`,
    '.gitignore': `node_modules
.next
out
.env*.local
`,
};

(async () => {
    const sdk = new CodeSandbox(apiKey);

    console.log('Step 1/5: forking from default CSB template…');
    const sandbox = await sdk.sandboxes.create({
        source: 'template',
        title: 'Weblab Next.js blank template',
        description: 'Default template for new Weblab projects (Next.js 15 App Router)',
        privacy: 'public',
    });
    console.log('  forked:', sandbox.id);

    console.log('Step 2/5: connecting…');
    const session = await sandbox.connect();
    console.log('  connected.');

    console.log('Step 3/5: writing scaffold files…');
    // Wipe any default-template leftovers that conflict (README, .devcontainer
    // skeleton). We're authoring a fresh Next.js project on top.
    await session.commands.run('rm -rf README.md .devcontainer 2>/dev/null; true');
    for (const [path, content] of Object.entries(FILES)) {
        const parent = path.includes('/')
            ? path.split('/').slice(0, -1).join('/')
            : null;
        if (parent) {
            try {
                await session.fs.mkdir(parent, true);
            } catch (err) {
                // mkdir on existing dir is fine
            }
        }
        await session.fs.writeTextFile(path, content);
        console.log('  wrote', path);
    }

    console.log('Step 4/5: installing deps (this takes ~60s)…');
    const installOut = await session.commands.run(
        'npm install --no-audit --no-fund 2>&1 | tail -15',
    );
    console.log(installOut);

    console.log('Step 5/5: verifying scaffold…');
    const verify = await session.commands.run(
        'echo === pkg.scripts ===; cat package.json | grep -A6 \\"scripts\\"; echo === tasks ===; cat .codesandbox/tasks.json | head -25; echo === app ===; ls app/; echo === node_modules ===; ls node_modules/.bin/ | grep -E \\"^next$\\" || echo NO_NEXT_BIN',
    );
    console.log(verify);

    console.log('\n=========================================');
    console.log('NEW TEMPLATE ID:', sandbox.id);
    console.log('Preview URL:    https://' + sandbox.id + '-3000.csb.app');
    console.log('Editor URL:     https://codesandbox.io/p/sandbox/' + sandbox.id);
    console.log('=========================================');
    console.log('\nNext: update packages/constants/src/csb.ts:');
    console.log("  BLANK: { id: '" + sandbox.id + "', port: 3000 },");
    console.log('\nThen hibernate to snapshot the working state:');
    console.log('  await sdk.sandboxes.hibernate("' + sandbox.id + '")');

    process.exit(0);
})().catch((err) => {
    console.error('\nFAILED:', err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
});
