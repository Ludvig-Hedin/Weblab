// Unit tests for the pure CLI mapping logic: Claude stream-json → UI chunks,
// Codex app-server notifications → UI chunks + approval answers, sign-in
// probe parsing, and prompt building. No processes are spawned.

import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClaudeMapper } from './claude-events.js';
import { createCodexMapper } from './codex-events.js';
import { buildArgs, normalizeModel } from './claude.js';
import { pickCliEnv } from './process.js';
import { buildTranscriptPrompt, isAllowedEditPath, latestUserText } from './shared.js';
import { BUSY_MESSAGE, createTurnRegistry } from './turns.js';
import { cliJournalCandidates } from '../weblab-local.js';
import { describeCliFailure, parseClaudeAuthStatus, parseCodexLoginStatus } from './status.js';

const CWD = '/Users/me/weblab-private-working-copies/abc/project';

// Trimmed from a real `claude -p --output-format stream-json --verbose
// --include-partial-messages` run (Claude Code 2.1.x).
const CLAUDE_LINES = [
    { type: 'system', subtype: 'init', session_id: 'sess-1234abcd', cwd: CWD },
    { type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_1' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Plan it' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'Edit', input: {} } }, parent_tool_use_id: null },
    {
        type: 'assistant',
        message: {
            id: 'msg_1',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'Edit', input: { file_path: `${CWD}/app/page.tsx`, old_string: 'a', new_string: 'b' } }],
        },
        parent_tool_use_id: null,
    },
    { type: 'stream_event', event: { type: 'message_stop' }, parent_tool_use_id: null },
    {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'The file has been updated.' }] },
        parent_tool_use_id: null,
    },
    { type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_2' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '.' } }, parent_tool_use_id: null },
    { type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, parent_tool_use_id: null },
    { type: 'assistant', message: { id: 'msg_2', content: [{ type: 'text', text: 'Done.' }] }, parent_tool_use_id: null },
    { type: 'result', subtype: 'success', is_error: false, result: 'Done.', session_id: 'sess-1234abcd' },
];

function runClaude(lines) {
    const mapper = createClaudeMapper({ cwd: CWD });
    const chunks = lines.flatMap((line) => mapper.handle(line));
    return { mapper, chunks };
}

