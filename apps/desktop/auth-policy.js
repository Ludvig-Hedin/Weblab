const { randomBytes, timingSafeEqual } = require('crypto');

const STATE_RE = /^[a-f0-9]{64}$/;
const HANDOFF_PATH = '/sign-in/desktop-handoff';
const REDEEM_PATH = '/sign-in/redeem';

function externalHttpUrl(value) {
    try {
        if (typeof value !== 'string') return null;
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
            ? url.toString() : null;
    } catch { return null; }
}

function isTrustedSender(event, webContents, origins) {
    try {
        return Boolean(webContents) && event.sender === webContents &&
            event.senderFrame === webContents.mainFrame &&
            origins.has(new URL(event.senderFrame.url).origin);
    } catch { return false; }
}

function sameState(left, right) {
    return typeof left === 'string' && typeof right === 'string' &&
        STATE_RE.test(left) && STATE_RE.test(right) &&
        timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/** Process-local login state. A restart requires starting sign-in again. */
function createLoginHandoff({ origin, now = Date.now, randomState = () => randomBytes(32).toString('hex') }) {
    let pending = null;
    let approved = null;
    return {
        begin(value) {
            const safe = externalHttpUrl(value);
            if (!safe) return null;
            const url = new URL(safe);
            if (url.origin !== origin || url.pathname !== HANDOFF_PATH) return null;
            const state = randomState();
            if (!STATE_RE.test(state)) throw new Error('Invalid login state.');
            pending = { state, expires: now() + 10 * 60_000 };
            approved = null;
            url.searchParams.set('state', state);
            return { url: url.toString(), state };
        },
        cancel(state) {
            if (pending && sameState(pending.state, state)) pending = null;
        },
        accept(ticket, state) {
            if (typeof ticket !== 'string' || !ticket || ticket.length > 16_384 ||
                !pending || pending.expires <= now() || !sameState(pending.state, state)) return null;
            pending = null;
            approved = { ticket, state, expires: now() + 60_000 };
            const target = new URL(REDEEM_PATH, origin);
            target.searchParams.set('ticket', ticket);
            target.searchParams.set('state', state);
            target.searchParams.set('native', '1');
            return target.toString();
        },
        claim(ticket, state, frameUrl) {
            let url;
            try { url = new URL(frameUrl); } catch { return false; }
            if (!approved || approved.expires <= now() || url.origin !== origin ||
                url.pathname !== REDEEM_PATH || approved.ticket !== ticket ||
                url.searchParams.get('ticket') !== ticket || url.searchParams.get('state') !== state ||
                !sameState(approved.state, state)) return false;
            approved = null; // Atomic, before the renderer can sign out.
            return true;
        },
    };
}

module.exports = { createLoginHandoff, externalHttpUrl, isTrustedSender, STATE_RE };
