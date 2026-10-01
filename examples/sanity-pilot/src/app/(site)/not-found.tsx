import Link from 'next/link';

import copy from '../../lib/copy.json';

export default function NotFound() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            <h1 className="text-3xl font-medium">{copy.notFound}</h1>
            <Link href="/" className="text-accent mt-6 inline-block underline">
                {copy.backHome}
            </Link>
        </main>
    );
}
