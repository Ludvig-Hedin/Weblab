import type { ComponentType } from 'react';
import { tool } from 'ai';
import { type z } from 'zod';

export interface ToolIcon {
    className?: string;
}

export type ToolCategory = 'project' | 'files' | 'images' | 'web' | 'skills' | 'settings';

export type ToolProvider =
    | 'local'
    | 'openai'
    | 'anthropic'
    | 'openrouter'
    | 'firecrawl'
    | 'exa'
    | 'placeholder';

export type ToolExecutionSite = 'client' | 'server';

export abstract class BaseTool {
    static readonly toolName: string;
    static readonly description: string;
    static readonly parameters: z.ZodSchema;
    static readonly icon: ComponentType<ToolIcon>;

    static readonly outputSchema: z.ZodSchema | undefined = undefined;
    static readonly category: ToolCategory = 'files';
    static readonly provider: ToolProvider = 'local';
    static readonly requiresProject: boolean = true;
    static readonly requiresAuth: boolean = true;
    static readonly requiresNetwork: boolean = false;
    static readonly visibleToUser: boolean = true;
    static readonly executionSite: ToolExecutionSite = 'client';

    static getAITool() {
        return tool({
            description: this.description,
            inputSchema: this.parameters,
        });
    }

    static getLabel(_input?: unknown): string {
        return this.toolName;
    }
}
