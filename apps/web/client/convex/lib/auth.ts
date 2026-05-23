// Port of packages/auth — Convex side. Same matrices and resolver as the
// canonical implementation in `packages/auth/src/`, copied here so Convex
// queries/mutations can call `can()` without crossing the package boundary.
// Keep in lockstep when either side changes.

export const CAPABILITIES = [
    'workspace.view',
    'workspace.update',
    'workspace.delete',
    'workspace.invite',
    'workspace.manage_members',
    'workspace.manage_billing',
    'project.create',
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
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectMemberRole = 'manager' | 'editor' | 'reviewer' | 'viewer';
export type ProjectAccessMode = 'workspace' | 'restricted';

export interface PermissionResource {
    workspace: { id: string; createdByUserId: string };
    workspaceRole: WorkspaceRole | null;
    project?: { id: string; accessMode: ProjectAccessMode; workspaceId: string };
    projectRole?: ProjectMemberRole | null;
}

type CapSet = ReadonlySet<Capability>;
const set = (caps: Capability[]): CapSet => new Set(caps);

const WORKSPACE_ROLE_CAPS: Readonly<Record<WorkspaceRole, CapSet>> = {
    owner: set([
        'workspace.view',
        'workspace.update',
        'workspace.delete',
        'workspace.invite',
        'workspace.manage_members',
        'workspace.manage_billing',
        'project.create',
    ]),
    admin: set([
        'workspace.view',
        'workspace.update',
        'workspace.invite',
        'workspace.manage_members',
        'project.create',
    ]),
    member: set(['workspace.view', 'project.create']),
    viewer: set(['workspace.view']),
};

const PROJECT_ROLE_CAPS: Readonly<Record<ProjectMemberRole, CapSet>> = {
    manager: set([
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
    editor: set([
        'project.view',
        'project.update',
        'project.use_ai',
        'project.export',
        'project.comment',
    ]),
    reviewer: set(['project.view', 'project.comment']),
    viewer: set(['project.view']),
};

const WORKSPACE_RECOVERY_PROJECT_CAPS: Readonly<Record<'owner' | 'admin', CapSet>> = {
    owner: PROJECT_ROLE_CAPS.manager,
    admin: PROJECT_ROLE_CAPS.manager,
};

const WORKSPACE_INHERITED_PROJECT_CAPS: Readonly<Record<WorkspaceRole, CapSet>> = {
    owner: PROJECT_ROLE_CAPS.manager,
    admin: PROJECT_ROLE_CAPS.manager,
    member: set(['project.view', 'project.comment']),
    viewer: set(['project.view']),
};

const isWorkspaceCap = (cap: Capability): boolean => cap.startsWith('workspace.');
const isProjectCap = (cap: Capability): boolean => cap.startsWith('project.');

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
    if (r.workspaceRole === null) return false;
    return WORKSPACE_ROLE_CAPS[r.workspaceRole].has(cap);
}

function resolveProjectCap(cap: Capability, r: PermissionResource): boolean {
    if (!r.project) return false;
    if (r.project.workspaceId !== r.workspace.id) return false;

    if (r.workspaceRole === 'owner') return WORKSPACE_RECOVERY_PROJECT_CAPS.owner.has(cap);
    if (r.workspaceRole === 'admin') return WORKSPACE_RECOVERY_PROJECT_CAPS.admin.has(cap);

    if (
        r.project.accessMode === 'workspace' &&
        (r.workspaceRole === 'member' || r.workspaceRole === 'viewer')
    ) {
        if (WORKSPACE_INHERITED_PROJECT_CAPS[r.workspaceRole].has(cap)) return true;
    }

    if (r.projectRole) return PROJECT_ROLE_CAPS[r.projectRole].has(cap);
    return false;
}
