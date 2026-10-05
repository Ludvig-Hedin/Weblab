export type ReviewTicket = { ticket: string; url: string };

export function validReviewReleaseId(value: string) {
    return /^[a-z0-9]{1,64}$/.test(value);
}

/** The ticket stays in the POST body, never in history, storage or a URL. */
export function submitReviewTicket(document: Document, issued: ReviewTicket, expectedUrl: string) {
    if (issued.url !== expectedUrl || !/^[a-f0-9]{64}$/.test(issued.ticket)) {
        throw new Error('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = expectedUrl;
    form.target = '_self';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'ticket';
    input.value = issued.ticket;
    form.append(input);
    document.body.append(form);
    try { form.submit(); } finally { form.remove(); }
}

/** Strict Mode may resubscribe to the same issuance; only a live subscriber may navigate. */
export function observeReviewTicket(
    ticket: Promise<ReviewTicket>,
    current: () => boolean,
    submit: (issued: ReviewTicket) => void,
    fail: () => void,
) {
    let active = true;
    void ticket.then(issued => {
        if (active && current()) submit(issued);
    }).catch(() => {
        if (active && current()) fail();
    });
    return () => { active = false; };
}
