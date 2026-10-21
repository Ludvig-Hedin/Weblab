/**
 * Pure parsers for CLI sign-in probes and CLI failure messages.
 *
 *   claude auth status   → JSON `{ loggedIn: boolean, … }` (exit 1 when signed out)
 *   codex login status   → "Logged in using …" / "Not logged in" (exit 1 when signed out)
 *
 * Returns 'ready' | 'sign-in' | 'unknown'. 'unknown' means the probe could not
 * tell (old CLI, timeout); the picker treats it as usable and the chat turn
 * surfaces a clear error if sign-in is really missing.
 */

const SIGNED_OUT = /not logged in|not signed in|login required|authentication required|run `?(claude|codex) (auth )?login`?/i;

function parseClaudeAuthStatus({ code, stdout = '', stderr = '' } = {}) {
    const trimmed = stdout.trim();
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.loggedIn === true) return 'ready';
            if (parsed.loggedIn === false) return 'sign-in';
        } catch {
            // fall through to text checks
        }
    }
    if (SIGNED_OUT.test(`${stdout}\n${stderr}`)) return 'sign-in';
    if (/unknown command|unrecognized|unexpected argument/i.test(`${stdout}\n${stderr}`)) return 'unknown';
    return code === 0 ? 'ready' : 'unknown';
}

function parseCodexLoginStatus({ code, stdout = '', stderr = '' } = {}) {
    const text = `${stdout}\n${stderr}`;
    if (SIGNED_OUT.test(text)) return 'sign-in';
    if (/unknown command|unrecognized|unexpected argument/i.test(text)) return 'unknown';
    if (code === 0 && /logged in/i.test(text)) return 'ready';
    return code === 0 ? 'ready' : 'unknown';
}

const LABELS = { 'claude-code': 'Claude Code', codex: 'Codex' };
const LOGIN = { 'claude-code': 'claude auth login', codex: 'codex login' };

/** Turn raw CLI failure text into a chat error a person can act on. */
function describeCliFailure(provider, rawText) {
    const label = LABELS[provider] ?? provider;
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (/not logged in|login|log in|sign in|authenticat|api key|unauthori[sz]ed|401|oauth token/i.test(text)) {
        return {
            code: 'not_signed_in',
            message: `${label} is not signed in. Open Terminal, run \`${LOGIN[provider] ?? 'login'}\`, then try again.`,
        };
    }
    if (/rate limit|usage limit|quota|429/i.test(text)) {
        return { code: 'rate_limited', message: `${label} hit its usage limit. ${firstLine(text)}`.trim() };
    }
    if (/model/i.test(text) && /not found|invalid|unknown|not supported|does not exist/i.test(text)) {
        return { code: 'invalid_model', message: `${label} does not accept this model. Pick another one. ${firstLine(text)}`.trim() };
    }
    return {
        code: 'cli_error',
        message: text ? `${label} stopped: ${firstLine(text)}` : `${label} stopped unexpectedly.`,
    };
}

function firstLine(text) {
    const line = (text || '').split('\n').find((l) => l.trim()) ?? '';
    return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

module.exports = { parseClaudeAuthStatus, parseCodexLoginStatus, describeCliFailure };
