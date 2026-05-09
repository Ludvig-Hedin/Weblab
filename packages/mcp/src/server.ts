#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { getProjectInfo } from './resources/project.js';
import { bashSchema, handleBash } from './tools/bash.js';
import { globSchema, handleGlob } from './tools/glob.js';
import { grepSchema, handleGrep } from './tools/grep.js';
import { handleListFiles, listFilesSchema } from './tools/list-files.js';
import { handleReadFile, readFileSchema } from './tools/read-file.js';
import { handleSearchReplace, searchReplaceSchema } from './tools/search-replace.js';
import { handleTypecheck, typecheckSchema } from './tools/typecheck.js';
import { handleWriteFile, writeFileSchema } from './tools/write-file.js';

const projectRoot = process.env.WEBLAB_PROJECT_ROOT ?? process.cwd();

const server = new McpServer({ name: 'weblab', version: '0.1.0' });

// ── Read tools ────────────────────────────────────────────────────────────────

server.registerTool(
    'read_file',
    {
        description:
            'Read a file from the filesystem with optional line offset and limit. Returns content with line numbers.',
        inputSchema: readFileSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleReadFile(args, projectRoot) }],
    }),
);

server.registerTool(
    'list_files',
    {
        description:
            'List the immediate contents of a directory (non-recursive), sorted with directories first.',
        inputSchema: listFilesSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleListFiles(args, projectRoot) }],
    }),
);

server.registerTool(
    'grep',
    {
        description:
            'Search for a regex pattern across a file or directory tree. Returns matching lines with file:line.',
        inputSchema: grepSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleGrep(args, projectRoot) }],
    }),
);

server.registerTool(
    'glob',
    {
        description:
            'Find files matching a glob pattern (e.g. "**/*.ts", "src/**/*.tsx") under a root directory.',
        inputSchema: globSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleGlob(args, projectRoot) }],
    }),
);

server.registerTool(
    'typecheck',
    {
        description:
            'Run TypeScript type checking in the project. Returns errors or a success message.',
        inputSchema: typecheckSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleTypecheck(args, projectRoot) }],
    }),
);

// ── Edit tools ────────────────────────────────────────────────────────────────

server.registerTool(
    'write_file',
    {
        description:
            'Write content to a file, creating parent directories as needed. Overwrites existing files.',
        inputSchema: writeFileSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleWriteFile(args, projectRoot) }],
    }),
);

server.registerTool(
    'search_replace',
    {
        description:
            'Find and replace an exact string in a file. old_string must be unique unless replace_all=true.',
        inputSchema: searchReplaceSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleSearchReplace(args, projectRoot) }],
    }),
);

server.registerTool(
    'bash',
    {
        description: `Run a shell command in the project (cwd defaults to ${projectRoot}). Returns stdout, stderr, and exit code.`,
        inputSchema: bashSchema,
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: await handleBash(args, projectRoot) }],
    }),
);

// ── Resources ─────────────────────────────────────────────────────────────────

server.registerResource(
    'project',
    'weblab://project',
    {
        mimeType: 'application/json',
        description:
            'Current project info: name, root directory, git branch, and top-level file tree',
    },
    async (_uri) => ({
        contents: [
            {
                uri: 'weblab://project',
                mimeType: 'application/json',
                text: await getProjectInfo(projectRoot),
            },
        ],
    }),
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
