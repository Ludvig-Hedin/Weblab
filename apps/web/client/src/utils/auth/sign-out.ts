'use client';

/**
 * Post-migration sign-out — Clerk only.
 *
 * `clerkSignOut` should be the function from `useClerk().signOut`. Pass it in
 * so this stays a pure helper without React context.
 */
export async function signOutEverywhere(clerkSignOut?: () => Promise<unknown>): Promise<void> {
    if (!clerkSignOut) return;
    await clerkSignOut();
}
