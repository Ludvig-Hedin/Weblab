/**
 * Derives a meaningful, sortable project name from the user's creation prompt
 * when AI-based name generation is unavailable or returns nothing usable.
 *
 * Why: every AI-created project used to fall back to "New Project" on any AI
 * failure, which made the projects-list sort-by-name useless once a user had
 * more than a handful of projects. Using a slice of the actual prompt always
 * yields a recognizable identifier the user can scan visually.
 *
 * Behavior:
 * - Trims and collapses internal whitespace.
 * - Cuts at the first newline (multi-line prompts get only the first line).
 * - Caps at 50 characters, trimmed at the last word boundary when possible.
 * - Returns "New Project" only when the prompt is empty/whitespace.
 *
 * Lives in `utils/` (not the server router's `helper.ts`) so it can be safely
 * imported from client-side stores without dragging in server-only modules
 * (drizzle-orm, etc.).
 */
export function deriveProjectNameFromPrompt(prompt: string): string {
    const MAX = 50;
    const firstLine = prompt.split(/\r?\n/)[0] ?? '';
    const normalized = firstLine.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return 'New Project';
    }
    if (normalized.length <= MAX) {
        return normalized;
    }
    const truncated = normalized.slice(0, MAX);
    const lastSpace = truncated.lastIndexOf(' ');
    // Prefer a word-boundary cut, but only if it leaves a reasonable amount of
    // text (at least 60% of MAX) — otherwise we'd return tiny names for prompts
    // that start with a single very long token (e.g. a URL).
    if (lastSpace >= MAX * 0.6) {
        return truncated.slice(0, lastSpace).trimEnd();
    }
    return truncated.trimEnd();
}
