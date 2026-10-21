import { describe, expect, it } from 'bun:test';
import { REVIEW_COOKIE, reviewCookie, reviewExchangeTicket, reviewSession } from './review-session';
import { isolatedReleaseReviewHost } from '@convex/lib/cloudReleaseReviewHost';

const ticket = 'ab'.repeat(32), app = 'https://app.example.com';
function post(body = `ticket=${ticket}`, origin = app) {
    return new Request('https://release.reviews.example.net/__weblab_review_access', {
        method: 'POST', body, headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
}
describe('review gateway handoff', () => {
    it('accepts exactly one body ticket from the exact trusted app origin', async () => {
        expect(await reviewExchangeTicket(post(), app)).toBe(ticket);
        for (const request of [post('', app), post(`ticket=${ticket}&ticket=${ticket}`), post(`ticket=${ticket}&extra=1`), post(`ticket=${ticket}`, 'https://evil.example.com'), post(`ticket=${'a'.repeat(600)}`)]) {
            await expect(reviewExchangeTicket(request, app)).rejects.toThrow();
        }
        await expect(reviewExchangeTicket(new Request(`https://release.reviews.example.net/?ticket=${ticket}`), app)).rejects.toThrow();
    });
    it('never accepts app auth cookies and refuses duplicate capability cookies', () => {
        expect(reviewSession('__session=app-secret; other=value')).toBeNull();
        expect(reviewSession(`${REVIEW_COOKIE}=${ticket}; ${REVIEW_COOKIE}=${ticket}`)).toBeNull();
        expect(reviewSession(`other=value; ${REVIEW_COOKIE}=${ticket}`)).toBe(ticket);
        expect(reviewSession(`${REVIEW_COOKIE}=invalid`)).toBeNull();
    });
    it('sets a host-only HttpOnly short session with no domain or script access', () => {
        const cookie = reviewCookie(ticket, 1000 + 60_000, 1000);
        expect(cookie).toContain('__Host-'); expect(cookie).toContain('Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=60');
        expect(cookie).not.toContain('Domain=');
        expect(() => reviewCookie(ticket, 1000, 1000)).toThrow();
        expect(() => reviewCookie(ticket, 1000 + 901_000, 1000)).toThrow();
    });
    it('rejects review hosts sharing app or Clerk registrable domains, including private suffixes', () => {
        expect(isolatedReleaseReviewHost(app, 'reviews.example.net', 'https://auth.example.com')).toBe(true);
        expect(isolatedReleaseReviewHost(app, 'reviews.example.com')).toBe(false);
        expect(isolatedReleaseReviewHost(app, 'review.example.co.uk', 'https://auth.example.co.uk')).toBe(false);
        expect(isolatedReleaseReviewHost('https://one.vercel.app', 'review.one.vercel.app')).toBe(false);
        expect(isolatedReleaseReviewHost('https://one.vercel.app', 'review.two.vercel.app')).toBe(true);
        expect(isolatedReleaseReviewHost('http://app.example.com', 'reviews.example.net')).toBe(false);
        expect(isolatedReleaseReviewHost(app, 'localhost')).toBe(false);
    });
});
