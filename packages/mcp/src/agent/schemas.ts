/**
 * Zod schemas for the agent MCP tools.
 *
 *  - `*InputSchema`  validate tool arguments before any network call.
 *  - `*ResponseSchema` validate backend JSON so a malformed/garbage response is
 *    rejected (mapped to BACKEND_UNAVAILABLE) instead of silently typed as data.
 *
 * Response shapes mirror the interfaces in apps/web/client/convex/agentApi.ts.
 */
import { z } from 'zod';

// ── Tool inputs ────────────────────────────────────────────────────────────────

export const healthInputSchema = z.object({});

export const listProjectsInputSchema = z.object({});

export const getProjectInputSchema = z.object({
    projectId: z.string().min(1).describe('Project id (from list_projects)'),
});

export const getProjectStatusInputSchema = z.object({
    projectId: z.string().min(1).describe('Project id (from list_projects)'),
});

export const readLogsInputSchema = z.object({
    projectId: z.string().min(1).describe('Project id'),
});

// Write/destructive tool — require explicit confirmation per task constraints,
// even though v1 returns UNSUPPORTED. The confirm gate is enforced in the schema
// so it is impossible to invoke the write path without opting in.
export const createTestProjectInputSchema = z.object({
    confirm: z
        .literal(true)
        .describe('Must be true to acknowledge this is a write action that creates data'),
    name: z.string().min(1).optional().describe('Optional project name'),
    framework: z
        .enum(['nextjs', 'static-html'])
        .optional()
        .describe('Framework to scaffold (default nextjs)'),
});

// ── Backend response validators ────────────────────────────────────────────────

export const healthResponseSchema = z.object({
    ok: z.boolean(),
    service: z.string(),
    version: z.string(),
    authenticated: z.boolean(),
    agentUserResolved: z.boolean(),
    time: z.number(),
});
export type HealthResult = z.infer<typeof healthResponseSchema>;

export const projectSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    framework: z.string().nullable(),
    accessMode: z.string(),
    storageMode: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const listProjectsResponseSchema = z.object({
    projects: z.array(projectSummarySchema),
});

export const projectMetadataSchema = projectSummarySchema.extend({
    workspaceId: z.string(),
    defaultBranchName: z.string().nullable(),
    previewUrl: z.string().nullable(),
    sandboxId: z.string().nullable(),
});
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

export const getProjectResponseSchema = z.object({
    project: projectMetadataSchema,
});

export const deploymentStatusSchema = z.object({
    type: z.string(),
    status: z.string(),
    error: z.string().nullable(),
    urls: z.array(z.string()),
    updatedAt: z.number(),
});

export const projectStatusSchema = z.object({
    provisioning: z.enum(['ready', 'pending', 'failed']),
    previewUrl: z.string().nullable(),
    sandboxId: z.string().nullable(),
    provisioningError: z.string().nullable(),
    latestDeployment: deploymentStatusSchema.nullable(),
});
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const getProjectStatusResponseSchema = z.object({
    status: projectStatusSchema,
});
