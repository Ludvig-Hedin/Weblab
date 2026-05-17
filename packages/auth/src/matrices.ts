import { ProjectAccessMode, ProjectMemberRole, WorkspaceRole } from '@weblab/models';

import type { Capability } from './capabilities';

type CapSet = ReadonlySet<Capability>;

const set = (caps: Capability[]): CapSet => new Set(caps);

/**
 * Workspace role → capabilities. Only `workspace.*` and `project.create` are
 * resolved purely from workspace role; project-level caps are merged in by
 * can() based on project access mode + explicit project membership.
 */
export const WORKSPACE_ROLE_CAPS: Readonly<Record<WorkspaceRole, CapSet>> = {
    [WorkspaceRole.OWNER]: set([
        'workspace.view',
        'workspace.update',
        'workspace.delete',
        'workspace.invite',
        'workspace.manage_members',
        'workspace.manage_billing',
        'project.create',
    ]),
    [WorkspaceRole.ADMIN]: set([
        'workspace.view',
        'workspace.update',
        'workspace.invite',
        'workspace.manage_members',
        'project.create',
    ]),
    [WorkspaceRole.MEMBER]: set(['workspace.view', 'project.create']),
    [WorkspaceRole.VIEWER]: set(['workspace.view']),
};

/**
 * Caps that flow from project-level membership.
 */
const PROJECT_ROLE_CAPS: Readonly<Record<ProjectMemberRole, CapSet>> = {
    [ProjectMemberRole.MANAGER]: set([
        'project.view',
        'project.update',
        'project.delete',
        'project.invite',
        'project.publish',
        'project.manage_settings',
        'project.manage_access_mode',
        'project.use_ai',
        'project.export',
        'project.deploy',
        'project.comment',
    ]),
    [ProjectMemberRole.EDITOR]: set([
        'project.view',
        'project.update',
        'project.use_ai',
        'project.export',
        'project.comment',
    ]),
    [ProjectMemberRole.REVIEWER]: set(['project.view', 'project.comment']),
    [ProjectMemberRole.VIEWER]: set(['project.view']),
};

/**
 * Workspace owners and admins have implicit recovery access to every project
 * in their workspace, including `restricted` ones. The cap set granted to
 * them on any project equals the manager's cap set — they can do anything
 * a project manager can do.
 */
const WORKSPACE_RECOVERY_PROJECT_CAPS: Readonly<Record<'owner' | 'admin', CapSet>> = {
    owner: PROJECT_ROLE_CAPS[ProjectMemberRole.MANAGER],
    admin: PROJECT_ROLE_CAPS[ProjectMemberRole.MANAGER],
};

/**
 * For projects whose access mode is `workspace`, every workspace member
 * inherits a baseline. Viewers get view-only; members get view+comment.
 * Restricted projects grant NOTHING via this path — explicit project
 * membership is required.
 */
const WORKSPACE_INHERITED_PROJECT_CAPS: Readonly<Record<WorkspaceRole, CapSet>> = {
    [WorkspaceRole.OWNER]: PROJECT_ROLE_CAPS[ProjectMemberRole.MANAGER],
    [WorkspaceRole.ADMIN]: PROJECT_ROLE_CAPS[ProjectMemberRole.MANAGER],
    [WorkspaceRole.MEMBER]: set(['project.view', 'project.comment']),
    [WorkspaceRole.VIEWER]: set(['project.view']),
};

export {
    PROJECT_ROLE_CAPS,
    WORKSPACE_RECOVERY_PROJECT_CAPS,
    WORKSPACE_INHERITED_PROJECT_CAPS,
    ProjectAccessMode,
};
