import type { ToolUIPart } from 'ai';
import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';

import type { ChatMessage } from '@weblab/models';
import {
    AskUserQuestionTool,
    EditImageTool,
    GenerateImageTool,
    PlanCompleteTool,
} from '@weblab/ai/client';
import { Reasoning, ReasoningContent, ReasoningTrigger, Response } from '@weblab/ui/ai-elements';
import { cn } from '@weblab/ui/utils';

import { BashCodeDisplay } from '../../code-display/bash-code-display';
import { ActionsGroup } from './actions-group';
import { ToolCallDisplay } from './tool-call-display';

// Languages we recognise as "run in terminal" code blocks.
const SHELL_LANGS = new Set([
    'bash',
    'sh',
    'shell',
    'zsh',
    'fish',
    'cmd',
    'console',
    'shellscript',
    'shellsession',
    'terminal',
    'ps1',
    'powershell',
]);

/** Split a markdown string around complete fenced code blocks whose language
 *  is a shell language, leaving all other content intact. */
type TextSegment = { kind: 'text'; content: string };
type ShellSegment = { kind: 'shell'; lang: string; code: string };
type Segment = TextSegment | ShellSegment;

const splitShellBlocks = (text: string): Segment[] => {
    const segments: Segment[] = [];
    // Match ``‌`lang\n…\n``‌` – non-greedy so we don't bridge two blocks.
    const re = /```([\w-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        const lang = match[1]?.toLowerCase() ?? '';
        if (!SHELL_LANGS.has(lang)) continue;

        if (match.index > lastIndex) {
            segments.push({ kind: 'text', content: text.slice(lastIndex, match.index) });
        }
        segments.push({ kind: 'shell', lang, code: (match[2] ?? '').trimEnd() });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        segments.push({ kind: 'text', content: text.slice(lastIndex) });
    }

    // Fall back to a single text segment when no shell blocks were found.
    return segments.length > 0 ? segments : [{ kind: 'text', content: text }];
};

type Part = ChatMessage['parts'][number];

/** Tool calls whose result is media the user must see, or interactive cards
 *  that require user input. We render them outside the collapsible "Worked for
 *  Xs" group so they are never hidden behind the disclosure. */
const ALWAYS_VISIBLE_TOOLS = new Set([
    GenerateImageTool.toolName,
    EditImageTool.toolName,
    AskUserQuestionTool.toolName,
    PlanCompleteTool.toolName,
]);

/** A part is an "action" if it's something the model did rather than said —
 *  i.e. a tool call or a reasoning step. Consecutive actions are grouped
 *  together into a single collapsible disclosure. Image-result tools are
 *  excluded so the image stays visible without a click. */
const isActionPart = (part: Part | undefined): boolean => {
    if (!part) return false;
    if (part.type === 'reasoning') return true;
    if (!part.type.startsWith('tool-')) return false;
    const toolName = part.type.split('-')[1] ?? '';
    return !ALWAYS_VISIBLE_TOOLS.has(toolName);
};

const MessageContentComponent = ({
    messageId,
    parts,
    applied,
    isStream,
    createdAt,
}: {
    messageId: string;
    parts: ChatMessage['parts'];
    applied: boolean;
    isStream: boolean;
    createdAt?: Date;
}) => {
    // Find the index of the last incomplete tool call so we only animate the
    // currently-running one — the rest are already done.
    let lastIncompleteToolIndex = -1;
    if (isStream) {
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (part?.type.startsWith('tool-')) {
                const toolPart = part as ToolUIPart;
                if (toolPart.state !== 'output-available') {
                    lastIncompleteToolIndex = i;
                    break;
                }
            }
        }
    }

    // Index of the last action part in the message — used to know which
    // group is the "active" one when streaming.
    let lastActionIndex = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
        if (isActionPart(parts[i])) {
            lastActionIndex = i;
            break;
        }
    }

    const renderActionPart = (part: Part, idx: number): ReactNode => {
        if (part.type.startsWith('tool-')) {
            const toolPart = part as ToolUIPart;
            const isLoadingThisTool = isStream && idx === lastIncompleteToolIndex;
            return (
                <ToolCallDisplay
                    messageId={messageId}
                    toolPart={toolPart}
                    key={toolPart.toolCallId}
                    isStream={isLoadingThisTool}
                    applied={applied}
                />
            );
        }
        if (part.type === 'reasoning') {
            const isLastPart = idx === parts.length - 1;
            const isStreamingThisPart = isStream && isLastPart;
            return (
                <Reasoning
                    key={`reasoning-${idx}`}
                    className={cn(
                        'text-foreground-tertiary border-border/50 m-0 mb-1.5 border-l pl-3',
                        isStreamingThisPart && 'border-foreground-tertiary/40',
                    )}
                    isStreaming={isStreamingThisPart}
                    defaultOpen={false}
                >
                    <ReasoningTrigger
                        className={cn(
                            'text-mini',
                            isStreamingThisPart &&
                                'animate-shimmer bg-gradient-to-l from-white/30 via-white/85 to-white/30 bg-[length:200%_100%] bg-clip-text text-transparent',
                        )}
                    />
                    <ReasoningContent className="text-mini text-foreground-tertiary leading-snug">
                        {part.text}
                    </ReasoningContent>
                </Reasoning>
            );
        }
        return null;
    };

    // Walk the parts left-to-right and emit either a text Response or a single
    // ActionsGroup containing every consecutive action (tool/reasoning) part.
    // This keeps narrative text inline while folding the noisy work behind one
    // tidy "Worked for Xs" disclosure per cycle.
    const rendered: ReactNode[] = [];
    let i = 0;
    let groupCounter = 0;
    while (i < parts.length) {
        const part = parts[i];
        if (!part) {
            i += 1;
            continue;
        }

        if (part.type === 'text') {
            // While the message is still streaming the bash block may be
            // incomplete, so we keep the full text in Streamdown. Once done,
            // we split out any shell code blocks and give each one a Run
            // button via BashCodeDisplay.
            if (isStream) {
                rendered.push(<Response key={`text-${i}`}>{part.text}</Response>);
            } else {
                const segments = splitShellBlocks(part.text);
                segments.forEach((seg, segIdx) => {
                    if (seg.kind === 'text') {
                        if (seg.content.trim()) {
                            rendered.push(
                                <Response key={`text-${i}-${segIdx}`}>{seg.content}</Response>,
                            );
                        }
                    } else {
                        rendered.push(
                            <BashCodeDisplay
                                key={`shell-${i}-${segIdx}`}
                                content={seg.code}
                                defaultStdOut={null}
                                defaultStdErr={null}
                                isStream={false}
                            />,
                        );
                    }
                });
            }
            i += 1;
            continue;
        }

        if (isActionPart(part)) {
            // Greedily collect every consecutive action part into one group.
            const groupStart = i;
            const groupChildren: ReactNode[] = [];
            while (i < parts.length && isActionPart(parts[i])) {
                const child = parts[i];
                if (child) {
                    const node = renderActionPart(child, i);
                    if (node) groupChildren.push(node);
                }
                i += 1;
            }
            // The group is "live" only if streaming AND it contains the last
            // action in the message — i.e. nothing has come after it yet.
            const groupContainsLastAction = lastActionIndex >= groupStart && lastActionIndex < i;
            const groupIsStreaming = isStream && groupContainsLastAction;
            rendered.push(
                <ActionsGroup
                    key={`actions-${groupStart}`}
                    groupKey={`${messageId}-${groupCounter}`}
                    isStreaming={groupIsStreaming}
                    actionCount={groupChildren.length}
                    startedAt={createdAt}
                >
                    {groupChildren}
                </ActionsGroup>,
            );
            groupCounter += 1;
            continue;
        }

        // Tool parts that aren't action-grouped (image results) render
        // standalone so their output stays visible.
        if (part.type.startsWith('tool-')) {
            const toolPart = part as ToolUIPart;
            const isLoadingThisTool = isStream && i === lastIncompleteToolIndex;
            rendered.push(
                <ToolCallDisplay
                    messageId={messageId}
                    toolPart={toolPart}
                    key={toolPart.toolCallId}
                    isStream={isLoadingThisTool}
                    applied={applied}
                />,
            );
            i += 1;
            continue;
        }

        // Unknown part type — skip.
        i += 1;
    }

    return <div className="select-text">{rendered}</div>;
};

export const MessageContent = observer(MessageContentComponent);
