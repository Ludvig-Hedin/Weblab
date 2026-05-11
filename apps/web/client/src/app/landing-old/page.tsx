import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { env } from '@/env';
import { HomePageClientOld } from '../_components/home-page-client-old';

export const metadata: Metadata = {
    title: 'Landing (old)',
    robots: {
        index: false,
        follow: false,
    },
};

export default function Page() {
    if (env.NODE_ENV === 'production') {
        notFound();
    }
    return <HomePageClientOld />;
}
