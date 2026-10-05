/**
 * Data carried by a `data-cli-tool` message part: one action the user's own
 * CLI (Claude Code, Codex) took during a chat turn. Emitted by the desktop
 * bridge (apps/desktop/cli/*-events.js); read-only in the chat.
 */
export type CliToolData = {
    provider: string;
    tool: string;
    input?: Record<string, unknown>;
    status: 'running' | 'done' | 'error';
    output?: string;
    errorText?: string;
};

export type CliToolIcon = 'file' | 'edit' | 'search' | 'terminal' | 'globe' | 'list' | 'tool';

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function quoted(value: unknown): string {
    const text = str(value);
    return text ? `“${text.length > 60 ? `${text.slice(0, 60)}…` : text}”` : '';
}

function join(...parts: string[]): string {
    return parts.filter(Boolean).join(' ');
}

/**
 * A short, plain-language label for a CLI action. TODO(i18n): these are
 * English-only like the neighbouring tool labels.
 */
export function getCliToolLabel(data: CliToolData): { title: string; icon: CliToolIcon } {
    const input = data.input ?? {};
    const file = str(input.file_path) || str(input.path) || str(input.notebook_path);
    switch (data.tool) {
        case 'Read':
            return { title: join('Read', file), icon: 'file' };
        case 'Edit':
        case 'MultiEdit':
        case 'NotebookEdit':
            return { title: join('Edited', file), icon: 'edit' };
        case 'Write':
            return { title: join('Wrote', file), icon: 'edit' };
        case 'Glob':
            return { title: join('Found files', quoted(input.pattern)), icon: 'search' };
        case 'Grep':
            return { title: join('Searched for', quoted(input.pattern)), icon: 'search' };
        case 'LS':
            return { title: join('Listed', file || 'folder'), icon: 'list' };
        case 'WebFetch':
            return { title: join('Opened', str(input.url)), icon: 'globe' };
        case 'WebSearch':
        case 'web_search':
            return { title: join('Searched the web for', quoted(input.query)), icon: 'globe' };
        case 'TodoWrite':
            return { title: 'Updated the plan', icon: 'list' };
        case 'Task':
            return { title: join('Ran a sub-task', str(input.description)), icon: 'tool' };
        case 'Bash':
        case 'command':
            return { title: join('Command', quoted(input.command)), icon: 'terminal' };
        case 'handoff_note':
            return { title: 'Some changes can’t be handed off', icon: 'tool' };
        case 'file_change': {
            const files = Array.isArray(input.files)
                ? (input.files as Array<{ path?: string }>)
                : [];
            if (files.length === 1) {
                return { title: join('Edited', str(files[0]?.path)), icon: 'edit' };
            }
            return { title: `Edited ${files.length} files`, icon: 'edit' };
        }
        default:
            return {
                title: data.tool.replace(/[-_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                icon: 'tool',
            };
    }
}
