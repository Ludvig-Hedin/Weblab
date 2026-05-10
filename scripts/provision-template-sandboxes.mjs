#!/usr/bin/env node
/**
 * One-time provisioner for the public template gallery.
 *
 * Every template in `apps/web/client/src/app/projects/_components/templates/template-data.ts`
 * either has a pre-seeded CodeSandbox `sandboxId` (fast `sandbox.fork` path,
 * ~2s) or falls back to `createProjectFromGit` (clones the repo on every
 * create, ~2-5 minutes for the current monorepo-based examples and frequently
 * fails). This script imports each unseeded template into CodeSandbox once,
 * captures the returned sandbox id, and prints a JSON map you can paste back
 * into `template-data.ts` (and `PUBLIC_TEMPLATE_SANDBOX_IDS` in
 * `packages/constants/src/csb.ts`).
 *
 * Idempotency: rerun safely. Pass `--only <id1,id2>` to provision a subset,
 * `--include-existing` to refresh templates that already have a `sandboxId`.
 *
 * Usage:
 *   CSB_API_KEY=csb_v1_... bun scripts/provision-template-sandboxes.mjs
 *   CSB_API_KEY=csb_v1_... bun scripts/provision-template-sandboxes.mjs --only portfolio-starter-kit,blog-starter-kit
 *
 * After it finishes, follow the "Next steps" printout it emits to wire the
 * new sandbox ids into source. The script never writes to source files — it
 * just prints — so you can review before committing.
 */

import { CodeSandbox } from '@codesandbox/sdk';

const apiKey = process.env.CSB_API_KEY;
if (!apiKey) {
    console.error('CSB_API_KEY env var required.');
    console.error('Get one from https://codesandbox.io/t/api → "Generate token".');
    process.exit(1);
}

// Kept in sync by hand with the EXTERNAL_TEMPLATES export. We avoid importing
// from the workspace because this is a node script run via `bun`/`node` and
// the consumer module is TypeScript with workspace path aliases.
const TEMPLATES = [
    {
        id: 'static-html-starter',
        repoUrl: 'https://github.com/h5bp/html5-boilerplate',
        branch: 'main',
        subpath: undefined,
        existingSandboxId: 'html-qz83hv',
    },
    {
        id: 'nextjs-boilerplate',
        repoUrl: 'https://github.com/vercel/vercel',
        branch: 'main',
        subpath: 'examples/nextjs',
        existingSandboxId: undefined,
    },
    {
        id: 'startd',
        repoUrl: 'https://github.com/jkytoela/next-startd',
        branch: 'main',
        subpath: undefined,
        existingSandboxId: undefined,
    },
    {
        id: 'portfolio-starter-kit',
        repoUrl: 'https://github.com/vercel/examples',
        branch: 'main',
        subpath: 'solutions/blog',
        existingSandboxId: undefined,
    },
    {
        id: 'marketing-site',
        repoUrl: 'https://github.com/chapter-three/next-drupal',
        branch: 'main',
        subpath: 'examples/example-marketing',
        existingSandboxId: undefined,
    },
    {
        id: 'shadcn-admin-dashboard',
        repoUrl: 'https://github.com/arhamkhnz/next-shadcn-admin-dashboard',
        branch: 'main',
        subpath: undefined,
        existingSandboxId: undefined,
    },
    {
        id: 'blog-starter-kit',
        repoUrl: 'https://github.com/vercel/next.js',
        branch: 'canary',
        subpath: 'examples/blog-starter',
        existingSandboxId: undefined,
    },
];

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlyIds = onlyArg
    ? onlyArg
          .replace('--only=', '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    : null;
const includeExisting = args.includes('--include-existing');

const targets = TEMPLATES.filter((t) => {
    if (onlyIds && !onlyIds.includes(t.id)) return false;
    if (t.existingSandboxId && !includeExisting) return false;
    return true;
});

if (targets.length === 0) {
    console.log(
        'Nothing to provision. All templates already have sandboxIds — pass --include-existing to refresh them.',
    );
    process.exit(0);
}

console.log(`Provisioning ${targets.length} template(s):`);
for (const t of targets) console.log(`  - ${t.id}`);
console.log();

const sdk = new CodeSandbox(apiKey);

/**
 * Mirrors the bash script in CodesandboxProvider.createProjectFromGit so the
 * resulting sandbox layout matches what users get from the live create flow.
 * Run inside `setup(session)` so the SDK manages the websocket lifetime.
 */
async function extractSubpath(session, subpath) {
    await session.commands.run(
        `bash -c '
set -euo pipefail
SUBPATH="\${WEBLAB_TEMPLATE_SUBPATH:-}"
case "$SUBPATH" in
  ""|/*|*..*|*//*) exit 64 ;;
esac
test -d "$SUBPATH"
tmp="$(mktemp -d)"
shopt -s dotglob nullglob
cp -a "$SUBPATH"/. "$tmp"/
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$tmp"/. .
rm -rf "$tmp"
'`,
        { env: { WEBLAB_TEMPLATE_SUBPATH: subpath } },
    );
}

const results = [];
let provisioned = 0;
let failed = 0;

for (const target of targets) {
    const label = `[${target.id}]`;
    console.log(`${label} cloning ${target.repoUrl}@${target.branch}${target.subpath ? ` (subpath: ${target.subpath})` : ''}…`);
    const started = Date.now();
    try {
        const sandbox = await sdk.sandboxes.create({
            source: 'git',
            url: target.repoUrl,
            branch: target.branch,
            privacy: 'public',
            async setup(session) {
                if (target.subpath) {
                    await extractSubpath(session, target.subpath);
                }
                await session.setup.run();
            },
        });
        const seconds = Math.round((Date.now() - started) / 1000);
        console.log(`${label} ✓ ${sandbox.id} (${seconds}s)`);
        // Hibernate so first user-fork pays cold-start (deterministic and fast
        // compared to forking a still-warm setup, which CSB may rebuild).
        await sdk.sandboxes.hibernate(sandbox.id).catch((err) => {
            console.warn(`${label} hibernate failed (non-fatal): ${err?.message ?? err}`);
        });
        results.push({ id: target.id, sandboxId: sandbox.id, durationSeconds: seconds });
        provisioned += 1;
    } catch (err) {
        const seconds = Math.round((Date.now() - started) / 1000);
        console.error(`${label} ✗ failed after ${seconds}s: ${err?.message ?? err}`);
        results.push({ id: target.id, error: err?.message ?? String(err) });
        failed += 1;
    }
}

console.log();
console.log('============================================================');
console.log(`Done. provisioned=${provisioned} failed=${failed} total=${targets.length}`);
console.log('============================================================');
console.log();
console.log('Paste the following into template-data.ts on the matching templates:');
console.log();
for (const r of results) {
    if (r.sandboxId) {
        console.log(`  ${r.id}: sandboxId: '${r.sandboxId}',`);
    } else {
        console.log(`  ${r.id}: FAILED — ${r.error}`);
    }
}
console.log();
console.log('Then add the new ids to PUBLIC_TEMPLATE_SANDBOX_IDS in packages/constants/src/csb.ts:');
console.log();
for (const r of results) {
    if (r.sandboxId) console.log(`  '${r.sandboxId}', // ${r.id}`);
}
console.log();
console.log('JSON (machine-readable):');
console.log(JSON.stringify(results, null, 2));

process.exit(failed > 0 ? 2 : 0);
