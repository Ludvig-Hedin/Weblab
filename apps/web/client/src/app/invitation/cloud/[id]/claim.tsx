'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useAction, useConvexAuth } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useRouter } from 'next/navigation';
import { Button } from '@weblab/ui/button';
import type { Id } from '@convex/_generated/dataModel';
import { invitationApi, useCloudInvitationCopy } from '@/components/cloud-editor/invitation-api';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';

export function CloudInvitationClaim({ invitationId }: { invitationId: string }) {
    const copy = useCloudInvitationCopy();
    const { userId, isLoaded, isSignedIn } = useAuth();
    const { isAuthenticated, isLoading } = useConvexAuth();
    const claim = useAction(invitationApi.claim);
    const router = useRouter();
    const [token, setToken] = useState<string | null>(null);
    const [stored, setStored] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const actor = useRef(userId); actor.current = userId;
    const pending = useRef(false);
    const storageKey = `cloud-invitation:${invitationId}`;
    const validId = /^[a-z0-9]{16,64}$/.test(invitationId);
    useEffect(() => {
        let value = window.location.hash.slice(1);
        try {
            if (/^[a-f0-9]{64}$/.test(value)) sessionStorage.setItem(storageKey, value);
            else value = sessionStorage.getItem(storageKey) ?? '';
            setStored(/^[a-f0-9]{64}$/.test(value));
        } catch { setStored(false); }
        setToken(/^[a-f0-9]{64}$/.test(value) ? value : null);
        if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
    }, [storageKey]);
    async function accept() {
        if (!validId || !token || !isAuthenticated || pending.current) return;
        const expectedActor = actor.current;
        pending.current = true; setBusy(true); setError(null);
        try {
            const result = await claim({ invitationId: invitationId as Id<'cloudEditorInvitations'>, token });
            if (actor.current !== expectedActor) return;
            try { sessionStorage.removeItem(storageKey); } catch { /* Membership is committed; storage is only local recovery. */ }
            router.replace(`/project/${result.projectId}`);
        } catch (cause) {
            if (actor.current !== expectedActor) return;
            const code = cause instanceof ConvexError ? cause.data : null;
            setError(code === 'CLOUD_INVITATION_MEMBER_EXISTS' ? copy.memberExists : code === 'CLOUD_INVITATION_AUTH_UNAVAILABLE' ? copy.authUnavailable : copy.unavailable);
        } finally { pending.current = false; setBusy(false); }
    }
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-medium">{copy.openTitle}</h1>
        <p className="text-foreground-secondary text-sm">{copy.openHelp}</p>
        {!isLoaded || isLoading ? <p role="status">{copy.loading}</p> : !validId || !token ? <p role="alert">{copy.unavailable}</p> : !isSignedIn ? <>
            <Button disabled={!stored} onClick={() => router.push(getSignInUrlClient(`/invitation/cloud/${invitationId}`))}>{copy.signIn}</Button>
            {!stored && <p role="alert" className="text-sm">{copy.storageUnavailable}</p>}
        </> : <Button disabled={busy || !isAuthenticated} onClick={() => void accept()}>{busy ? copy.accepting : copy.accept}</Button>}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </div></main>;
}
