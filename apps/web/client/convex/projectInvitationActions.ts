'use node';

import { v } from 'convex/values';

import { api, internal } from './_generated/api';
import { action } from './_generated/server';
import { vProjectMemberRole } from './lib/enums';

// Node-only action: sends invitation email via Resend, then inserts the
// invitation row via internal mutation. If email send fails, the row is
// rolled back so the dashboard doesn't show a ghost invite.

const INVITE_EXPIRY_DAYS = 7;

function randomToken(): string {
    // 32 bytes hex — same size/shape as workspace invite tokens.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function constructInvitationLink(siteUrl: string, invitationId: string, token: string): string {
    const base = siteUrl.replace(/\/$/, '');
    const params = new URLSearchParams({ id: invitationId, token });
    return `${base}/invite?${params.toString()}`;
}

async function sendInvitationEmail(args: {
    apiKey: string;
    from: string;
    inviteeEmail: string;
    invitedByName?: string;
    invitedByEmail?: string;
    inviteLink: string;
    dryRun: boolean;
}): Promise<{ id?: string; error?: unknown }> {
    if (args.dryRun) {
        console.log('[project invite] dry-run email', args.inviteLink);
        return { id: 'dry-run' };
    }
    const subject = args.invitedByName
        ? `${args.invitedByName} invited you to a Weblab project`
        : 'You have been invited to a Weblab project';
    const html = `
        <p>${
            args.invitedByName ?? args.invitedByEmail ?? 'Someone'
        } has invited you to collaborate on a project on Weblab.</p>
        <p><a href="${args.inviteLink}">Open invitation</a></p>
    `;
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify({
            from: args.from,
            to: [args.inviteeEmail],
            subject,
            html,
        }),
    });
    if (!res.ok) {
        return { error: await res.text().catch(() => `HTTP ${res.status}`) };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: json.id };
}

/**
 * Creates a project invitation: validates cap + conflicts via internal
 * mutation, then sends the email. Rolls back the row if the email send
 * fails so the dashboard doesn't show an invite that never reached the
 * recipient.
 */
export const create = action({
    args: {
        projectId: v.id('projects'),
        inviteeEmail: v.string(),
        memberRole: vProjectMemberRole,
    },
    handler: async (ctx, args): Promise<unknown> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) {
            throw new Error('RESEND_API_KEY is not set, cannot send email');
        }
        const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'Weblab <no-reply@weblab.build>';
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://weblab.build';
        const dryRun = process.env.EMAIL_DRY_RUN === 'true';

        const token = randomToken();
        const expiresAt = Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

        const invitation: any = await ctx.runMutation(
            internal.projectInvitations._validateAndInsert,
            {
                actorUserId: me._id,
                projectId: args.projectId,
                inviteeEmail: args.inviteeEmail,
                memberRole: args.memberRole,
                token,
                expiresAt,
            },
        );

        const sendResult = await sendInvitationEmail({
            apiKey: resendKey,
            from: fromAddress,
            inviteeEmail: args.inviteeEmail,
            invitedByName: me.firstName ?? me.displayName ?? undefined,
            invitedByEmail: me.email ?? undefined,
            inviteLink: constructInvitationLink(siteUrl, invitation._id, token),
            dryRun,
        });

        if (sendResult.error) {
            await ctx.runMutation(internal.projectInvitations._rollbackInvitation, {
                invitationId: invitation._id,
            });
            console.error('[invitation.create] sendInvitationEmail failed', {
                invitationId: invitation._id,
                error: sendResult.error,
            });
            throw new Error('Failed to send invitation email. Please try again.');
        }

        return invitation;
    },
});
