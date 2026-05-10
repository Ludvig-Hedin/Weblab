import type { Metadata } from 'next';

import { APP_DOMAIN } from '@weblab/constants';

import { HomePageClientV2 } from '../_components/home-page-client-v2';

export const metadata: Metadata = {
    title: 'Landing v2',
    alternates: {
        canonical: `https://${APP_DOMAIN}/landing-v2`,
    },
    robots: {
        index: false,
        follow: false,
    },
};

export default function Page() {
    return <HomePageClientV2 />;
}
