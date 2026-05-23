import type { ToolUIPart } from 'ai';
import { observer } from 'mobx-react-lite';
import stripAnsi from 'strip-ansi';
import { type z } from 'zod';

import type { WebSearchResult } from '@weblab/models';
import {
    AskUserQuestionTool,
    EditImageTool,
    FuzzyEditFileTool,
    GenerateImageTool,
    PlanCompleteTool,
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    TerminalCommandTool,
    TypecheckTool,
    WebSearchTool,
    WriteFileTool,
} from '@weblab/ai/client';
import { ChatType } from '@weblab/models';

import { useEditorEngine } from '@/components/store/editor';
import { BashCodeDisplay } from '../../code-display/bash-code-display';
import { CollapsibleCodeBlock } from '../../code-display/collapsible-code-block';
import { SearchSourcesDisplay } from '../../code-display/search-sources-display';
import { PlanApprovalCard } from './plan-approval-card';
import { PlanQuestionCard } from './plan-question-card';
import { ToolCallImageResult } from './tool-call-image-result';
import { ToolCallSimple } from './tool-call-simple';

const ToolCallDisplayComponent = ({
    messageId,
    toolPart,
    isStream,
    applied,
}: {
    messageId: string;
    toolPart: ToolUIPart;
    isStream: boolean;
    applied: boolean;
}) => {
    const editorEngine = useEditorEngine();
    const toolName = toolPart.type.split('-')[1];

    if (toolName === AskUserQuestionTool.toolName) {
        const args = toolPart.input as z.infer<typeof AskUserQuestionTool.parameters> | null;
        if (!args?.question) {
            return (
                <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} loading={isStream} />
            );
        }
        const answered = toolPart.state === 'output-available';
        return (
            <PlanQuestionCard
                key={toolPart.toolCallId}
                toolCallId={toolPart.toolCallId}
                input={args}
                answered={answered}
            />
        );
    }

    if (toolName === PlanCompleteTool.toolName) {
        const args = toolPart.input as z.infer<typeof PlanCompleteTool.parameters> | null;
        return (
            <PlanApprovalCard
                key={toolPart.toolCallId}
                input={{ summary: args?.summary ?? '' }}
                isStream={isStream && toolPart.state !== 'output-available'}
                onBuildNow={() => editorEngine.state.setChatMode(ChatType.EDIT)}
            />
        );
    }

    if (toolName === GenerateImageTool.toolName || toolName === EditImageTool.toolName) {
        return (
            <ToolCallImageResult
                key={toolPart.toolCallId}
                toolPart={toolPart}
                loading={isStream && toolPart.state !== 'output-available'}
            />
        );
    }

    if (toolName === TerminalCommandTool.toolName) {
        const args = toolPart.input as z.infer<typeof TerminalCommandTool.parameters> | null;
        const result = toolPart.output as {
            output?: string;
            error?: string;
        } | null;
        if (!args?.command) {
            return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} />;
        }
        return (
            <BashCodeDisplay
                key={toolPart.toolCallId}
                content={args.command}
                isStream={isStream}
                defaultStdOut={
                    toolPart.state === 'output-available' ? (result?.output ?? null) : null
                }
                defaultStdErr={
                    toolPart.state === 'output-available' ? (result?.error ?? null) : null
                }
            />
        );
    }

    if (toolName === WebSearchTool.toolName && toolPart.state === 'output-available') {
        const searchResult: WebSearchResult | null = toolPart.output as WebSearchResult | null;
        const args = toolPart.input as z.infer<typeof WebSearchTool.parameters>;
        if (args?.query && searchResult?.result && searchResult.result.length > 0) {
            return (
                <SearchSourcesDisplay
                    query={String(args.query)}
                    results={
                        Array.isArray(searchResult.result)
                            ? (searchResult.result as unknown[]).map((result: unknown) => ({
                                  title: String(
                                      (result as { title?: string; url?: string }).title ??
                                          (result as { url?: string }).url ??
                                          '',
                                  ),
                                  url: String((result as { url?: string }).url ?? ''),
                              }))
                            : []
                    }
                />
            );
        }
    }

    if (toolName === WriteFileTool.toolName) {
        const args = toolPart.input as z.infer<typeof WriteFileTool.parameters> | null;
        const filePath = args?.file_path;
        const codeContent = args?.content;
        const branchId = args?.branchId;
        if (!filePath || !codeContent) {
            return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} />;
        }
        return (
            <CollapsibleCodeBlock
                path={filePath}
                content={codeContent}
                messageId={messageId}
                applied={applied}
                isStream={isStream}
                branchId={branchId}
                showApply
            />
        );
    }

    if (toolName === FuzzyEditFileTool.toolName) {
        const args = toolPart.input as z.infer<typeof FuzzyEditFileTool.parameters> | null;
        const filePath = args?.file_path;
        const codeContent = args?.content;
        const branchId = args?.branchId;
        if (!filePath || !codeContent) {
            return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} />;
        }
        return (
            <CollapsibleCodeBlock
                path={filePath}
                content={codeContent}
                messageId={messageId}
                applied={applied}
                isStream={isStream}
                branchId={branchId}
                showApply
            />
        );
    }

    if (toolName === SearchReplaceEditTool.toolName) {
        const args = toolPart.input as z.infer<typeof SearchReplaceEditTool.parameters> | null;
        const filePath = args?.file_path;
        const codeContent = args?.new_string;
        const branchId = args?.branchId;
        if (!filePath || !codeContent) {
            return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} />;
        }
        return (
            <CollapsibleCodeBlock
                path={filePath}
                content={codeContent}
                messageId={messageId}
                applied={applied}
                isStream={isStream}
                branchId={branchId}
            />
        );
    }

    if (toolName === SearchReplaceMultiEditFileTool.toolName) {
        const args = toolPart.input as z.infer<
            typeof SearchReplaceMultiEditFileTool.parameters
        > | null;
        const filePath = args?.file_path;
        const codeContent = args?.edits?.map((edit) => edit.new_string).join('\n...\n');
        const branchId = args?.branchId;
        if (!filePath || !codeContent) {
            return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} />;
        }
        return (
            <CollapsibleCodeBlock
                path={filePath}
                content={codeContent}
                messageId={messageId}
                applied={applied}
                isStream={isStream}
                branchId={branchId}
            />
        );
    }

    // if (toolName === TodoWriteTool.toolName) {
    //     const args = toolPart.input as z.infer<typeof TodoWriteTool.parameters> | null;
    //     const todos = args?.todos;
    //     if (!todos || todos.length === 0) {
    //         return (
    //             <ToolCallSimple
    //                 toolPart={toolPart}
    //                 key={toolPart.toolCallId}
    //                 loading={loading}
    //             />
    //         );
    //     }
    //     return (
    //         <div>
    //             {todos.map((todo) => (
    //                 <div className="flex items-center gap-2 text-small" key={todo.content}>
    //                     <div className="flex items-center justify-center w-4 h-4 min-w-4">
    //                         {
    //                             todo.status === 'completed' ?
    //                                 <Icons.SquareCheck className="w-4 h-4" /> :
    //                                 <Icons.Square className="w-4 h-4" />
    //                         }
    //                     </div>
    //                     <p className={cn(
    //                         todo.status === 'completed' ? 'line-through text-green-500' : '',
    //                         todo.status === 'in_progress' ? 'text-yellow-500' : '',
    //                         todo.status === 'pending' ? 'text-gray-500' : '',
    //                     )}>{todo.content}</p>
    //                 </div>
    //             ))}
    //         </div>
    //     );
    // }

    if (toolName === TypecheckTool.toolName) {
        const result = toolPart.output as {
            success: boolean;
            error?: string;
        } | null;
        const error = stripAnsi(result?.error ?? '');
        return (
            <BashCodeDisplay
                key={toolPart.toolCallId}
                content={'bunx tsc --noEmit'}
                isStream={isStream}
                defaultStdOut={(result?.success ? '✅ Typecheck passed!' : result?.error) ?? null}
                defaultStdErr={error ?? null}
            />
        );
    }

    // Per-state rendering. Previous code lumped every non-output state into a
    // perpetual loading spinner, which masked errors and made stalled tool
    // calls look identical to running ones. Each branch below renders the
    // exact state so the user can tell what's happening.
    const state = toolPart.state;

    // Provider returned an error — show the error inline, NOT a spinner.
    if (state === 'output-error') {
        return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} loading={false} />;
    }

    // Tool resolved successfully.
    if (state === 'output-available') {
        return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} loading={false} />;
    }

    // Currently streaming (live response). Show shimmer.
    if (isStream) {
        return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} loading={true} />;
    }

    // Tool call is in `input-available` / `input-streaming` but the assistant
    // turn has finished — i.e. the call never returned a result. Surface a
    // retry affordance so the user isn't stuck staring at a frozen spinner.
    return <ToolCallSimple toolPart={toolPart} key={toolPart.toolCallId} loading={false} stalled />;
};

export const ToolCallDisplay = observer(ToolCallDisplayComponent);