describe('createClaudeMapper', () => {
    test('streams text deltas once, even though the final assistant message repeats them', () => {
        const { chunks } = runClaude(CLAUDE_LINES);
        const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('');
        expect(text).toBe('Done.');
        expect(chunks.filter((c) => c.type === 'text-start')).toHaveLength(1);
        expect(chunks.filter((c) => c.type === 'text-end')).toHaveLength(1);
    });

    test('maps thinking to reasoning chunks', () => {
        const { chunks } = runClaude(CLAUDE_LINES);
        expect(chunks.find((c) => c.type === 'reasoning-delta')?.delta).toBe('Plan it');
        expect(chunks.some((c) => c.type === 'reasoning-end')).toBe(true);
    });

    test('tool use becomes a data-cli-tool card with a project-relative path, then done', () => {
        const { chunks } = runClaude(CLAUDE_LINES);
        const cards = chunks.filter((c) => c.type === 'data-cli-tool');
        expect(cards).toHaveLength(2);
        expect(cards[0]).toMatchObject({
            id: 'toolu_1',
            data: { provider: 'claude-code', tool: 'Edit', status: 'running', input: { file_path: 'app/page.tsx' } },
        });
        expect(cards[1].data).toMatchObject({ status: 'done', output: 'The file has been updated.' });
        // Never an AI SDK tool part: those would be executed as Weblab tools.
        expect(chunks.some((c) => c.type.startsWith('tool-'))).toBe(false);
    });

    test('a new model call after tool results starts a new step', () => {
        const { chunks } = runClaude(CLAUDE_LINES);
        const types = chunks.map((c) => c.type);
        const finishIdx = types.indexOf('finish-step');
        expect(finishIdx).toBeGreaterThan(-1);
        expect(types[finishIdx + 1]).toBe('start-step');
        expect(finishIdx).toBeLessThan(types.indexOf('text-start'));
    });

    test('captures session id and success result', () => {
        const { mapper } = runClaude(CLAUDE_LINES);
        expect(mapper.sessionId).toBe('sess-1234abcd');
        expect(mapper.result).toMatchObject({ isError: false, subtype: 'success' });
        expect(mapper.sawOutput).toBe(true);
    });

    test('skips sub-agent events', () => {
        const { chunks } = runClaude([
            { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', id: 't', name: 'Read', input: {} }] }, parent_tool_use_id: 'toolu_parent' },
        ]);
        expect(chunks).toEqual([]);
    });

    test('falls back to whole assistant text when partial messages are missing', () => {
        const { chunks } = runClaude([
            { type: 'assistant', message: { id: 'm9', content: [{ type: 'text', text: 'Hi' }] }, parent_tool_use_id: null },
        ]);
        expect(chunks.map((c) => c.type)).toEqual(['text-start', 'text-delta', 'text-end']);
    });

    test('error tool results and aborted turns mark cards as errors', () => {
        const mapper = createClaudeMapper({ cwd: CWD });
        mapper.handle({ type: 'assistant', message: { id: 'm', content: [
            { type: 'tool_use', id: 'a', name: 'Write', input: { file_path: '/etc/hosts', content: 'x' } },
            { type: 'tool_use', id: 'b', name: 'Read', input: { file_path: `${CWD}/x.ts` } },
        ] } });
        const denied = mapper.handle({ type: 'user', message: { content: [
            { type: 'tool_result', tool_use_id: 'a', is_error: true, content: [{ type: 'text', text: 'Permission denied' }] },
        ] } });
        expect(denied[0].data).toMatchObject({ status: 'error', errorText: 'Permission denied', input: { file_path: '/etc/hosts' } });
        const end = mapper.finish({ aborted: true });
        expect(end.find((c) => c.id === 'b')?.data).toMatchObject({ status: 'error', errorText: 'Stopped.' });
        expect(end.at(-1)).toEqual({ type: 'finish-step' });
    });

    test('error results are reported', () => {
        const { mapper } = runClaude([{ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }]);
        expect(mapper.result.isError).toBe(true);
    });
});

describe('claude args', () => {
    test('acceptEdits, Bash disallowed, never bypassPermissions', () => {
        const args = buildArgs({ model: 'claude-sonnet-4-6', resumeSessionId: 'sess-1234abcd' });
        expect(args).toContain('--include-partial-messages');
        expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
        expect(args[args.indexOf('--disallowedTools') + 1]).toBe('Bash');
        expect(args.join(' ')).not.toContain('bypassPermissions');
        expect(args.join(' ')).not.toContain('dangerously');
        expect(args[args.indexOf('--resume') + 1]).toBe('sess-1234abcd');
        expect(args).toContain('--strict-mcp-config');
        expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
        expect(args).toContain('Write(.claude/**)');
        expect(args).toContain('Edit(.git/**)');
    });

    test('normalizes dotted Claude model ids', () => {
        expect(normalizeModel('claude-sonnet-4.6')).toBe('claude-sonnet-4-6');
        expect(normalizeModel('claude-opus-5-5')).toBe('claude-opus-5-5');
    });

    test('startup diagnosis restricts Claude to read-only tools', () => {
        const args = buildArgs({ model: 'claude-sonnet-4-6', readOnly: true });
        expect(args[args.indexOf('--permission-mode') + 1]).toBe('plan');
        expect(args[args.indexOf('--tools') + 1]).toBe('Read,Glob,Grep');
        for (const tool of ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
            expect(args).toContain(tool);
        }
    });
});

describe('createCodexMapper', () => {
    test('startup diagnosis declines file changes', () => {
        const m = createCodexMapper({ cwd: CWD, readOnly: true });
        m.handleNotification('item/started', { item: {
            type: 'fileChange', id: 'read-only', status: 'inProgress',
            changes: [{ path: `${CWD}/app/page.tsx`, kind: { type: 'update' } }],
        } });
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'read-only' })).toEqual({ result: { decision: 'decline' } });
        expect(m.answerRequest('applyPatchApproval', { fileChanges: { 'app/page.tsx': { type: 'update', unified_diff: '-a\n+b', move_path: null } } }).result.decision).toEqual({ denied: { rejection: 'Startup diagnosis is read-only. Ask for approval before editing.' } });
        expect(m.touchedPaths).toEqual([]);
    });
    test('streams agent message deltas and closes on completion', () => {
        const m = createCodexMapper({ cwd: CWD });
        const chunks = [
            ...m.handleNotification('item/started', { item: { type: 'agentMessage', id: 'i1', text: '' } }),
            ...m.handleNotification('item/agentMessage/delta', { itemId: 'i1', delta: 'Hel' }),
            ...m.handleNotification('item/agentMessage/delta', { itemId: 'i1', delta: 'lo' }),
            ...m.handleNotification('item/completed', { item: { type: 'agentMessage', id: 'i1', text: 'Hello' } }),
        ];
        expect(chunks.map((c) => c.type)).toEqual(['text-start', 'text-delta', 'text-delta', 'text-end']);
        expect(m.sawOutput).toBe(true);
    });

    test('file changes become cards and are approved only inside the project', () => {
        const m = createCodexMapper({ cwd: CWD });
        const started = m.handleNotification('item/started', { item: {
            type: 'fileChange', id: 'f1', status: 'inProgress',
            changes: [{ path: `${CWD}/app/page.tsx`, kind: { type: 'update', move_path: null }, diff: '-a\n+b' }],
        } });
        expect(started[0]).toMatchObject({ type: 'data-cli-tool', id: 'f1', data: { tool: 'file_change', status: 'running', input: { files: [{ path: 'app/page.tsx', kind: 'update' }] } } });
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'f1' })).toEqual({ result: { decision: 'accept' } });

        m.handleNotification('item/started', { item: {
            type: 'fileChange', id: 'f2', status: 'inProgress',
            changes: [{ path: '/etc/passwd', kind: { type: 'update', move_path: null }, diff: '' }],
        } });
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'f2' })).toEqual({ result: { decision: 'decline' } });
        // A move out of the project is also refused.
        m.handleNotification('item/started', { item: {
            type: 'fileChange', id: 'f3', status: 'inProgress',
            changes: [{ path: 'a.ts', kind: { type: 'update', move_path: '../../outside.ts' }, diff: '' }],
        } });
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'f3' })).toEqual({ result: { decision: 'decline' } });
        // Unknown item, or a request to widen write access: refused.
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'nope' }).result.decision).toBe('decline');
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'f1', grantRoot: '/' }).result.decision).toBe('decline');

        const done = m.handleNotification('item/completed', { item: {
            type: 'fileChange', id: 'f1', status: 'completed',
            changes: [{ path: `${CWD}/app/page.tsx`, kind: { type: 'update' }, diff: '-a\n+b' }],
        } });
        expect(done[0].data).toMatchObject({ status: 'done', output: '-a\n+b' });
    });

    test('commands needing approval are declined, and shown as blocked', () => {
        const m = createCodexMapper({ cwd: CWD });
        expect(m.answerRequest('item/commandExecution/requestApproval', { itemId: 'c1' })).toEqual({ result: { decision: 'decline' } });
        expect(m.answerRequest('execCommandApproval', {}).result.decision).toHaveProperty('denied');
        m.handleNotification('item/started', { item: { type: 'commandExecution', id: 'c1', command: 'npm install', status: 'inProgress' } });
        const done = m.handleNotification('item/completed', { item: { type: 'commandExecution', id: 'c1', command: 'npm install', status: 'declined' } });
        expect(done[0].data).toMatchObject({ tool: 'command', status: 'error' });
    });

    test('legacy applyPatchApproval follows the same folder rule', () => {
        const m = createCodexMapper({ cwd: CWD });
        const update = { type: 'update', unified_diff: '-a\n+b', move_path: null };
        expect(m.answerRequest('applyPatchApproval', { fileChanges: { [`${CWD}/a.ts`]: update }, grantRoot: null }).result.decision).toBe('approved');
        expect(m.answerRequest('applyPatchApproval', { fileChanges: { '/tmp/x': update }, grantRoot: null }).result.decision).toHaveProperty('denied');
    });

    test('legacy typed add, delete and moves journal every approved path', () => {
        const m = createCodexMapper({ cwd: CWD });
        const changes = {
            'new.ts': { type: 'add', content: '' },
            'removed.ts': { type: 'delete', content: 'old' },
            'old.ts': { type: 'update', unified_diff: '-a\n+b', move_path: 'nested/new.ts' },
        };
        expect(m.answerRequest('applyPatchApproval', { fileChanges: changes }).result.decision).toBe('approved');
        expect([...m.touchedPaths].sort()).toEqual(['nested/new.ts', 'new.ts', 'old.ts', 'removed.ts']);
        expect(m.answerRequest('applyPatchApproval', { fileChanges: changes, grantRoot: '/' }).result.decision).toHaveProperty('denied');
        const readOnly = createCodexMapper({ cwd: CWD, readOnly: true });
        expect(readOnly.answerRequest('applyPatchApproval', { fileChanges: changes }).result.decision).toHaveProperty('denied');
        expect(readOnly.touchedPaths).toEqual([]);
    });

    test.each([null, [], new Map(), {}, { '': { type: 'add', content: '' } },
        { 'a.ts': {} }, { 'a.ts': null }, { 'a.ts': [] },
        { 'a.ts': { type: 'add', content: 1 } },
        { 'a.ts': { type: 'delete', unified_diff: '' } },
        { 'a.ts': { type: 'update', content: 'old', move_path: null } },
        { 'a.ts': { type: 'update', unified_diff: '', move_path: '' } },
        { 'a.ts': { type: 'update', unified_diff: '', move_path: 1 } },
        { 'a.ts': { type: 'add', content: '', move_path: null } },
        { 'a.ts': { type: 'unknown', content: '' } },
        { 'a.ts': { type: 'update', unified_diff: '', move_path: '/tmp/outside.ts' } },
    ].map((fileChanges) => ({ fileChanges })))('legacy malformed or outside-root changes are declined: %o', ({ fileChanges }) => {
        const m = createCodexMapper({ cwd: CWD });
        expect(m.answerRequest('applyPatchApproval', { fileChanges }).result.decision).toHaveProperty('denied');
        expect(m.touchedPaths).toEqual([]);
    });

    test.each([null, [], {}, { kind: { type: 'update' }, diff: '' },
        { path: '', kind: { type: 'update' }, diff: '' },
        { path: 'a.ts', kind: null, diff: '' },
        { path: 'a.ts', kind: { type: 'unknown' }, diff: '' },
        { path: 'a.ts', kind: { type: 'update' }, diff: null },
        { path: 'a.ts', kind: { type: 'update', move_path: '' }, diff: '' },
        { path: 'a.ts', kind: { type: 'add', move_path: 'b.ts' }, diff: '' },
        { path: 'a.ts', kind: { type: 'update' }, diff: '', move_path: '/tmp/outside.ts' },
    ].map((change) => ({ change })))('modern malformed records never vacuously approve or crash mapping: %o', ({ change }) => {
        const m = createCodexMapper({ cwd: CWD });
        const item = { type: 'fileChange', id: 'malformed', changes: [change] };
        expect(() => m.handleNotification('item/started', { item })).not.toThrow();
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: item.id }).result.decision).toBe('decline');
        expect(() => m.handleNotification('item/completed', { item })).not.toThrow();
        expect(m.touchedPaths).toEqual([]);
    });

    test('modern empty maps and mixed invalid batches decline every change', () => {
        for (const changes of [{}, new Map(), [], [
            { path: 'a.ts', kind: { type: 'update', move_path: null }, diff: '' },
            { path: 'b.ts', kind: { type: 'update', move_path: '/tmp/outside.ts' }, diff: '' },
        ]]) {
            const m = createCodexMapper({ cwd: CWD });
            m.handleNotification('item/started', { item: { type: 'fileChange', id: 'batch', changes } });
            expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'batch' }).result.decision).toBe('decline');
            expect(m.touchedPaths).toEqual([]);
        }
    });

    test.skipIf(process.platform === 'win32')('legacy and modern moves refuse symlink destinations outside the project', () => {
        const temp = realpathSync(mkdtempSync(join(tmpdir(), 'weblab-codex-move-')));
        const root = join(temp, 'project'); const outside = join(temp, 'outside');
        try {
            mkdirSync(root); mkdirSync(outside); symlinkSync(outside, join(root, 'escape'));
            const legacy = createCodexMapper({ cwd: root });
            expect(legacy.answerRequest('applyPatchApproval', { fileChanges: {
                'a.ts': { type: 'update', unified_diff: '', move_path: 'escape/new.ts' },
            } }).result.decision).toHaveProperty('denied');
            expect(legacy.touchedPaths).toEqual([]);
            const modern = createCodexMapper({ cwd: root });
            modern.handleNotification('item/started', { item: { type: 'fileChange', id: 'move', changes: [
                { path: 'a.ts', kind: { type: 'update', move_path: 'escape/new.ts' }, diff: '' },
            ] } });
            expect(modern.answerRequest('item/fileChange/requestApproval', { itemId: 'move' }).result.decision).toBe('decline');
            expect(modern.touchedPaths).toEqual([]);
        } finally { rmSync(temp, { recursive: true, force: true }); }
    });

    test('other server requests get a JSON-RPC error', () => {
        const m = createCodexMapper({ cwd: CWD });
        expect(m.answerRequest('item/permissions/requestApproval', {})).toHaveProperty('error');
        expect(m.answerRequest('item/tool/requestUserInput', {})).toHaveProperty('error');
    });

    test('turn status and non-retried errors are tracked', () => {
        const m = createCodexMapper({ cwd: CWD });
        m.handleNotification('error', { error: { message: 'retrying' }, willRetry: true });
        expect(m.errorMessage).toBeNull();
        m.handleNotification('error', { error: { message: 'boom' }, willRetry: false });
        m.handleNotification('turn/completed', { turn: { status: 'failed', error: { message: 'Not logged in' } } });
        expect(m.turnStatus).toBe('failed');
        expect(m.errorMessage).toBe('Not logged in');
    });

    test('finish closes open text and stops running tools', () => {
        const m = createCodexMapper({ cwd: CWD });
        m.handleNotification('item/agentMessage/delta', { itemId: 'i1', delta: 'x' });
        m.handleNotification('item/started', { item: { type: 'commandExecution', id: 'c', command: 'ls', status: 'inProgress' } });
        const end = m.finish({ aborted: true });
        expect(end.map((c) => c.type)).toEqual(['text-end', 'data-cli-tool', 'finish-step']);
        expect(end[1].data.status).toBe('error');
    });
});

