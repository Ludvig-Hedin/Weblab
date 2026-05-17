import type { ProjectAccessMode, ProjectMemberRole, WorkspaceRole } from '@weblab/models';

export interface PermissionResource {
    workspace: {
        id: string;
        createdByUserId: string;
    };
    workspaceRole: WorkspaceRole | null;
    project?: {
        id: string;
        accessMode: ProjectAccessMode;
        workspaceId: string;
    };
    projectRole?: ProjectMemberRole | null;
}
