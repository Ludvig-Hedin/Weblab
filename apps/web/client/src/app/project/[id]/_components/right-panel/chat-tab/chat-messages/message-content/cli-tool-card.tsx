import type { ToolUIPart } from 'ai';
import type { ComponentType } from 'react';
import { memo } from 'react';

import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@weblab/ui/ai-elements';
import { Icons } from '@weblab/ui/icons';

import type { CliToolData, CliToolIcon } from '@/lib/cli-chat/tool-label';
import { getCliToolLabel } from '@/lib/cli-chat/tool-label';

// Icons mixes Radix components and inline SVG functions; type them by use.
const ICONS: Record<CliToolIcon, ComponentType<{ className?: string }>> = {
    file: Icons.File,
    edit: Icons.Pencil,
    search: Icons.MagnifyingGlass,
    terminal: Icons.Terminal,
    globe: Icons.Globe,
    list: Icons.ListBullet,
    tool: Icons.Code,
};

function toState(status: CliToolData['status']): ToolUIPart['state'] {
    if (status === 'done') return 'output-available';
    if (status === 'error') return 'output-error';
    return 'input-available';
}

/** Read-only card for one action a local CLI (Claude Code, Codex) took. */
const CliToolCardComponent = ({ data, isStream }: { data: CliToolData; isStream: boolean }) => {
    const { title, icon } = getCliToolLabel(data);
    const Icon: ComponentType<{ className?: string }> =
        data.status === 'error' ? Icons.ExclamationTriangle : ICONS[icon];
    const loading = isStream && data.status === 'running';
    return (
        <Tool>
            <ToolHeader
                loading={loading}
                title={title}
                type={`tool-${data.tool}`}
                state={toState(data.status)}
                icon={<Icon className="h-4 w-4 flex-shrink-0" />}
            />
            <ToolContent>
                <ToolInput input={data.input ?? {}} isStreaming={loading} />
                <ToolOutput
                    output={data.status === 'done' ? (data.output ?? undefined) : undefined}
                    errorText={data.status === 'error' ? data.errorText : undefined}
                    isStreaming={loading}
                />
            </ToolContent>
        </Tool>
    );
};

export const CliToolCard = memo(CliToolCardComponent);

/** Narrow an arbitrary message part to a CLI tool part. */
export function asCliToolPart(part: { type: string }): { id?: string; data: CliToolData } | null {
    if (part.type !== 'data-cli-tool') return null;
    const data = (part as { data?: unknown }).data as CliToolData | undefined;
    if (!data || typeof data.tool !== 'string') return null;
    return { id: (part as { id?: string }).id, data };
}
