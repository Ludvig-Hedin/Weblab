import type { useSignIn } from '@clerk/nextjs/legacy';

type SignIn = NonNullable<ReturnType<typeof useSignIn>['signIn']>;
export type InvitationSignInAttempt = SignIn;
type Session = { id: string; status: string; currentTask?: unknown };

export function invitationSessionUsable(session: Session | null | undefined): boolean {
    return !!session?.id && session.status === 'active' && !session.currentTask;
}

export function invitationSignInNext(
    result: Pick<SignIn, 'status' | 'createdSessionId'>,
    sessions: readonly Session[],
) {
    if (result.status === 'needs_second_factor') return { kind: 'second-factor' } as const;
    if (result.status !== 'complete') return { kind: 'unsupported' } as const;
    const session = sessions.find((item) => item.id === result.createdSessionId);
    if (!result.createdSessionId || !invitationSessionUsable(session))
        return { kind: 'session-blocked' } as const;
    return { kind: 'activate', sessionId: result.createdSessionId } as const;
}

export function invitationEmailFactor(result: Pick<SignIn, 'status' | 'supportedFirstFactors'>) {
    if (result.status !== 'needs_first_factor') return null;
    return result.supportedFirstFactors?.find((factor) => factor.strategy === 'email_code') ?? null;
}
