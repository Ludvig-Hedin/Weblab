import { type InferUITools, type ToolSet } from 'ai';

import { ChatType } from '@weblab/models';

import type { BaseTool } from './models/base';
import {
    BashEditTool,
    BashReadTool,
    CheckErrorsTool,
    FuzzyEditFileTool,
    GlobTool,
    GrepTool,
    ListBranchesTool,
    ListFilesTool,
    ReadFileTool,
    ReadStyleGuideTool,
    SandboxTool,
    ScrapeUrlTool,
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    TerminalCommandTool,
    TypecheckTool,
    UploadImageTool,
    WeblabInstructionsTool,
    WebSearchTool,
    WriteFileTool,
} from './classes';

// Helper function to convert tool classes to ToolSet
function createToolSet(toolClasses: Array<{ toolName: string; getAITool: () => any }>): ToolSet {
    return toolClasses.reduce((acc, toolClass) => {
        acc[toolClass.toolName] = toolClass.getAITool();
        return acc;
    }, {} as ToolSet);
}

const readOnlyToolClasses = [
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
];
const editOnlyToolClasses = [
    SearchReplaceEditTool,
    SearchReplaceMultiEditFileTool,
    FuzzyEditFileTool,
    WriteFileTool,
    BashEditTool,
    SandboxTool,
    TerminalCommandTool,
    UploadImageTool,
];
const allToolClasses = [...readOnlyToolClasses, ...editOnlyToolClasses];

export const readOnlyToolset: ToolSet = createToolSet(readOnlyToolClasses);
export const allToolset: ToolSet = createToolSet(allToolClasses);
export const TOOLS_MAP = new Map<string, typeof BaseTool>(
    allToolClasses.map((toolClass) => [toolClass.toolName, toolClass]),
);

export function getToolClassesFromType(chatType: ChatType) {
    return chatType === ChatType.ASK ? readOnlyToolClasses : allToolClasses;
}

export function getToolSetFromType(chatType: ChatType) {
    return chatType === ChatType.ASK ? readOnlyToolset : allToolset;
}

export type ChatTools = InferUITools<typeof allToolset>;
