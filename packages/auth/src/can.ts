import { ProjectAccessMode, WorkspaceRole } from '@weblab/models';

import type { Capability } from './capabilities';
import type { PermissionResource } from './resource';
import {
    PROJECT_ROLE_CAPS,
    WORKSPACE_INHERITED_PROJECT_CAPS,
    WORKSPACE_RECOVERY_PROJECT_CAPS,
    WORKSPACE_ROLE_CAPS,
} from './matrices';

const isWorkspaceCap = (cap: Capability): boolean => cap.startsWith('workspace.');
const isProjectCap = (cap: Capability): boolean => cap.startsWith('project.');

/**
 * Central authorization resolver.
 *
 * Workspace caps depend only on the caller's workspace role.
 *
 * Project caps resolve in three steps, union-of-grants:
 *   1) Workspace owners/admins always get the full project manager cap set
 *      on every project in their workspace (recovery rule).
 *   2) For projects whose access_mode is `workspace`, every workspace member
 *      inherits a baseline (member: view+comment, viewer: view).
 *   3) Explicit project membership grants the role's cap set.
 *
 * `project.create` is special: it is a workspace-level action, granted by
 * workspace role even though it touches a project.
 */
export function can(cap: Capability, r: PermissionResource): boolean {
    if (isWorkspaceCap(cap) || cap === 'project.create') {
        return resolveWorkspaceCap(cap, r);
    }
    if (isProjectCap(cap)) {
        return resolveProjectCap(cap, r);
    }
    return false;
}

function resolveWorkspaceCap(cap: Capability, r: PermissionResource): boolean {
    if (r.workspaceRole === null) {
        return false;
    }
    return WORKSPACE_ROLE_CAPS[r.workspaceRole].has(cap);
}

function resolveProjectCap(cap: Capability, r: PermissionResource): boolean {
    // A project cap query without a project resource is a programming error;
    // treat as deny.
    if (!r.project) {
        return false;
    }
    if (r.project.workspaceId !== r.workspace.id) {
        return false;
    }

    // 1) Workspace owners/admins always pass.
    if (r.workspaceRole === WorkspaceRole.OWNER) {
        return WORKSPACE_RECOVERY_PROJECT_CAPS.owner.has(cap);
    }
    if (r.workspaceRole === WorkspaceRole.ADMIN) {
        return WORKSPACE_RECOVERY_PROJECT_CAPS.admin.has(cap);
    }

    // 2) Workspace-visible project: workspace member/viewer gets inherited caps.
    if (
        r.project.accessMode === ProjectAccessMode.WORKSPACE &&
        (r.workspaceRole === WorkspaceRole.MEMBER || r.workspaceRole === WorkspaceRole.VIEWER)
    ) {
        if (WORKSPACE_INHERITED_PROJECT_CAPS[r.workspaceRole].has(cap)) {
            return true;
        }
    }

    // 3) Explicit project membership.
    if (r.projectRole) {
        return PROJECT_ROLE_CAPS[r.projectRole].has(cap);
    }

    return false;
}
