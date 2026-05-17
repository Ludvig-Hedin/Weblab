import type { DrizzleDb, Frame } from '@weblab/db';

import { requireCap } from '../../permissions/requireCap';

/** Type representing a db instance or transaction that has query capabilities */
type DbOrTx = Pick<DrizzleDb, 'query'>;

export function extractCsbPort(frames: Frame[]): number | null {
    if (!frames || frames.length === 0) return null;

    for (const frame of frames) {
        if (frame.url) {
            // Match CSB preview URL pattern: https://sandboxId-port.csb.app
            const match = /https:\/\/[^-]+-(\d+)\.csb\.app/.exec(frame.url);
            if (match?.[1]) {
                const port = parseInt(match[1], 10);
                if (!isNaN(port)) {
                    return port;
                }
            }
        }
    }
    return null;
}

/**
 * Legacy view-access gate. Routes through the central `requireCap` /
 * `can()` layer with capability `project.view`. Phase 8 migrates hot
 * write paths off this shim onto explicit capabilities; Phase 9 deletes
 * the shim entirely.
 *
 * Throws TRPCError(FORBIDDEN) when the user lacks view access. The
 * legacy implementation threw a generic Error — TRPCError extends Error
 * so existing try/catch consumers remain correct.
 */
export async function verifyProjectAccess(
    db: DbOrTx,
    userId: string,
    projectId: string,
): Promise<void> {
    await requireCap(db, userId, 'project.view', { projectId });
}