describe('sign-in probes', () => {
    test('claude auth status JSON', () => {
        expect(parseClaudeAuthStatus({ code: 0, stdout: '{"loggedIn": true, "authMethod": "claude.ai"}' })).toBe('ready');
        expect(parseClaudeAuthStatus({ code: 1, stdout: '{"loggedIn": false}' })).toBe('sign-in');
        expect(parseClaudeAuthStatus({ code: 1, stdout: '', stderr: 'Not logged in. Run claude auth login' })).toBe('sign-in');
        expect(parseClaudeAuthStatus({ code: 1, stdout: '', stderr: "error: unknown command 'auth'" })).toBe('unknown');
    });

    test('codex login status text', () => {
        expect(parseCodexLoginStatus({ code: 0, stdout: 'Logged in using ChatGPT\n' })).toBe('ready');
        expect(parseCodexLoginStatus({ code: 1, stdout: 'Not logged in\n' })).toBe('sign-in');
        expect(parseCodexLoginStatus({ code: 2, stderr: "error: unrecognized subcommand 'status'" })).toBe('unknown');
    });

    test('failure text becomes an actionable chat error', () => {
        expect(describeCliFailure('claude-code', 'Invalid API key · Please run /login')).toMatchObject({ code: 'not_signed_in' });
        expect(describeCliFailure('codex', 'Not logged in').message).toContain('codex login');
        expect(describeCliFailure('codex', 'something odd\nmore').message).toBe('Codex stopped: something odd');
    });
});

