import { render } from '@react-email/components';

import { APP_NAME, SUPPORT_EMAIL } from '@weblab/constants';

import type { InviteUserEmailProps, InviteWorkspaceEmailProps } from './templates';
import type { SendEmailParams } from './types/send-email';
import { InviteUserEmail, InviteWorkspaceEmail } from './templates';

export const sendInvitationEmail = async (...params: SendEmailParams<InviteUserEmailProps>) => {
    const [client, inviteParams, { dryRun = false } = {}] = params;
    const { inviteeEmail, invitedByEmail, invitedByName } = inviteParams;

    if (dryRun) {
        const rendered = await render(InviteUserEmail(inviteParams));
        console.log(rendered);
        return;
    }

    return await client.emails.send({
        from: `${APP_NAME} <${SUPPORT_EMAIL}>`,
        to: inviteeEmail,
        subject: `Join ${invitedByName ?? invitedByEmail} on ${APP_NAME}`,
        react: InviteUserEmail(inviteParams),
    });
};

export const sendWorkspaceInvitationEmail = async (
    ...params: SendEmailParams<InviteWorkspaceEmailProps>
) => {
    const [client, inviteParams, { dryRun = false } = {}] = params;
    const { inviteeEmail, workspaceName } = inviteParams;

    if (dryRun) {
        const rendered = await render(InviteWorkspaceEmail(inviteParams));
        console.log(rendered);
        return;
    }

    return await client.emails.send({
        from: `${APP_NAME} <${SUPPORT_EMAIL}>`,
        to: inviteeEmail,
        subject: `Join ${workspaceName} on ${APP_NAME}`,
        react: InviteWorkspaceEmail(inviteParams),
    });
};

export const constructInvitationLink = (publicUrl: string, invitationId: string, token: string) => {
    const url = new URL(`/invitation/${invitationId}`, publicUrl);
    url.searchParams.set('token', token);
    return url.toString();
};

export const constructWorkspaceInvitationLink = (
    publicUrl: string,
    invitationId: string,
    token: string,
) => {
    const url = new URL(`/invitation/workspace/${invitationId}`, publicUrl);
    url.searchParams.set('token', token);
    return url.toString();
};
