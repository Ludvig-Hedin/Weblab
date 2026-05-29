import { v } from 'convex/values';

// Convex validator versions of the Postgres enums shared across Weblab.
// Values must stay in sync with packages/models/src/** and packages/stripe/src/**.

// ─── Workspace / project access ──────────────────────────────────────────────
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

// ─── Chat ────────────────────────────────────────────────────────────────────
export const vAgentType = v.union(v.literal('root'), v.literal('user'));

export const vMessageRole = v.union(v.literal('user'), v.literal('assistant'), v.literal('system'));

// ─── CMS ─────────────────────────────────────────────────────────────────────
export const vCmsFieldType = v.union(
    v.literal('text'),
    v.literal('rich_text'),
    v.literal('number'),
    v.literal('boolean'),
    v.literal('date'),
    v.literal('image'),
    v.literal('slug'),
    v.literal('option'),
    v.literal('reference'),
);

export const vCmsItemStatus = v.union(v.literal('draft'), v.literal('published'));

export const vCmsSourceType = v.union(
    v.literal('weblab'),
    v.literal('payload'),
    v.literal('strapi'),
    v.literal('rest'),
);

// ─── Domain / hosting ────────────────────────────────────────────────────────
export const vDeploymentType = v.union(
    v.literal('preview'),
    v.literal('custom'),
    v.literal('unpublish_preview'),
    v.literal('unpublish_custom'),
);

export const vDeploymentStatus = v.union(
    v.literal('pending'),
    v.literal('in_progress'),
    v.literal('completed'),
    v.literal('failed'),
    v.literal('cancelled'),
);

export const vHostingProvider = v.union(
    v.literal('freestyle'),
    v.literal('vercel'),
    v.literal('netlify'),
    v.literal('cloudflare'),
    v.literal('railway'),
    v.literal('render'),
);

export const vVerificationRequestStatus = v.union(
    v.literal('pending'),
    v.literal('verified'),
    v.literal('cancelled'),
);

export const vProjectCustomDomainStatus = v.union(v.literal('active'), v.literal('cancelled'));

// ─── Project / runtime ───────────────────────────────────────────────────────
export const vProjectStorageMode = v.union(
    v.literal('cloud'),
    v.literal('local'),
    v.literal('hybrid'),
);

export const vBranchRuntimeType = v.union(
    v.literal('cloud'),
    v.literal('local'),
    v.literal('hybrid'),
);

export const vPageAccessType = v.union(v.literal('public'), v.literal('password'));

export const vProjectCreateRequestStatus = v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('failed'),
);

// ─── Subscription / billing ──────────────────────────────────────────────────
export const vProductType = v.union(v.literal('free'), v.literal('pro'));

export const vSubscriptionStatus = v.union(v.literal('active'), v.literal('canceled'));

export const vScheduledSubscriptionAction = v.union(
    v.literal('price_change'),
    v.literal('cancellation'),
);

export const vPriceKey = v.union(
    v.literal('PRO_MONTHLY_TIER_1'),
    v.literal('PRO_MONTHLY_TIER_2'),
    v.literal('PRO_MONTHLY_TIER_3'),
    v.literal('PRO_MONTHLY_TIER_4'),
    v.literal('PRO_MONTHLY_TIER_5'),
    v.literal('PRO_MONTHLY_TIER_6'),
    v.literal('PRO_MONTHLY_TIER_7'),
    v.literal('PRO_MONTHLY_TIER_8'),
    v.literal('PRO_MONTHLY_TIER_9'),
    v.literal('PRO_MONTHLY_TIER_10'),
    v.literal('PRO_MONTHLY_TIER_11'),
);

export const vUsageType = v.union(
    v.literal('message'),
    v.literal('deployment'),
    v.literal('image'),
);

// ─── Legacy `ProjectRole` ────────────────────────────────────────────────────
// Kept ONLY so we can decode old projectInvitations rows; new code uses
// `vProjectMemberRole`. Will be removed when no remaining invitations carry it.
export const vProjectRoleLegacy = v.union(
    v.literal('owner'),
    v.literal('admin'),
    v.literal('editor'),
    v.literal('viewer'),
);
