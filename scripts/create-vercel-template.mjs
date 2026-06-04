#!/usr/bin/env node
// Bake a Vercel Sandbox snapshot containing a post-`npm install`
// Next.js scaffold. Used by `sandbox.fork` (BLANK template fast-path)
// to skip the 60-180s scaffold + install on every new project.
//
// Usage:
//   VERCEL_TOKEN=vcp_... VERCEL_TEAM_ID=team_... VERCEL_PROJECT_ID=prj_... \
//     bun scripts/create-vercel-template.mjs
//
// On success prints:
//   VERCEL_BLANK_SNAPSHOT_ID=snap_xxxxxxxxxxxxxxxxx
//
// Copy the value into apps/web/client/.env.local. New blank projects
// will then resume from snapshot in ~3-8s instead of scaffolding from
// scratch.

import { Sandbox } from '@vercel/sandbox';

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const projectId = process.env.VERCEL_PROJECT_ID;

if (!token || !teamId || !projectId) {
    console.error('VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID env vars required.');
    process.exit(1);
}

const PORT = 3000;
const RUNTIME = 'node24';

function splitShellCommand(input) {
    const parts = input.split(/\s+/).filter(Boolean);
    return { cmd: parts[0], args: parts.slice(1) };
}

const PACKAGE_JSON = {
    name: 'weblab-blank-nextjs',
    version: '0.1.0',
    private: true,
    scripts: {
        dev: 'next dev --turbopack',
        build: 'next build',
        start: 'next start',
    },
    dependencies: {
        '@tailwindcss/postcss': '^4.1.6',
        next: '^15.3.2',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        tailwindcss: '^4.1.6',
    },
    devDependencies: {
        typescript: '^5.8.3',
        '@types/node': '^22.15.3',
        '@types/react': '^19.0.12',
        '@types/react-dom': '^19.0.4',
    },
};

const PAGE_TSX = `export default function Home() {
    return (
        <main className="flex min-h-screen items-center justify-center p-8">
            <div className="text-center">
                <h1 className="text-2xl font-medium">Hello from Weblab</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    Start editing on the canvas.
                </p>
            </div>
        </main>
    );
}
`;

const LAYOUT_TSX = `import './globals.css';

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
`;

const GLOBALS_CSS = `@import "tailwindcss";
`;

const POSTCSS = `module.exports = {
    plugins: { '@tailwindcss/postcss': {} },
};
`;

const TSCONFIG = {
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
        paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
};

// Module-scoped so the top-level catch can stop the VM if a bake step throws.
let sandbox;

async function main() {
    console.log('Creating sandbox...');
    sandbox = await Sandbox.create({
        ports: [PORT],
        runtime: RUNTIME,
        timeout: 30 * 60 * 1000,
        resources: { vcpus: 4 },
        token,
        teamId,
        projectId,
    });
    console.log('sandboxId:', sandbox.sandboxId);

    console.log('Writing scaffold...');
    await sandbox.writeFiles([
        { path: 'package.json', content: JSON.stringify(PACKAGE_JSON, null, 2) },
        { path: 'src/app/page.tsx', content: PAGE_TSX },
        { path: 'src/app/layout.tsx', content: LAYOUT_TSX },
        { path: 'src/app/globals.css', content: GLOBALS_CSS },
        { path: 'postcss.config.js', content: POSTCSS },
        { path: 'tsconfig.json', content: JSON.stringify(TSCONFIG, null, 2) },
        { path: 'next-env.d.ts', content: '/// <reference types="next" />\n' },
    ]);

    console.log('Running npm install (this takes 60-180s)...');
    const result = await sandbox.runCommand(splitShellCommand('npm install'));
    const out = await result.output('both');
    if (result.exitCode !== 0) {
        console.error('npm install failed:\n', out);
        throw new Error('npm install failed');
    }
    console.log('npm install done.');

    // Warm the dev server BEFORE snapshotting so the snapshot carries a hot
    // `.next` Turbopack build cache. Without this the snapshot is cold and the
    // first editor open pays a 30-90s first-compile (the preview domain 502s
    // until then). Use the SAME command the editor's setup() uses
    // (`--hostname 0.0.0.0`) so the warmed server binds the preview-reachable
    // host and setup()'s `isDevServerRunning` detection stays consistent.
    console.log('Warming dev server (first compile) so the snapshot is hot...');
    await sandbox.runCommand({
        cmd: 'bash',
        args: ['-lc', 'npm run dev -- --turbopack --hostname 0.0.0.0 > /tmp/weblab-dev.log 2>&1'],
        detached: true,
    });
    const probeArgs = [
        '-lc',
        `node -e 'const http=require("http");http.get("http://127.0.0.1:${PORT}",r=>{console.log(r.statusCode);process.exit(0)}).on("error",()=>{console.log("000");process.exit(0)})'`,
    ];
    const warmDeadline = Date.now() + 150_000;
    let warm = false;
    while (Date.now() < warmDeadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const probe = await sandbox.runCommand({ cmd: 'bash', args: probeArgs });
        const code = (await probe.output('stdout')).trim();
        if (code && code !== '000' && /^\d{3}$/.test(code)) {
            warm = true;
            break;
        }
    }
    if (!warm) {
        const logTail = await (
            await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'tail -n 40 /tmp/weblab-dev.log'] })
        ).output('stdout');
        console.error('Dev server failed to warm within 150s. Log tail:\n', logTail);
        throw new Error('dev server failed to warm');
    }
    // Let the first route fully render + Turbopack flush its cache to disk.
    console.log('Dev server warm (port responding). Settling 6s before snapshot...');
    await new Promise((r) => setTimeout(r, 6000));

    console.log('Snapshotting...');
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    console.log('');
    console.log('=== SUCCESS ===');
    console.log(`VERCEL_BLANK_SNAPSHOT_ID=${snapshot.snapshotId}`);
    console.log('');
    console.log('Add the above line to apps/web/client/.env.local');
    console.log('and restart `bun dev` for new blank projects to resume from snapshot.');

    // Free the live VM — the snapshot is an independent checkpoint, so the
    // running sandbox is no longer needed.
    await sandbox.stop({ blocking: false }).catch(() => {});
}

main().catch(async (err) => {
    console.error('Failed:', err);
    // Stop the orphaned VM so a failed bake doesn't leak a 4-vCPU sandbox for
    // the full 30-min timeout.
    if (sandbox) await sandbox.stop({ blocking: false }).catch(() => {});
    process.exit(1);
});
