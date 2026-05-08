import type { Branch, BranchRuntime, BranchRuntimeType } from '@weblab/models';

import type { Branch as DbBranch } from '../../schema';

const VALID_RUNTIME_TYPES: readonly BranchRuntimeType[] = ['cloud', 'local', 'hybrid'];

const isValidRuntimeType = (value: string | null | undefined): value is BranchRuntimeType =>
    !!value && (VALID_RUNTIME_TYPES as readonly string[]).includes(value);

export const fromDbBranch = (dbBranch: DbBranch): Branch => {
    // Prefer the authoritative `runtime_type` + `runtime_metadata` columns;
    // fall back to the legacy `sandbox_id` prefix heuristic for rows written
    // before 0023_project_runtime_modes.
    const hasMetadataColumns = isValidRuntimeType(dbBranch.runtimeType);

    const runtime: BranchRuntime = hasMetadataColumns
        ? {
              type: dbBranch.runtimeType,
              ...dbBranch.runtimeMetadata,
          }
        : (dbBranch.sandboxId ?? '').startsWith('local:')
          ? {
                type: 'local',
                sync: {
                    enabled: false,
                    status: 'disabled',
                },
            }
          : {
                type: 'cloud',
                cloud: {
                    provider: 'code_sandbox',
                    sandboxId: dbBranch.sandboxId,
                },
                sync: {
                    enabled: false,
                    status: 'disabled',
                },
            };

    return {
        id: dbBranch.id,
        projectId: dbBranch.projectId,
        name: dbBranch.name,
        description: dbBranch.description,
        createdAt: dbBranch.createdAt,
        updatedAt: dbBranch.updatedAt,
        isDefault: dbBranch.isDefault,
        git:
            dbBranch.gitBranch || dbBranch.gitCommitSha || dbBranch.gitRepoUrl
                ? {
                      branch: dbBranch.gitBranch,
                      commitSha: dbBranch.gitCommitSha,
                      repoUrl: dbBranch.gitRepoUrl,
                  }
                : null,
        sandbox: {
            id: dbBranch.sandboxId,
        },
        runtime,
    };
};

export const toDbBranch = (branch: Branch): DbBranch => {
    const { type, ...metadata } = branch.runtime;
    return {
        id: branch.id,
        name: branch.name,
        projectId: branch.projectId,
        description: branch.description,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
        isDefault: branch.isDefault,
        gitBranch: branch.git?.branch ?? null,
        gitCommitSha: branch.git?.commitSha ?? null,
        gitRepoUrl: branch.git?.repoUrl ?? null,
        sandboxId: branch.sandbox.id,
        runtimeType: type,
        runtimeMetadata: metadata,
    };
};
