#!/usr/bin/env node
/**
 * check-preload-pin — guards against the "stale prod preload pin" class of bug.
 *
 * In production the editor injects the penpal preload `<Script>` from a jsDelivr
 * URL pinned to a fixed commit SHA (`WEBLAB_PROD_PRELOAD_SCRIPT_SRC` in
 * packages/constants/src/files.ts). jsDelivr serves that exact commit forever, so
 * when the preload bundle is rebuilt the pin must be bumped — otherwise every
 * preload method added since the pin throws penpal `METHOD_NOT_FOUND` in prod
 * (incident 2026-06-17: "Method `getFigmaSceneData` is not found").
 *
 * This script fetches the ACTUAL pinned URL and verifies it exposes every method
 * the editor client calls (`remoteMethods` in the frame view). Run it AFTER
 * bumping the pin and BEFORE / as part of a prod deploy:
 *
 *     bun run check:preload-pin
 *
 * Exit 0 = pin serves every client-required method. Exit 1 = stale pin (or a
 * method the client calls that prod can't answer) — bump
 * WEBLAB_PROD_PRELOAD_SCRIPT_SRC to a pushed commit containing the current
 * bundle. It is intentionally NOT a unit test: a jsDelivr `@sha` can only point
 * at already-pushed history, so a per-PR test would always fail the very PR that
 * adds a method. This runs at release time, against real served content.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FILES_TS = resolve(repoRoot, 'packages/constants/src/files.ts');
const VIEW_TSX = resolve(
    repoRoot,
    'apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx',
);

function fail(msg) {
    console.error(`[31m✗ check-preload-pin: ${msg}[0m`);
    process.exit(1);
}

// 1. Resolve the prod pin URL from the constant (it is not exported, so parse it).
const filesSrc = readFileSync(FILES_TS, 'utf8');
const urlMatch = filesSrc.match(
    /const\s+WEBLAB_PROD_PRELOAD_SCRIPT_SRC\s*=\s*['"]([^'"]+)['"]/,
);
if (!urlMatch) {
    fail('could not find WEBLAB_PROD_PRELOAD_SCRIPT_SRC in packages/constants/src/files.ts');
}
const prodUrl = urlMatch[1];

// 2. Collect every method the editor client calls over penpal (frame view's
//    `remoteMethods` map: `<name>: promisifyMethod(penpalChild?.<name>)`).
const viewSrc = readFileSync(VIEW_TSX, 'utf8');
const required = [...viewSrc.matchAll(/(\w+):\s*promisifyMethod\(/g)].map((m) => m[1]);
const requiredMethods = [...new Set(required)];
if (requiredMethods.length === 0) {
    fail('found no `: promisifyMethod(` entries in view.tsx — extraction pattern is stale');
}

console.log(`→ pin: ${prodUrl}`);
console.log(`→ verifying ${requiredMethods.length} client-required preload methods are served…`);

// 3. Fetch the actual served bundle and check each method is registered. Penpal
//    preserves method names as object keys, so each appears as `<name>:` in the
//    minified bundle (e.g. `getFigmaSceneData:Gf`).
const res = await fetch(prodUrl).catch((err) => fail(`fetch failed: ${err?.message ?? err}`));
if (!res.ok) {
    fail(`fetch returned ${res.status} ${res.statusText} for ${prodUrl}`);
}
const bundle = await res.text();

const missing = requiredMethods.filter((name) => !bundle.includes(`${name}:`));

if (missing.length > 0) {
    console.error('');
    fail(
        `prod preload pin is STALE — missing ${missing.length} method(s) the client calls:\n` +
            `    ${missing.join(', ')}\n` +
            `  Rebuild the bundle, push it, then bump WEBLAB_PROD_PRELOAD_SCRIPT_SRC to that commit.`,
    );
}

console.log(`[32m✓ check-preload-pin: all ${requiredMethods.length} methods served by the pinned bundle.[0m`);
