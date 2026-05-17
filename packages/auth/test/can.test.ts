import { describe, expect, it } from 'bun:test';

import { ProjectAccessMode, ProjectMemberRole, WorkspaceRole } from '@weblab/models';

import type { PermissionResource } from '../src/resource';
import { can } from '../src/can';

const workspaceId = 'ws-1';
const ownerUserId = 'u-owner';

const baseResource = (
    overrides: Partial<PermissionResource> & {
        workspaceRole: PermissionResource['workspaceRole'];
    },
): PermissionResource => ({
    workspace: { id: workspaceId, createdByUserId: ownerUserId },
    ...overrides,
});

const projectResource = (
    workspaceRole: PermissionResource['workspaceRole'],
    accessMode: ProjectAccessMode,
    projectRole: PermissionResource['projectRole'] = null,
): PermissionResource => ({
    workspace: { id: workspaceId, createdByUserId: ownerUserId },
    workspaceRole,
    project: { id: 'p-1', accessMode, workspaceId },
    projectRole,
});

describe('can() — workspace caps', () => {
    it('owner has all workspace caps', () => {
        const r = baseResource({ workspaceRole: WorkspaceRole.OWNER });
        expect(can('workspace.update', r)).toBe(true);
        expect(can('workspace.delete', r)).toBe(true);
        expect(can('workspace.invite', r)).toBe(true);
        expect(can('workspace.manage_members', r)).toBe(true);
        expect(can('workspace.manage_billing', r)).toBe(true);
    });

    it('admin cannot delete workspace or manage billing', () => {
        const r = baseResource({ workspaceRole: WorkspaceRole.ADMIN });
        expect(can('workspace.update', r)).toBe(true);
        expect(can('workspace.invite', r)).toBe(true);
        expect(can('workspace.manage_members', r)).toBe(true);
        expect(can('workspace.delete', r)).toBe(false);
        expect(can('workspace.manage_billing', r)).toBe(false);
    });

    it('member can view + create project but not manage', () => {
        const r = baseResource({ workspaceRole: WorkspaceRole.MEMBER });
        expect(can('workspace.view', r)).toBe(true);
        expect(can('project.create', r)).toBe(true);
        expect(can('workspace.update', r)).toBe(false);
        expect(can('workspace.invite', r)).toBe(false);
    });

    it('viewer can only view', () => {
        const r = baseResource({ workspaceRole: WorkspaceRole.VIEWER });
        expect(can('workspace.view', r)).toBe(true);
        expect(can('project.create', r)).toBe(false);
        expect(can('workspace.update', r)).toBe(false);
    });

    it('non-member is denied everything', () => {
        const r = baseResource({ workspaceRole: null });
        expect(can('workspace.view', r)).toBe(false);
        expect(can('workspace.update', r)).toBe(false);
        expect(can('project.create', r)).toBe(false);
    });
});

describe('can() — project caps via workspace recovery', () => {
    it('workspace owner gets manager cap set on restricted project', () => {
        const r = projectResource(WorkspaceRole.OWNER, ProjectAccessMode.RESTRICTED);
        expect(can('project.view', r)).toBe(true);
        expect(can('project.update', r)).toBe(true);
        expect(can('project.delete', r)).toBe(true);
        expect(can('project.publish', r)).toBe(true);
        expect(can('project.manage_access_mode', r)).toBe(true);
        expect(can('project.use_ai', r)).toBe(true);
    });

    it('workspace admin gets manager cap set on restricted project', () => {
        const r = projectResource(WorkspaceRole.ADMIN, ProjectAccessMode.RESTRICTED);
        expect(can('project.delete', r)).toBe(true);
        expect(can('project.publish', r)).toBe(true);
    });
});

describe('can() — project caps via workspace-mode inheritance', () => {
    it('workspace member sees workspace-mode project (view + comment)', () => {
        const r = projectResource(WorkspaceRole.MEMBER, ProjectAccessMode.WORKSPACE);
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(true);
        expect(can('project.update', r)).toBe(false);
        expect(can('project.use_ai', r)).toBe(false);
        expect(can('project.publish', r)).toBe(false);
    });

    it('workspace viewer sees workspace-mode project (view only)', () => {
        const r = projectResource(WorkspaceRole.VIEWER, ProjectAccessMode.WORKSPACE);
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });

    it('workspace member is DENIED on restricted project without explicit role', () => {
        const r = projectResource(WorkspaceRole.MEMBER, ProjectAccessMode.RESTRICTED);
        expect(can('project.view', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });

    it('workspace viewer is DENIED on restricted project', () => {
        const r = projectResource(WorkspaceRole.VIEWER, ProjectAccessMode.RESTRICTED);
        expect(can('project.view', r)).toBe(false);
    });
});

describe('can() — project caps via explicit project membership', () => {
    it('manager gets full project cap set', () => {
        const r = projectResource(null, ProjectAccessMode.RESTRICTED, ProjectMemberRole.MANAGER);
        expect(can('project.view', r)).toBe(true);
        expect(can('project.update', r)).toBe(true);
        expect(can('project.delete', r)).toBe(true);
        expect(can('project.publish', r)).toBe(true);
        expect(can('project.manage_access_mode', r)).toBe(true);
        expect(can('project.invite', r)).toBe(true);
    });

    it('editor can edit + comment + use AI but cannot publish or invite', () => {
        const r = projectResource(null, ProjectAccessMode.RESTRICTED, ProjectMemberRole.EDITOR);
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
        const r = projectResource(null, ProjectAccessMode.RESTRICTED, ProjectMemberRole.REVIEWER);
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(true);
        expect(can('project.update', r)).toBe(false);
        expect(can('project.use_ai', r)).toBe(false);
    });

    it('viewer can view only', () => {
        const r = projectResource(null, ProjectAccessMode.RESTRICTED, ProjectMemberRole.VIEWER);
        expect(can('project.view', r)).toBe(true);
        expect(can('project.comment', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });
});

describe('can() — denial paths', () => {
    it('mismatched workspaceId on project is denied', () => {
        const r: PermissionResource = {
            workspace: { id: workspaceId, createdByUserId: ownerUserId },
            workspaceRole: WorkspaceRole.OWNER,
            project: { id: 'p-1', accessMode: ProjectAccessMode.WORKSPACE, workspaceId: 'OTHER' },
        };
        expect(can('project.view', r)).toBe(false);
        expect(can('project.update', r)).toBe(false);
    });

    it('no workspace role + no project role on restricted is denied', () => {
        const r = projectResource(null, ProjectAccessMode.RESTRICTED);
        expect(can('project.view', r)).toBe(false);
    });

    it('no workspace role + no project role on workspace-mode is denied', () => {
        const r = projectResource(null, ProjectAccessMode.WORKSPACE);
        expect(can('project.view', r)).toBe(false);
    });
});