describe('prompt helpers', () => {
    const messages = [
        { role: 'user', content: 'Make the hero blue' },
        { role: 'assistant', content: 'Done.' },
        { role: 'user', content: 'Now make it red' },
    ];

    test('transcript replays history and ends with the latest message', () => {
        const prompt = buildTranscriptPrompt(messages);
        expect(prompt).toContain('USER: Make the hero blue');
        expect(prompt).toContain('ASSISTANT: Done.');
        expect(prompt.endsWith('Now make it red')).toBe(true);
        expect(buildTranscriptPrompt([messages[0]])).toBe('Make the hero blue');
    });

    test('resumed sessions only send the newest user message', () => {
        expect(latestUserText(messages)).toBe('Now make it red');
    });

    test('isAllowedEditPath rejects traversal and protected folders', () => {
        expect(isAllowedEditPath(CWD, 'app/page.tsx')).toBe(true);
        expect(isAllowedEditPath(CWD, `${CWD}/app/new.tsx`)).toBe(true);
        expect(isAllowedEditPath(CWD, '../other')).toBe(false);
        expect(isAllowedEditPath(CWD, `${CWD}-evil/x`)).toBe(false);
        expect(isAllowedEditPath(CWD, CWD)).toBe(false);
        for (const bad of ['.git/config', '.claude/settings.json', '.codex/x', 'node_modules/a/index.js', 'pkg/node_modules/x']) {
            expect(isAllowedEditPath(CWD, bad)).toBe(false);
        }
    });

    test('isAllowedEditPath resolves symlinked parents before comparing', () => {
        const base = realpathSync(mkdtempSync(join(tmpdir(), 'weblab-cli-')));
        const project = join(base, 'project');
        const outside = join(base, 'outside');
        mkdirSync(project);
        mkdirSync(outside);
        mkdirSync(join(project, 'src'));
        symlinkSync(outside, join(project, 'escape'));
        expect(isAllowedEditPath(project, 'src/new-file.ts')).toBe(true);
        expect(isAllowedEditPath(project, 'escape/new-file.ts')).toBe(false);
        expect(isAllowedEditPath(project, 'escape/deep/not/yet/there.ts')).toBe(false);
    });
});

