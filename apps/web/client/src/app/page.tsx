import type { Metadata } from 'next';

import { APP_DOMAIN } from '@weblab/constants';

import { HomePageClient } from './_components/home-page-client';

export const metadata: Metadata = {
    alternates: {
        canonical: `https://${APP_DOMAIN}/`,
    },
};

export default function Page() {
    return <HomePageClient />;
}
