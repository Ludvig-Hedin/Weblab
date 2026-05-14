import { notFound } from 'next/navigation';

import { isLocalhost } from '@/app/design-system/actions';

export default async function BlocksLayout({ children }: { children: React.ReactNode }) {
    if (!(await isLocalhost())) {
        notFound();
    }
    return <>{children}</>;
}
