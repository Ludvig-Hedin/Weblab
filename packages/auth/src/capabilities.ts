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
