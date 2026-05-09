import { tool } from 'ai';

import type { ServerToolContext } from '../server-context';
import { BaseTool } from './base';

/**
 * Tools that execute server-side inside the chat route's streamText agent loop.
 *
 * Subclasses implement a static `execute(input, ctx)` method. The toolset
 * builder binds it into AI SDK `tool({ execute })` when a ServerToolContext
 * is provided; without context the tool is exposed without an execute fn
 * (model can call it but execution will throw with a clear message).
 */
export abstract class ServerTool extends BaseTool {
    static readonly executionSite = 'server';

    static execute(_input: object, _ctx: ServerToolContext): Promise<unknown> {
        throw new Error(
            `ServerTool subclass "${this.toolName}" did not implement static execute(input, ctx)`,
        );
    }

    static getAIToolWithContext(ctx: ServerToolContext) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed to bind the static class identity into the closure passed to AI SDK tool({execute}).
        const ToolClass = this;
        return tool({
            description: this.description,
            inputSchema: this.parameters,
            execute: async (input: unknown) => {
                return ToolClass.execute(input as object, ctx);
            },
        });
    }
}
