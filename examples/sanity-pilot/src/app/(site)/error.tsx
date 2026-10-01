'use client';

import copy from '../../lib/copy.json';

export default function ContentError() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            <h1 className="text-3xl font-medium">{copy.contentError}</h1>
            <p className="text-muted mt-4">{copy.contentErrorHint}</p>
            <button
                onClick={() => window.location.reload()}
                className="text-accent mt-6 cursor-pointer underline"
            >
                {copy.tryAgain}
            </button>
        </main>
    );
}
