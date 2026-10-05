import { describe, expect, test } from 'bun:test';
import { observeReviewTicket, submitReviewTicket, validReviewReleaseId, type ReviewTicket } from './review-launch';

const issued = { ticket: 'a'.repeat(64), url: 'https://release.review.example.com/__weblab_review_access' };
function deferred() {
    let resolve!: (value: ReviewTicket) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<ReviewTicket>((ok, fail) => { resolve = ok; reject = fail; });
    return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('review launch lifecycle', () => {
    test('Strict Mode replacement subscribes to one ticket and only the live opening submits', async () => {
        const request = deferred(), submitted: ReviewTicket[] = [];
        const cancel = observeReviewTicket(request.promise, () => true, value => submitted.push(value), () => {});
        cancel();
        observeReviewTicket(request.promise, () => true, value => submitted.push(value), () => {});
        request.resolve(issued); await flush();
        expect(submitted).toEqual([issued]);
    });
    test('unmount and account/release/attempt change discard pending success', async () => {
        for (const unmount of [true, false]) {
            const request = deferred(); let current = true, submits = 0;
            const cancel = observeReviewTicket(request.promise, () => current, () => submits++, () => {});
            if (unmount) cancel(); else current = false;
            request.resolve(issued); await flush();
            expect(submits).toBe(0);
        }
    });
    test('old failure cannot affect a new attempt; manual retry uses a fresh ticket', async () => {
        const old = deferred(), fresh = deferred(); let errors = 0; const submitted: ReviewTicket[] = [];
        const cancel = observeReviewTicket(old.promise, () => true, value => submitted.push(value), () => errors++);
        cancel();
        observeReviewTicket(fresh.promise, () => true, value => submitted.push(value), () => errors++);
        old.reject(new Error('old')); fresh.resolve({ ...issued, ticket: 'b'.repeat(64) }); await flush();
        expect(errors).toBe(0); expect(submitted).toEqual([{ ...issued, ticket: 'b'.repeat(64) }]);
    });
    test('issuance and submission failures show recovery only while current', async () => {
        let errors = 0;
        observeReviewTicket(Promise.reject(new Error('denied')), () => true, () => {}, () => errors++);
        observeReviewTicket(Promise.resolve(issued), () => true, () => { throw new Error('form'); }, () => errors++);
        await flush(); expect(errors).toBe(2);
    });
    test('rejects malformed route identifiers', () => {
        expect(validReviewReleaseId('nh7dx0r20285vj5zznfh8s75hn8fjr7p')).toBe(true);
        for (const value of ['', '../other', 'a?ticket=secret', '<script>', 'A', 'a'.repeat(65)]) expect(validReviewReleaseId(value)).toBe(false);
    });
    test('posts only the exact expected destination with a body ticket and removes the form', () => {
        let added = false, removed = false, submitted = false;
        const input = { type: '', name: '', value: '' };
        const form = { method: '', action: '', target: '', append(value: unknown) { expect(value).toBe(input); },
            submit() { expect(added).toBe(true); submitted = true; }, remove() { removed = true; } };
        const document = { createElement(tag: string) { return tag === 'form' ? form : input; },
            body: { append(value: unknown) { expect(value).toBe(form); added = true; } } } as unknown as Document;
        for (const bad of [{ ...issued, url: 'https://evil.example.com' }, { ...issued, ticket: 'invalid' }]) {
            expect(() => submitReviewTicket(document, bad, issued.url)).toThrow();
        }
        expect(added).toBe(false);
        submitReviewTicket(document, issued, issued.url);
        expect(form.method).toBe('POST'); expect(form.target).toBe('_self'); expect(form.action).toBe(issued.url);
        expect(input).toEqual({ type: 'hidden', name: 'ticket', value: issued.ticket });
        expect(submitted && removed).toBe(true);
    });
});
