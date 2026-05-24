'use client';

import { notFound } from 'next/navigation';
import { SignInButton, SignOutButton, useUser } from '@clerk/nextjs';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';

// /dev/convex-smoke — Phase 3 validation surface.
//
// Confirms the Clerk → Convex pipe works end-to-end without affecting any
// production code path. Disabled outside development.

export default function ConvexSmokePage() {
    if (process.env.NODE_ENV === 'production') notFound();

    const { isSignedIn, user, isLoaded: clerkLoaded } = useUser();
    const ping = useQuery(api.ping.hello);
    const me = useQuery(api.users.me);
    const ensureCurrent = useMutation(api.users.ensureCurrent);

    return (
        <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
            <h1>Convex + Clerk smoke</h1>

            <section style={{ marginTop: 16 }}>
                <h2>Clerk</h2>
                <pre>
                    {JSON.stringify(
                        {
                            clerkLoaded,
                            isSignedIn,
                            clerkUserId: user?.id ?? null,
                            primaryEmail: user?.primaryEmailAddress?.emailAddress ?? null,
                        },
                        null,
                        2,
                    )}
                </pre>
                {clerkLoaded && !isSignedIn ? (
                    <SignInButton
                        mode="modal"
                        forceRedirectUrl="/dev/convex-smoke"
                        signUpForceRedirectUrl="/dev/convex-smoke"
                    >
                        <button>Sign in with Clerk</button>
                    </SignInButton>
                ) : null}
                {clerkLoaded && isSignedIn ? (
                    <SignOutButton>
                        <button>Sign out</button>
                    </SignOutButton>
                ) : null}
            </section>

            <section style={{ marginTop: 16 }}>
                <h2>Convex ping</h2>
                <pre>{JSON.stringify(ping ?? { loading: true }, null, 2)}</pre>
            </section>

            <section style={{ marginTop: 16 }}>
                <h2>Convex users.me</h2>
                <pre>{JSON.stringify(me ?? { loading: true }, null, 2)}</pre>
                <button
                    type="button"
                    onClick={() => ensureCurrent({}).catch((e) => alert(e.message))}
                    disabled={!isSignedIn}
                >
                    ensureCurrent() (JIT user-row insert)
                </button>
            </section>
        </main>
    );
}