describe('handoff journal inputs (only what the CLI reported)', () => {
    test('Claude reports successful edits, not reads or failed edits', () => {
        const mapper = createClaudeMapper({ cwd: CWD });
        mapper.handle({ type: 'assistant', message: { id: 'm', content: [
            { type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: `${CWD}/app/page.tsx` } },
            { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: `${CWD}/app/layout.tsx` } },
            { type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: `${CWD}/.claude/settings.json` } },
            { type: 'tool_use', id: 'e2', name: 'Edit', input: { file_path: `${CWD}/b.css` } },
            { type: 'tool_use', id: 'e3', name: 'Write', input: { file_path: `${CWD}/c.ts` } },
        ] } });
        mapper.handle({ type: 'user', message: { content: [
            { type: 'tool_result', tool_use_id: 'e1', content: 'ok' },
            { type: 'tool_result', tool_use_id: 'r1', content: 'text' },
            { type: 'tool_result', tool_use_id: 'w1', content: 'ok' },
            { type: 'tool_result', tool_use_id: 'e2', is_error: true, content: 'denied' },
        ] } });
        mapper.finish({ aborted: true }); // e3 was interrupted mid-write: still journaled
        expect(mapper.touchedPaths.sort()).toEqual(['app/page.tsx', 'c.ts']);
    });

    test('Codex reports file-change paths including moves', () => {
        const m = createCodexMapper({ cwd: CWD });
        m.handleNotification('item/started', { item: {
            type: 'fileChange', id: 'f', status: 'inProgress',
            changes: [
                { path: `${CWD}/a.ts`, kind: { type: 'update', move_path: `${CWD}/b.ts` }, diff: '' },
            ],
        } });
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: 'f' }).result.decision).toBe('accept');
        expect(m.touchedPaths.sort()).toEqual(['a.ts', 'b.ts']);
    });

    test('Codex refuses a mixed valid move and protected change without journaling any path', () => {
        const m = createCodexMapper({ cwd: CWD });
        const item = {
            type: 'fileChange', id: 'mixed', status: 'inProgress',
            changes: [
                { path: `${CWD}/a.ts`, kind: { type: 'update', move_path: `${CWD}/b.ts` }, diff: '' },
                { path: `${CWD}/.git/HEAD`, kind: { type: 'update' }, diff: '' },
            ],
        };
        m.handleNotification('item/started', { item });
        expect(m.answerRequest('item/fileChange/requestApproval', { itemId: item.id }).result.decision).toBe('decline');
        expect(m.touchedPaths).toEqual([]);
        m.handleNotification('item/completed', { item: { ...item, status: 'completed' } });
        expect(m.touchedPaths).toEqual([]);
    });

    test('journal candidates drop protected, absolute and traversal paths', () => {
        expect(cliJournalCandidates(['a/b.ts', '../x', '.git/c', 'node_modules/x/y', 'a/b.ts', '/abs', '.codex/c', 'x/./y', 'dist/x.js']))
            .toEqual(['a/b.ts', 'dist/x.js']);
    });
});

