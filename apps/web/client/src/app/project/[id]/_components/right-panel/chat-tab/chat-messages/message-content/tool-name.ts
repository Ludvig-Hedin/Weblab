/**
 * Extract the tool name from a UI message tool part.
 *
 * Static tool parts encode the name as `tool-<name>`; the name itself can
 * contain hyphens, so strip only the leading `tool-` prefix. The previous
 * `type.split('-')[1]` truncated any hyphenated name and returned `'tool'` for
 * an AI-SDK dynamic-tool part (`type: 'dynamic-tool'`), which carries the real
 * name in `toolName`.
 */
export function getToolNameFromPart(part: { type: string; toolName?: string }): string {
    if (part.type === 'dynamic-tool') return part.toolName ?? '';
    return part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : '';
}
