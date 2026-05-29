import { describe, expect, it } from 'bun:test';

import {
    can,
    type Capability,
    type PermissionResource,
    type ProjectAccessMode,
    type ProjectMemberRole,
    type WorkspaceRole,
} from './auth';

// This is the Convex-side copy of packages/auth/src/can.ts. The two MUST stay
// in lockstep (see the header comment in ./auth.ts). This suite intentionally
// mirrors packages/auth/test/can.test.ts case-for-case so a divergence in the
// authz matrix on either side fails a test. `can` is the single most
// security-critical pure function in the app and had zero coverage on this side.

const workspaceId = 'ws-1';
const ownerUserId = 'u-owner';

const baseResource = (overrides: Partial<PermissionResource> & {
    workspaceRole: WorkspaceRole | null;
}): PermissionResource => ({
    workspace: { id: workspaceId, createdByUserId: ownerUserId },
    ...overrides,
});

const projectResource = (
    workspaceRole: WorkspaceRole | null,
    accessMode: ProjectAccessMode,
    projectRole: ProjectMemberRole | null = null,
): PermissionResource => ({
    workspace: { id: workspaceId, createdByUserId: ownerUserId },
    workspaceRole,
    project: { id: 'p-1', accessMode, workspaceId },
    projectRole,
});

describe('can() — workspace caps', () => {
    it('owner has all workspace caps', () => {
        const r = baseResource({ workspaceRole: 'owner' });
        expect(can('workspace.view', r)).toBe(true);
        expect(can('workspace.update', r)).toBe(true);
        expect(can('workspace.delete', r)).toBe(true);
        expect(can('workspace.invite', r)).toBe(true);
        expect(can('workspace.manage_members', r)).toBe(true);
        expect(can('workspace.manage_billing', r)).toBe(true);
        expect(can('project.create', r)).toBe(true);
    });

    it('admin cannot delete workspace or manage billing', () => {
        const r = baseResource({ workspaceRole: 'admin' });
        expect(can('workspace.update', r)).toBe(true);
        expect(can('workspace.invite', r)).toBe(true);
        expect(can('workspace.manage_members', r)).toBe(true);
        expect(can('workspace.delete', r)).toBe(false);
        expect(can('workspace.manage_billing', r)).toBe(false);
    });

    it('member can view + create project but not manage', () => {
        const r = baseResource({ workspaceRole: 'member' });
        expect(can('workspace.view', r)).toBe(true);
        expect(can('project.create', r)).toBe(true);
        expect(can('workspace.update', r)).toBe(false);
        expect(can('workspace.invite', r)).toBe(false);
        expect(can('workspace.manage_members', r)).toBe(false);
    });

    it('viewer can only view the workspace', () => {
        const r = baseResource({ workspaceRole: 'viewer' });
        expect(can('workspace.view', r)).toBe(true);
        expect(can('project.create', r)).toBe(false);
        expect(can('workspace.update', r)).toBe(false);
    });

    it('non-member (null role) is denied every workspace cap', () => {
        const r = baseResource({ workspaceRole: null });
        expect(can('workspace.view', r)).toBe(false);
        expect(can('workspace.update', r)).toBe(false);
        expect(can('project.create', r)).toBe(false);
    });
});

describe('can() — project caps via workspace recovery (owner/admin)', () => {
    it('workspace owner gets the manager cap set on a RESTRICTED project', () => {
        const r = projectResource('owner', 'restricted');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.update', r)).toBe(true);
        expect(can('project.delete', r)).toBe(true);
        expect(can('project.publish', r)).toBe(true);
        expect(can('project.manage_access_mode', r)).toBe(true);
        expect(can('project.manage_settings', r)).toBe(true);
        expect(can('project.use_ai', r)).toBe(true);
        expect(can('project.invite', r)).toBe(true);
    });

    it('workspace admin gets the manager cap set on a RESTRICTED project', () => {
        const r = projectResource('admin', 'restricted');
        expect(can('project.delete', r)).toBe(true);
        expect(can('project.publish', r)).toBe(true);
        expect(can('project.manage_access_mode', r)).toBe(true);
    });

    it('owner recovery applies even with an explicit lower projectRole', () => {
        const r = projectResource('owner', 'restricted', 'viewer');
        // Recovery is evaluated before the explicit projectRole, so the owner
        // keeps full caps regardless of a stale low project membership row.
        expect(can('project.delete', r)).toBe(true);
    });
});