describe('codex reasoning blocks', () => {
    test('summary and raw reasoning get separate ids', () => {
        const m = createCodexMapper({ cwd: CWD });
        const out = [
            ...m.handleNotification('item/reasoning/summaryTextDelta', { itemId: 'r', delta: 'a' }),
            ...m.handleNotification('item/reasoning/textDelta', { itemId: 'r', delta: 'b' }),
            ...m.handleNotification('item/completed', { item: { type: 'reasoning', id: 'r' } }),
        ];
        const starts = out.filter((c) => c.type === 'reasoning-start').map((c) => c.id);
        expect(new Set(starts).size).toBe(2);
        expect(out.filter((c) => c.type === 'reasoning-end')).toHaveLength(2);
    });
});

describe('pickCliEnv', () => {
    test('keeps what the CLIs need and drops Weblab secrets', () => {
        const env = pickCliEnv({
            HOME: '/Users/me', PATH: '/bin', LANG: 'en_US.UTF-8', LC_ALL: 'C', XDG_CONFIG_HOME: '/x',
            ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', CODEX_HOME: '/c', HTTPS_PROXY: 'p',
            CONVEX_DEPLOY_KEY: 'secret', CLERK_SECRET_KEY: 'secret', ELECTRON_RUN_AS_NODE: '1',
            CLAUDECODE: '1', NODE_OPTIONS: '--inspect', GITHUB_TOKEN: 'secret',
        });
        expect(Object.keys(env).sort()).toEqual([
            'ANTHROPIC_API_KEY', 'CODEX_HOME', 'HOME', 'HTTPS_PROXY', 'LANG', 'LC_ALL', 'OPENAI_API_KEY', 'PATH', 'XDG_CONFIG_HOME',
        ]);
    });
});

