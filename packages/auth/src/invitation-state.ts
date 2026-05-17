import { InvitationStatus } from '@weblab/models';

/**
 * Pure validators for the invitation state machine. Returned error tags map
 * 1:1 to user-facing messages in the router. Extracted from the router so
 * the state transitions can be unit-tested without a DB.
 *
 *   pending --accept--> accepted   (terminal)
 *   pending --revoke--> revoked    (terminal)
 *   pending --time--->  expired    (terminal; lazy-flipped on next read)
 *
 * No other transitions are allowed. Once a row is accepted/revoked/expired
 * it is immutable from the state-machine perspective.
 */
export type InvitationStateError = 'already_accepted' | 'revoked' | 'expired' | 'not_pending';

export interface InvitationStateSnapshot {
    status: InvitationStatus;
    expiresAt: Date;
}

export function checkAcceptable(
    invitation: InvitationStateSnapshot,
    now: Date,
): InvitationStateError | null {
    if (invitation.status === InvitationStatus.ACCEPTED) return 'already_accepted';
    if (invitation.status === InvitationStatus.REVOKED) return 'revoked';
    if (invitation.status === InvitationStatus.EXPIRED) return 'expired';
    // Strict greater-than: an invitation is valid up to AND INCLUDING the
    // exact `expiresAt` instant. Using `>=` here would deny a click that
    // arrives in the same second the row was authored to expire.
    if (now > invitation.expiresAt) return 'expired';
    return null;
}

export function checkRevocable(invitation: {
    status: InvitationStatus;
}): InvitationStateError | null {
    if (invitation.status !== InvitationStatus.PENDING) return 'not_pending';
    return null;
}

export function isEmailMatch(invitationEmail: string, callerEmail: string | null): boolean {
    if (!callerEmail) return false;
    return invitationEmail.trim().toLowerCase() === callerEmail.trim().toLowerCase();
}
