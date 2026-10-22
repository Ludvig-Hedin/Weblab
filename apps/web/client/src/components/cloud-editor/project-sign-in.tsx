'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@weblab/ui/button';
import { CloudInvitationSignIn } from './invitation-sign-in';
import en from '../../../messages/cloud-invitation-auth/en.json';
import sv from '../../../messages/cloud-invitation-auth/sv.json';

/** Reopening a shared project authenticates here, then rechecks server admission. */
export function CloudProjectSignIn({ denied = false, onOpen }: { denied?: boolean; onOpen?: () => void }) {
    const copy = useLocale().startsWith('sv') ? sv : en;
    const router = useRouter();
    return <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
            <h1 className="text-xl font-medium">{copy.projectTitle}</h1>
            {denied && <p role="alert" className="text-sm text-foreground-secondary">{copy.projectDenied}</p>}
            <CloudInvitationSignIn>
                <Button onClick={() => { onOpen?.(); router.refresh(); }}>{copy.projectOpen}</Button>
            </CloudInvitationSignIn>
        </div>
    </main>;
}
