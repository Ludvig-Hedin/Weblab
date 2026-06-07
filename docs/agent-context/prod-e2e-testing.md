# Production E2E Testing

Use this when an agent needs an authenticated session on
`https://weblab.build` for browser QA.

## Auth Accounts

- Localhost uses Clerk development keys. Any `+clerk_test` email can verify with
  OTP `424242`, for example `weblab.qa+clerk_test@example.com`.
- Production uses Clerk live keys. Do not assume `+clerk_test` works there
  unless Clerk production test mode has been explicitly enabled.
- Do not commit production passwords, OTPs, session cookies, Clerk tickets, or
  Playwright storage state files.

## Recommended Agent Flow

1. Open `https://weblab.build/sign-in`.
2. Enter a fresh disposable email address that the agent can read during the
   session. `mail.tm` works from the local agent environment as of 2026-06-05.
3. Fetch the 6-digit verification code from that inbox.
4. Fill `input[data-input-otp="true"]` with the full code, then click
   `Verify`.
5. Save Playwright storage state to `/tmp/weblab-prod-auth-state.json` for the
   current run only.

Example skeleton:

```ts
await page.goto('https://weblab.build/sign-in');
await page.locator('input[type="email"]').fill(email);
await page.keyboard.press('Enter');
await page.waitForURL(/verify/);
await page.locator('input[data-input-otp="true"]').fill(code);
await page.getByRole('button', { name: /^Verify$/ }).click();
await context.storageState({ path: '/tmp/weblab-prod-auth-state.json' });
```

## Production Test Mode Check

Agents may quickly check whether production Clerk test mode is enabled:

1. Sign in with `weblab.qa+clerk_test@example.com`.
2. Fill the OTP field with `424242`.
3. If verification fails or no verify route appears, production test mode is not
   enabled. Use a disposable inbox instead.

Clerk documents that `+clerk_test` addresses and OTP `424242` work in
development instances by default and in production only when production test
mode is enabled.

## Latest Smoke Results

- **2026-06-07:** Unauthenticated production smoke passed for `/`, `/pricing`,
  `/blog`, `/changelog`, `/sign-in`, and `/projects`.
- `/projects` correctly redirected to `/sign-in?returnUrl=%2Fprojects`.
- `/changelog` on production showed the latest local release content verified in
  this pass: `v3.8` / `Jun 5, 2026` / "Edit local projects in the desktop app".
- Authenticated production dashboard/editor E2E was not exercised in this pass;
  production auth still requires a live email/OAuth session per the flow above.
