import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

export const metadata: Metadata = {
    title: `Terms of Service | ${APP_NAME}`,
    description: `${APP_NAME} terms of service. Read the legal terms governing your use of ${APP_NAME}.`,
    alternates: {
        canonical: `https://${APP_DOMAIN}/terms-of-service`,
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
