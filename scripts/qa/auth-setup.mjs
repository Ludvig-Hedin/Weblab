#!/usr/bin/env node
/**
 * Weblab QA auth setup — produces an authenticated Playwright storageState for
 * LOCALHOST (Clerk development keys). Any `+clerk_test` email verifies with the
 * fixed OTP `424242`, so this is deterministic and needs no inbox or human relay.
 *
 * See docs/agent-context/agent-qa-access.md (Route 2). DEV-ONLY: this works only
 * against a localhost dev server (pk_test). It does NOT work against prod
 * weblab.build (pk_live) unless Clerk production test mode is enabled.
 *
 * Usage (start `bun dev:ui` or `bun dev:remote` first):
 *   node scripts/qa/auth-setup.mjs
 *
 * Env overrides:
 *   BASE_URL    default http://localhost:3000
 *   QA_EMAIL    default weblab.qa+clerk_test@example.com  (must contain +clerk_test)
 *   QA_OTP      default 424242
 *   STATE_PATH  default $TMPDIR/weblab-local-auth-state.json
 *   HEADLESS    default true ("false" to watch)
 *
 * The saved storageState holds a live session cookie — never commit it; it lives
 * under $TMPDIR (session-scoped). Reuse it via
 *   browser.newContext({ storageState: STATE_PATH })
 */
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const QA_EMAIL = process.env.QA_EMAIL ?? 'weblab.qa+clerk_test@example.com';
const QA_OTP = process.env.QA_OTP ?? '424242';
const STATE_PATH =
    process.env.STATE_PATH ??
    path.join(process.env.TMPDIR ?? os.tmpdir(), 'weblab-local-auth-state.json');
const HEADLESS = process.env.HEADLESS !== 'false';

function log(...a) {
    console.log('[auth-setup]', ...a);
}

if (!QA_EMAIL.includes('+clerk_test')) {
    log(`WARNING: QA_EMAIL "${QA_EMAIL}" has no +clerk_test tag — OTP ${QA_OTP} will not auto-verify.`);
}

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext();
const page = await context.newPage();

async function dumpAndExit(stage, err) {
    try {
        const shot = path.join(path.dirname(STATE_PATH), 'auth-setup-failure.png');
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        log(`FAILED at "${stage}": ${err?.message ?? err}`);
        log(`current url: ${page.url()}`);
        log(`debug screenshot: ${shot}`);
    } finally {
        await browser.close();
        process.exit(1);
    }
}

try {
    log(`signing in at ${BASE_URL}/sign-in as ${QA_EMAIL}`);
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // If already authenticated (cookie reused upstream), /sign-in may bounce.
    if (/\/projects(\/|$|\?)/.test(page.url())) {
        log('already authenticated — saving state.');
        await context.storageState({ path: STATE_PATH });
        await browser.close();
        log(`storageState written: ${STATE_PATH}`);
        process.exit(0);
    }

    await page.locator('input[type="email"]').first().fill(QA_EMAIL).catch((e) => {
        throw new Error(`email field not found: ${e.message}`);
    });
    await page.keyboard.press('Enter');

    // Clerk routes to /sign-in/verify, OR renders the OTP input inline.
    const otp = page.locator('input[data-input-otp="true"]').first();
    await Promise.race([
        page.waitForURL(/verify/, { timeout: 30_000 }),
        otp.waitFor({ state: 'visible', timeout: 30_000 }),
    ]).catch((e) => {
        throw new Error(`verify step did not appear after email submit: ${e.message}`);
    });

    await otp.waitFor({ state: 'visible', timeout: 15_000 });
    await otp.fill(QA_OTP);

    // The OTP component may auto-submit; if a Verify button exists, click it.
    const verifyBtn = page.getByRole('button', { name: /^Verify$/ });
    if (await verifyBtn.count()) {
        await verifyBtn.first().click().catch(() => {});
    }

    await page.waitForURL(/\/projects/, { timeout: 45_000 }).catch((e) => {
        throw new Error(`did not reach /projects after OTP — verification likely failed: ${e.message}`);
    });

    await context.storageState({ path: STATE_PATH });
    log(`authenticated — reached ${page.url()}`);
    log(`storageState written: ${STATE_PATH}`);
    await browser.close();
    process.exit(0);
} catch (err) {
    await dumpAndExit('sign-in', err);
}