describe('createTurnRegistry', () => {
    test('allows one running turn per folder', () => {
        const turns = createTurnRegistry();
        expect(turns.acquire('s1', '/copy/a')).toBeNull();
        expect(turns.acquire('s2', '/copy/a')).toBe(BUSY_MESSAGE);
        expect(turns.acquire('s3', '/copy/b')).toBeNull();
        expect(turns.acquire('s1', '/copy/c')).toBe('duplicate_stream');
        turns.release('s1');
        expect(turns.acquire('s2', '/copy/a')).toBeNull();
    });

    test('abortAll aborts every turn and waits for release, bounded by a timeout', async () => {
        const turns = createTurnRegistry();
        turns.acquire('s1', '/copy/a');
        turns.acquire('s2', '/copy/b');
        const s1 = turns.signal('s1');
        const s2 = turns.signal('s2');
        s1.addEventListener('abort', () => setTimeout(() => turns.release('s1'), 5));
        s2.addEventListener('abort', () => setTimeout(() => turns.release('s2'), 5));
        const started = Date.now();
        await turns.abortAll(50);
        expect(s1.aborted).toBe(true);
        expect(s2.aborted).toBe(true);
        expect(turns.isBusy('/copy/a')).toBe(false);
        expect(Date.now() - started).toBeLessThan(1000);
    });

    test('an unfinished or quarantined turn blocks shutdown and keeps its folder busy', async () => {
        const turns = createTurnRegistry();
        turns.acquire('pending', '/copy/pending');
        turns.quarantine('pending');
        turns.release('pending');
        await expect(turns.abortAll(10)).rejects.toThrow('cleanup is still pending');
        expect(turns.isBusy('/copy/pending')).toBe(true);
    });
});
