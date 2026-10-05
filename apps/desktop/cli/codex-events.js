/**
 * Maps `codex app-server` JSON-RPC notifications to AI SDK UI chunks, and
 * decides how to answer its approval requests. Pure and stateful per turn.
 *
 * Approval policy (the Codex equivalent of Claude's acceptEdits):
 *   - file changes: accepted only when every path stays inside the project
 *   - shell commands needing approval: declined
 *   - anything else (permissions, user input, MCP elicitation): refused
 * Startup diagnosis turns decline file changes as well.
 */

const path = require('path');

const { displayPath, isAllowedEditPath, journalPath, summarizeInput, toolChunk, truncate } = require('./shared');

const DECLINE_REASON = 'Weblab does not allow shell commands. Read and edit files directly instead.';

function record(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
        [Object.prototype, null].includes(Object.getPrototypeOf(value)));
}

function validPath(value) {
    return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

function changePaths(change) {
    if (!record(change) || Object.keys(change).some((key) => !['path', 'kind', 'diff'].includes(key)) ||
        !validPath(change.path) || typeof change.diff !== 'string' ||
        !record(change.kind) || !['add', 'delete', 'update'].includes(change.kind.type) ||
        Object.keys(change.kind).some((key) => !['type', 'move_path'].includes(key))) return null;
    const movePath = change.kind.move_path;
    if (Object.hasOwn(change.kind, 'move_path') &&
        (change.kind.type !== 'update' || (movePath !== null && !validPath(movePath)))) return null;
    const out = [change.path];
    if (typeof movePath === 'string') out.push(movePath);
    return out;
}

function legacyChangePaths(source, change) {
    if (!validPath(source) || !record(change)) return null;
    const allowed = change.type === 'update' ? ['type', 'unified_diff', 'move_path'] : ['type', 'content'];
    if (Object.keys(change).some((key) => !allowed.includes(key))) return null;
    if (change.type === 'add' || change.type === 'delete') {
        return typeof change.content === 'string' ? [source] : null;
    }
    if (change.type !== 'update' || typeof change.unified_diff !== 'string') return null;
    if (Object.hasOwn(change, 'move_path') && change.move_path !== null && !validPath(change.move_path)) return null;
    return typeof change.move_path === 'string' ? [source, change.move_path] : [source];
}

function allowedChanges(cwd, paths) {
    return paths.length > 0 && paths.every((files) => Array.isArray(files) && files.length > 0 &&
        files.every((file) => isAllowedEditPath(cwd, file)));
}

function createCodexMapper({ cwd, provider = 'codex', readOnly = false } = {}) {
    const state = {
        sawOutput: false,
        openText: new Map(), // itemId → true (text-start sent)
        textWithDeltas: new Set(),
        openReasoning: new Set(),
        tools: new Map(), // itemId → data
        fileChanges: new Map(), // itemId → changes[]
        touchedPaths: new Set(), // project-relative paths Codex reported changing
        turnStatus: null,
        errorMessage: null,
    };

    function markContent() {
        state.sawOutput = true;
    }

    function ensureText(itemId, out) {
        if (state.openText.has(itemId)) return;
        state.openText.set(itemId, true);
        out.push({ type: 'text-start', id: itemId });
    }

    function toolDataForItem(item) {
        switch (item.type) {
            case 'commandExecution':
                return { provider, tool: 'command', input: { command: truncate(item.command ?? '', 1000) } };
            case 'fileChange': {
                const changes = Array.isArray(item.changes) ? item.changes : [];
                state.fileChanges.set(item.id, changes);
                const paths = changes.map(changePaths);
                if (!readOnly && allowedChanges(cwd, paths)) {
                    for (const file of paths.flat()) state.touchedPaths.add(journalPath(cwd, file));
                }
                return {
                    provider,
                    tool: 'file_change',
                    input: {
                        files: changes.filter((c) => changePaths(c) !== null).map((c) => ({
                            path: displayPath(cwd, path.resolve(cwd ?? '.', c.path ?? '')),
                            kind: c.kind?.type ?? 'update',
                        })),
                    },
                };
            }
            case 'mcpToolCall':
                return {
                    provider,
                    tool: `${item.server ?? 'mcp'}.${item.tool ?? 'tool'}`,
                    input: summarizeInput(cwd, item.arguments),
                };
            case 'webSearch':
                return { provider, tool: 'web_search', input: { query: item.query ?? '' } };
            case 'dynamicToolCall':
                return { provider, tool: String(item.tool ?? 'tool'), input: summarizeInput(cwd, item.arguments) };
            default:
                return null;
        }
    }

    function completeTool(item, out) {
        const known = state.tools.get(item.id) ?? toolDataForItem(item);
        if (!known) return;
        const status = item.status;
        let data;
        if (status === 'declined') {
            data = {
                ...known,
                status: 'error',
                errorText: item.type === 'commandExecution' ? 'Blocked: shell commands are off in Weblab.' : 'Declined.',
            };
        } else if (status === 'failed') {
            data = {
                ...known,
                status: 'error',
                errorText: truncate(item.aggregatedOutput || item.error?.message || 'Failed.'),
            };
        } else if (item.type === 'fileChange') {
            const changes = Array.isArray(item.changes) ? item.changes : [];
            data = { ...known, status: 'done', output: truncate(changes.map((c) => typeof c?.diff === 'string' ? c.diff : '').join('\n')) };
        } else if (item.type === 'commandExecution') {
            data = { ...known, status: 'done', output: truncate(item.aggregatedOutput ?? '') };
        } else {
            data = { ...known, status: 'done' };
        }
        state.tools.set(item.id, data);
        out.push(toolChunk(item.id, data));
    }

    /** Map one server notification to UI chunks. */
    function handleNotification(method, params) {
        const out = [];
        const p = params ?? {};
        switch (method) {
            case 'item/agentMessage/delta': {
                if (!p.itemId || !p.delta) break;
                ensureText(p.itemId, out);
                state.textWithDeltas.add(p.itemId);
                markContent();
                out.push({ type: 'text-delta', id: p.itemId, delta: p.delta });
                break;
            }
            case 'item/reasoning/summaryTextDelta':
            case 'item/reasoning/textDelta': {
                if (!p.itemId || !p.delta) break;
                // Summary and raw reasoning stream separately; keep them apart.
                const kind = method === 'item/reasoning/summaryTextDelta' ? 'summary' : 'raw';
                const id = `reasoning-${kind}-${p.itemId}`;
                if (!state.openReasoning.has(id)) {
                    state.openReasoning.add(id);
                    out.push({ type: 'reasoning-start', id });
                }
                out.push({ type: 'reasoning-delta', id, delta: p.delta });
                break;
            }
            case 'item/started': {
                const item = p.item;
                if (!item?.id) break;
                const data = toolDataForItem(item);
                if (!data) break;
                const running = { ...data, status: 'running' };
                state.tools.set(item.id, running);
                markContent();
                out.push(toolChunk(item.id, running));
                break;
            }
            case 'item/completed': {
                const item = p.item;
                if (!item?.id) break;
                if (item.type === 'agentMessage') {
                    if (!state.textWithDeltas.has(item.id) && item.text) {
                        ensureText(item.id, out);
                        markContent();
                        out.push({ type: 'text-delta', id: item.id, delta: item.text });
                    }
                    if (state.openText.has(item.id)) {
                        state.openText.delete(item.id);
                        out.push({ type: 'text-end', id: item.id });
                    }
                } else if (item.type === 'reasoning') {
                    for (const kind of ['summary', 'raw']) {
                        const id = `reasoning-${kind}-${item.id}`;
                        if (state.openReasoning.has(id)) {
                            state.openReasoning.delete(id);
                            out.push({ type: 'reasoning-end', id });
                        }
                    }
                } else {
                    completeTool(item, out);
                }
                break;
            }
            case 'turn/completed': {
                state.turnStatus = p.turn?.status ?? 'completed';
                if (p.turn?.error?.message) state.errorMessage = p.turn.error.message;
                break;
            }
            case 'error': {
                if (p.willRetry) break;
                state.errorMessage = p.error?.message ?? state.errorMessage ?? 'Codex reported an error.';
                break;
            }
            default:
                break;
        }
        return out;
    }

    /** JSON-RPC result for a server → client request. */
    function answerRequest(method, params) {
        const p = params ?? {};
        switch (method) {
            case 'item/fileChange/requestApproval': {
                const changes = state.fileChanges.get(p.itemId) ?? [];
                const inside = !readOnly && !p.grantRoot && changes.length > 0 &&
                    allowedChanges(cwd, changes.map(changePaths));
                return { result: { decision: inside ? 'accept' : 'decline' } };
            }
            case 'item/commandExecution/requestApproval':
                return { result: { decision: 'decline' } };
            case 'applyPatchApproval': {
                const paths = record(p.fileChanges) ? Object.entries(p.fileChanges)
                    .map(([source, change]) => legacyChangePaths(source, change)) : [];
                const inside = !readOnly && !p.grantRoot && allowedChanges(cwd, paths);
                if (inside) for (const file of paths.flat()) state.touchedPaths.add(journalPath(cwd, file));
                return {
                    result: {
                        decision: inside ? 'approved' : { denied: { rejection: readOnly
                            ? 'Startup diagnosis is read-only. Ask for approval before editing.'
                            : 'Weblab only allows edits inside the project folder.' } },
                    },
                };
            }
            case 'execCommandApproval':
                return { result: { decision: { denied: { rejection: DECLINE_REASON } } } };
            default:
                return { error: { code: -32601, message: `Weblab does not support ${method}.` } };
        }
    }

    function finish({ aborted = false } = {}) {
        const out = [];
        for (const id of state.openText.keys()) out.push({ type: 'text-end', id });
        state.openText.clear();
        for (const id of state.openReasoning) out.push({ type: 'reasoning-end', id });
        state.openReasoning.clear();
        for (const [id, data] of state.tools) {
            if (data.status !== 'running') continue;
            const next = aborted
                ? { ...data, status: 'error', errorText: 'Stopped.' }
                : { ...data, status: 'done' };
            state.tools.set(id, next);
            out.push(toolChunk(id, next));
        }
        out.push({ type: 'finish-step' });
        return out;
    }

    return {
        handleNotification,
        answerRequest,
        finish,
        get sawOutput() { return state.sawOutput; },
        get turnStatus() { return state.turnStatus; },
        get errorMessage() { return state.errorMessage; },
        get touchedPaths() { return [...state.touchedPaths]; },
    };
}

module.exports = { createCodexMapper };
