import type { InferUITools, ToolSet } from 'ai';
import { tool } from 'ai';

import { ChatType } from '@weblab/models';

import type { BaseTool } from './models/base';
import type { ServerToolContext } from './server-context';
import {
    AddGeneratedImageToProjectTool,
    BashEditTool,
    BashReadTool,
    CheckErrorsTool,
    EditImageTool,
    FuzzyEditFileTool,
    GenerateImageTool,
    GetProjectSettingsTool,
    GlobTool,
    GrepTool,
    ListBranchesTool,
    ListFilesTool,
    ListSkillsTool,
    ReadFileTool,
    ReadSkillTool,
    ReadStyleGuideTool,
    ReplaceImageInElementTool,
    SandboxTool,
    ScrapeUrlTool,
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    TerminalCommandTool,
    TypecheckTool,
    UpdateProjectSettingsTool,
    UploadImageTool,
    WeblabInstructionsTool,
    WebSearchTool,
    WriteFileTool,
} from './classes';

type ToolClass = typeof BaseTool;

// Helper function to convert tool classes to ToolSet (no server context).
function createToolSet(toolClasses: ToolClass[]): ToolSet {
    return toolClasses.reduce((acc, toolClass) => {
        acc[toolClass.toolName] = toolClass.getAITool();
        return acc;
    }, {} as ToolSet);
}

// Helper function that binds server-side execute() for ServerTool subclasses
// when a ServerToolContext is available; client tools fall through to
// getAITool() (no execute) and are handled in the browser by EditorEngine.
function createBoundToolSet(toolClasses: ToolClass[], ctx: ServerToolContext): ToolSet {
    return toolClasses.reduce((acc, toolClass) => {
        if (toolClass.executionSite === 'server') {
            acc[toolClass.toolName] = tool({
                description: toolClass.description,
                inputSchema: toolClass.parameters,
                execute: async (input: unknown) => {
                    return (
                        toolClass as ToolClass & {
                            execute: (i: object, c: ServerToolContext) => Promise<unknown>;
                        }
                    ).execute(input as object, ctx);
                },
            });
        } else {
            acc[toolClass.toolName] = toolClass.getAITool();
        }
        return acc;
    }, {} as ToolSet);
}

const readOnlyToolClasses: ToolClass[] = [
    ListFilesTool,
    ReadFileTool,
    BashReadTool,
    WeblabInstructionsTool,
    ReadStyleGuideTool,
    ListBranchesTool,
    ScrapeUrlTool,
    WebSearchTool,
    GlobTool,
    GrepTool,
    TypecheckTool,
    CheckErrorsTool,
    GetProjectSettingsTool,
    ListSkillsTool,
    ReadSkillTool,
];
export const imageOnlyToolClasses: ToolClass[] = [
    GenerateImageTool,
    EditImageTool,
    AddGeneratedImageToProjectTool,
    ReplaceImageInElementTool,
];

const editOnlyToolClasses: ToolClass[] = [
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    FuzzyEditFileTool,
    WriteFileTool,
    BashEditTool,
    SandboxTool,
    TerminalCommandTool,
    UploadImageTool,
    UpdateProjectSettingsTool,
    ...imageOnlyToolClasses,
];
const allToolClasses: ToolClass[] = [...readOnlyToolClasses, ...editOnlyToolClasses];

export const readOnlyToolset: ToolSet = createToolSet(readOnlyToolClasses);
export const allToolset: ToolSet = createToolSet(allToolClasses);
export const TOOLS_MAP = new Map<string, ToolClass>(
    allToolClasses.map((toolClass) => [toolClass.toolName, toolClass]),
);

/**
 * Drop tools whose required runtime env keys are missing so the model
 * never sees a tool that's guaranteed to throw at execution time. Today
 * that means filtering image tools when OPENAI_API_KEY is unset (Ollama
 * users, dev without an OpenAI key).
 */
function filterUnavailable(classes: ToolClass[]): ToolClass[] {
    const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
    if (hasOpenAi) return classes;
    const imageNames = new Set(imageOnlyToolClasses.map((c) => c.toolName));
    return classes.filter((c) => !imageNames.has(c.toolName));
}

export function getToolClassesFromType(chatType: ChatType): ToolClass[] {
    const base = chatType === ChatType.ASK ? readOnlyToolClasses : allToolClasses;
    return filterUnavailable(base);
}

/**
 * Build the AI SDK ToolSet for a given chat type. When `serverContext` is
 * provided, ServerTool subclasses are bound to execute() server-side inside
 * the streamText agent loop. Without context, the existing pre-built
 * toolsets are returned unchanged (backward compatible).
 */
export function getToolSetFromType(
    chatType: ChatType,
    opts?: { serverContext?: ServerToolContext },
): ToolSet {
    const classes = getToolClassesFromType(chatType);
    if (opts?.serverContext) {
        return createBoundToolSet(classes, opts.serverContext);
    }
    // Rebuild from filtered classes so env-gating applies even on the
    // no-context path (e.g. Ollama-only sessions hitting cached toolset).
    return createToolSet(classes);
}

export type ChatTools = InferUITools<typeof allToolset>;