describe('can() — project caps via workspace-mode inheritance', () => {
    it('workspace member sees a WORKSPACE-mode project (view + comment only)', () => {
        const r = projectResource('member', 'workspace');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(true);
        expect(can('project.update', r)).toBe(false);
        expect(can('project.use_ai', r)).toBe(false);
        expect(can('project.publish', r)).toBe(false);
        expect(can('project.delete', r)).toBe(false);
    });

    it('workspace viewer sees a WORKSPACE-mode project (view only)', () => {
        const r = projectResource('viewer', 'workspace');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });

    it('SECURITY: workspace member is DENIED on a RESTRICTED project without an explicit role', () => {
        const r = projectResource('member', 'restricted');
        expect(can('project.view', r)).toBe(false);
        expect(can('project.comment', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });

    it('SECURITY: workspace viewer is DENIED on a RESTRICTED project', () => {
        const r = projectResource('viewer', 'restricted');
        expect(can('project.view', r)).toBe(false);
    });
});

describe('can() — project caps via explicit project membership', () => {
    it('manager gets the full project cap set', () => {
        const r = projectResource(null, 'restricted', 'manager');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.update', r)).toBe(true);
        expect(can('project.delete', r)).toBe(true);
        expect(can('project.publish', r)).toBe(true);
        expect(can('project.manage_access_mode', r)).toBe(true);
        expect(can('project.invite', r)).toBe(true);
        expect(can('project.deploy', r)).toBe(true);
    });

    it('editor can edit/comment/use-AI/export but NOT publish, invite, delete, or change access', () => {
        const r = projectResource(null, 'restricted', 'editor');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.update', r)).toBe(true);
        expect(can('project.comment', r)).toBe(true);
        expect(can('project.use_ai', r)).toBe(true);
        expect(can('project.export', r)).toBe(true);
        expect(can('project.publish', r)).toBe(false);
        expect(can('project.invite', r)).toBe(false);
        expect(can('project.manage_access_mode', r)).toBe(false);
        expect(can('project.delete', r)).toBe(false);
    });

    it('reviewer can view + comment only', () => {
        const r = projectResource(null, 'restricted', 'reviewer');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(true);
        expect(can('project.update', r)).toBe(false);
        expect(can('project.use_ai', r)).toBe(false);
    });

    it('project viewer can view only', () => {
        const r = projectResource(null, 'restricted', 'viewer');
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });

    it('explicit projectRole grants access even on a WORKSPACE-mode project beyond inheritance', () => {
        // A member with an editor projectRole on a workspace-mode project gets
        // editor caps (the explicit role is checked after inheritance).
        const r = projectResource('member', 'workspace', 'editor');
        expect(can('project.update', r)).toBe(true);
        expect(can('project.use_ai', r)).toBe(true);
    });
});

describe('can() — denial paths', () => {
    it('SECURITY: a project in a DIFFERENT workspace is denied, even for an owner', () => {
        const r: PermissionResource = {
            workspace: { id: workspaceId, createdByUserId: ownerUserId },
            workspaceRole: 'owner',
            project: { id: 'p-1', accessMode: 'workspace', workspaceId: 'OTHER-WS' },
        };
        expect(can('project.view', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
        expect(can('project.delete', r)).toBe(false);
    });

    it('a project cap with no project resource is denied', () => {
        const r = baseResource({ workspaceRole: 'owner' });
        expect(can('project.view', r)).toBe(false);
        expect(can('project.publish', r)).toBe(false);
    });

    it('null workspace role + no project role is denied (both access modes)', () => {
        expect(can('project.view', projectResource(null, 'restricted'))).toBe(false);
        expect(can('project.view', projectResource(null, 'workspace'))).toBe(false);
    });

    it('an unknown capability is denied (fail-closed)', () => {
        const r = projectResource('owner', 'workspace', 'manager');
        expect(can('totally.bogus' as Capability, r)).toBe(false);
    });
});
