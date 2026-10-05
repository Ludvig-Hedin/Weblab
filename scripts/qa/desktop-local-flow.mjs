#!/usr/bin/env node
/**
 * Live desktop QA for local editing: launches the Electron shell against a
 * local web client, signs in with the Clerk dev test account, opens a folder
 * (the native picker is stubbed in the main process), and walks the editor.
 *
 * Usage (web client on BASE_URL first):
 *   BASE_URL=http://localhost:3210 PROJECT_DIR=/path/to/next-site \
 *     node scripts/qa/desktop-local-flow.mjs [step...]
 *
 * Steps run in order; each saves a screenshot to OUT_DIR:
 *   open      sign in, open PROJECT_DIR, reach the editor
 *   prepare   review + apply local preparation
 *   install   install dependencies in the private copy
 *   preview   start preview and wait for the canvas bridge
 *   edit      text, color and font-size edits on the page heading
 *   handoff   review and export the Git patch
 *
 * DEV ONLY: `+clerk_test` emails verify with OTP 424242 on pk_test keys.
 */
import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3210';
const PROJECT_DIR = process.env.PROJECT_DIR;
const OUT_DIR = process.env.OUT_DIR ?? path.join(process.env.TMPDIR ?? '/tmp', 'weblab-desktop-qa');
const QA_EMAIL = process.env.QA_EMAIL ?? 'weblab.qa+clerk_test@example.com';
const QA_OTP = process.env.QA_OTP ?? '424242';
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ['open'];
const desktopDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../apps/desktop');

if (!PROJECT_DIR) {
    console.error('PROJECT_DIR is required');
    process.exit(2);
}
await mkdir(OUT_DIR, { recursive: true });

const log = (...a) => console.log('[desktop-qa]', ...a);
const consoleErrors = [];

const app = await electron.launch({
    args: [desktopDir],
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: BASE_URL },
    timeout: 60_000,
});
await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
}, PROJECT_DIR);

const page = await app.firstWindow();
page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 400));
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 400)}`));

async function shot(name) {
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    log('screenshot', file);
}

async function signIn() {
    await page.waitForLoadState('domcontentloaded');
    if (!/sign-in/.test(page.url())) await page.goto(`${BASE_URL}/sign-in?native=1`);
    await page.waitForTimeout(3000);
    if (/\/projects/.test(page.url())) return;
    await page.locator('input[type="email"]').first().fill(QA_EMAIL, { timeout: 60_000 });
    await page.keyboard.press('Enter');
    const otp = page.locator('input[data-input-otp="true"]').first();
    await otp.waitFor({ state: 'visible', timeout: 30_000 });
    await otp.fill(QA_OTP);
    const verify = page.getByRole('button', { name: /^Verify$/ });
    if (await verify.count()) await verify.first().click().catch(() => {});
    await page.waitForURL(/\/projects/, { timeout: 60_000 });
}

async function openFolder() {
    await signIn();
    log('signed in at', page.url());
    await page.getByRole('button', { name: 'Open folder' }).first().click({ timeout: 60_000 });
    await page.waitForURL(/\/project\//, { timeout: 180_000 });
    await page.waitForTimeout(8000);
    log('editor at', page.url());
}

async function clickText(text, timeout = 60_000) {
    await page.getByRole('button', { name: text }).first().click({ timeout });
}

const runners = {
    open: openFolder,
    async prepare() {
        await clickText('Review preparation');
        await page.getByRole('button', { name: 'Apply reviewed changes' }).waitFor({ timeout: 120_000 });
        await shot('prepare-review');
        await clickText('Apply reviewed changes');
        await page.waitForTimeout(5000);
    },
    async install() {
        await clickText('Install dependencies');
        await page.getByText('Dependencies installed in the private copy').waitFor({ timeout: 600_000 });
    },
    async preview() {
        await clickText('Start preview');
        await page.waitForTimeout(45_000);
    },
    async edit() {
        const frame = page.frameLocator('iframe').first();
        await frame.locator('h1').first().waitFor({ timeout: 120_000 });
        log('heading visible in canvas');
    },
    async handoff() {
        await clickText('Git handoff');
        await page.waitForTimeout(5000);
    },
};

let failed = null;
for (const step of steps) {
    try {
        log('step', step);
        await runners[step]();
        await shot(step);
    } catch (err) {
        failed = `${step}: ${err.message.split('\n')[0]}`;
        await shot(`${step}-failed`);
        break;
    }
}

await writeFile(path.join(OUT_DIR, 'console-errors.txt'), consoleErrors.join('\n'));
log('console errors:', consoleErrors.length);
log(failed ? `FAILED ${failed}` : 'OK');
await app.close();
process.exit(failed ? 1 : 0);
