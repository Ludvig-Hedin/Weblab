export type StudioConnection = { projectId: string; dataset: string };

// Only these public identifiers cross the server/client boundary. Never copy environment objects.
export function studioConnectionFromEnvironment(
    env: Record<string, string | undefined>,
): StudioConnection | null {
    const projectId = env.SANITY_PROJECT_ID;
    const dataset = env.SANITY_DATASET;
    if (
        !projectId ||
        !/^[a-z0-9]{1,64}$/.test(projectId) ||
        !dataset ||
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset)
    ) {
        return null;
    }
    return { projectId, dataset };
}
