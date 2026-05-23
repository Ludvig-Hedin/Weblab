import { v } from 'convex/values';

// Convex validator versions of the Postgres enums shared across Weblab.
// Values must stay in sync with packages/models/src/**.

export const vWorkspaceKind = v.union(v.literal('personal'), v.literal('team'));

export const vWorkspaceRole = v.union(
    v.literal('owner'),
    v.literal('admin'),
    v.literal('member'),
    v.literal('viewer'),
);

export const vProjectMemberRole = v.union(
    v.literal('manager'),
    v.literal('editor'),
    v.literal('reviewer'),
    v.literal('viewer'),
);

export const vProjectAccessMode = v.union(v.literal('workspace'), v.literal('restricted'));

export const vInvitationStatus = v.union(
    v.literal('pending'),
    v.literal('accepted'),
    v.literal('revoked'),
    v.literal('expired'),
);

export const vAuditEventKind = v.union(
    v.literal('workspace.created'),
    v.literal('workspace.renamed'),
    v.literal('workspace.deleted'),
    v.literal('workspace_member.invited'),
    v.literal('workspace_invite.accepted'),
    v.literal('workspace_invite.revoked'),
    v.literal('workspace_member.role_changed'),
    v.literal('workspace_member.removed'),
    v.literal('project.access_mode_changed'),
    v.literal('project_member.invited'),
    v.literal('project_invite.accepted'),
    v.literal('project_invite.revoked'),
    v.literal('project_member.role_changed'),
    v.literal('project_member.removed'),
);
