#!/usr/bin/env bun
/**
 * Weblab Agent MCP server — a local stdio process that lets Claude Code (and
 * other MCP clients) inspect Weblab over the token-authenticated agent API,
 * with no browser session.
 *
 * Required env: WEBLAB_AGENT_API_URL, WEBLAB_AGENT_API_TOKEN (see config.ts).
 * Run: `bun packages/mcp/src/agent/server.ts` (bin: `weblab-agent-mcp`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { APP_NAME } from '@weblab/constants/editor';

import { loadAgentConfigFromEnv } from './config.js';
import { WeblabAgentConnector } from './connector.js';
import { AgentApiError } from './errors.js';
import { createAgentTools } from './tools.js';

// Fail fast with a clear message if the process is misconfigured.
const config = loadAgentConfigFromEnv();
const connector = new WeblabAgentConnector(config);

const server = new McpServer({ name: `${APP_NAME.toLowerCase()}-agent`, version: '0.1.0' });

for (const tool of createAgentTools(connector)) {
    server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema.shape },
        async (args: unknown) => {
            try {
                const text = await tool.run(args);
                return { content: [{ type: 'text' as const, text }] };
            } catch (err) {
                const e =
                    err instanceof AgentApiError
                        ? err
                        : new AgentApiError(
                              'BACKEND_UNAVAILABLE',
                              err instanceof Error ? err.message : 'unknown error',
                          );
                return {
                    content: [{ type: 'text' as const, text: `[${e.code}] ${e.message}` }],
                    isError: true,
                };
            }
        },
    );
}

const transport = new StdioServerTransport();
await server.connect(transport);
