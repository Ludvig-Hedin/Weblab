import type { z } from 'zod';

import type { BaseTool, ToolCategory, ToolExecutionSite, ToolProvider } from './models/base';
import { TOOLS_MAP } from './toolset';

/**
 * Typed view over the tool class registry. Built from TOOLS_MAP, which
 * itself is built from the same class list `getToolSetFromType` uses.
 */
export interface ToolDescriptor {
    id: string;
    label: string;
    description: string;
    category: ToolCategory;
    provider: ToolProvider;
    inputSchema: z.ZodSchema;
    outputSchema?: z.ZodSchema;
    requiresProject: boolean;
    requiresAuth: boolean;
    requiresNetwork: boolean;
    visibleToUser: boolean;
    executionSite: ToolExecutionSite;
}

function describe(toolClass: typeof BaseTool): ToolDescriptor {
    return {
        id: toolClass.toolName,
        label: toolClass.getLabel(),
        description: toolClass.description,
        category: toolClass.category,
        provider: toolClass.provider,
        inputSchema: toolClass.parameters,
        outputSchema: toolClass.outputSchema,
        requiresProject: toolClass.requiresProject,
        requiresAuth: toolClass.requiresAuth,
        requiresNetwork: toolClass.requiresNetwork,
        visibleToUser: toolClass.visibleToUser,
        executionSite: toolClass.executionSite,
    };
}

export function getToolDescriptor(toolName: string): ToolDescriptor | null {
    const cls = TOOLS_MAP.get(toolName);
    return cls ? describe(cls) : null;
}

export function listAllToolDescriptors(): ToolDescriptor[] {
    return Array.from(TOOLS_MAP.values()).map(describe);
}

export function listByCategory(category: ToolCategory): ToolDescriptor[] {
    return listAllToolDescriptors().filter((d) => d.category === category);
}

export function getServerExecutableTools(): ToolDescriptor[] {
    return listAllToolDescriptors().filter((d) => d.executionSite === 'server');
}
