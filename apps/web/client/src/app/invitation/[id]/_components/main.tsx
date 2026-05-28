'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Skeleton } from '@weblab/ui/skeleton';

import type { Id } from '@convex/_generated/dataModel';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { signOutEverywhere } from '@/utils/auth/sign-out';
import { Routes } from '@/utils/constants';
import { resetTelemetry } from '@/utils/telemetry';

// Convex `Id` strings are lowercase base32-ish — alphanumeric, ~32 chars.
// Anything else is a user-pasted garbage URL (`/invitation/abc?token=…`) that
// would otherwise crash the page: the server-side `v.id('projectInvitations')`
// validator throws, the throw bubbles to the root ErrorBoundary, and the user
// sees "Unexpected error" instead of the page-local "Invitation not found"
// card. Pre-filtering with `useQuery('skip')` keeps the failure mode polite.
//
// The pattern is intentionally loose (16+ chars) so any real Convex id passes;
// real garbage (single words, integers, emails) is caught and a false-positive
// on a malformed-but-plausible id falls through to the server validator and
// still produces "Invitation not found" via the `!invitation` branch below.
const CONVEX_ID_LIKE = /^[a-z0-9]{16,}$/i;

export function Main({ invitationId }: { invitationId: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { signOut: clerkSignOut } = useClerk();
    // Convex queries throw to nearest ErrorBoundary on failure rather than
    // returning an error — error state is reserved for the mutation path only.
    const [acceptInvitationError, setAcceptInvitationError] = useState<Error | null>(null);
    const [isAcceptingInvitation, setIsAcceptingInvitation] = useState(false);

    const idLooksValid = CONVEX_ID_LIKE.test(invitationId);

    const invitation = useQuery(
        api.projectInvitations.getWithoutToken,
        idLooksValid ? { id: invitationId as Id<'projectInvitations'> } : 'skip',
    );
    const loadingInvitation = idLooksValid && invitation === undefined;

    const acceptInvitationMutation = useMutation(api.projectInvitations.accept);

    const acceptInvitation = async (args: { id: string; token: string }) => {
        setIsAcceptingInvitation(true);
        setAcceptInvitationError(null);
        try {
            await acceptInvitationMutation({
                id: args.id as Id<'projectInvitations'>,
                token: args.token,
            });
            if (invitation && 'projectId' in invitation && invitation.projectId) {
                router.push(`${Routes.PROJECT}/${invitation.projectId}`);
            } else {
                router.push(Routes.PROJECTS);
            }
        } catch (err) {
            setAcceptInvitationError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsAcceptingInvitation(false);
        }
    };

    const handleReAuthenticate = async () => {
        // Clear analytics/feedback identities before signing out
        void resetTelemetry();
        await signOutEverywhere(() => clerkSignOut());
        const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
        router.push(getSignInUrlClient(currentUrl));
    };

    const error = acceptInvitationError;

    if (loadingInvitation) {
        return (
            <div className="flex h-full w-full justify-center">
                <div className="flex w-5/6 flex-col items-center justify-center gap-4 md:w-1/2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-40 w-full" />
                    <div className="flex justify-center">
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex w-full flex-row">
                <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                    <div className="flex items-center gap-4">
                        <Icons.ExclamationTriangle className="h-6 w-6" />
                        <div className="text-2xl">Error accepting invitation</div>
                    </div>
                    <div className="text-md">{error.message}</div>
                    <div className="flex justify-center gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                router.push(Routes.PROJECTS);
                            }}
                        >
                            <Icons.ArrowLeft className="h-4 w-4" />
                            Back to home
                        </Button>
                        <Button type="button" onClick={handleReAuthenticate}>
                            Log in with different account
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!invitation || !token) {
        return (
            <div className="flex w-full flex-row">
                <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                    <div className="flex items-center gap-4">
                        <Icons.ExclamationTriangle className="h-6 w-6" />
                        <div className="text-xl">Invitation not found</div>
                    </div>
                    <div className="text-md">
                        The invitation you are looking for does not exist or has expired.
                    </div>
                    <div className="flex justify-center">
                        <Link
                            href="/"
                            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <Icons.ArrowLeft className="h-4 w-4" />
                            Back to home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const inviter =
        invitation.inviter.firstName ?? invitation.inviter.displayName ?? invitation.inviter.email;

    return (
        <div className="flex w-full flex-row">
            <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                <div className="text-xl">
                    Join {inviter} on {APP_NAME}
                </div>
                <div className="text-md text-foreground-tertiary">
                    {inviter} has invited you to join their project
                </div>
                <div className="flex justify-center">
                    <Button
                        type="button"
                        onClick={() => {
                            if (!token) return;
                            void acceptInvitation({
                                id: invitationId,
                                token,
                            });
                        }}
                        disabled={!token || isAcceptingInvitation}
                    >
                        Accept Invitation
                    </Button>
                </div>
            </div>
        </div>
    );
}
