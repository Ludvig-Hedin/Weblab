/**
 * Maps `claude -p --output-format stream-json --verbose --include-partial-messages`
 * lines to AI SDK UI message chunks. Pure and stateful per turn.
 *
 *   stream_event text/thinking deltas → text-* / reasoning-* chunks (live)
 *   assistant tool_use                → data-cli-tool card (running)
 *   user tool_result                  → same card, done / error
 *   system init + result              → session id, final status
 *
 * Events from sub-agents (`parent_tool_use_id` set) are skipped so the chat
 * only shows what the top-level agent did.
 *
 * Tool activity is sent as `data-cli-tool` parts, not AI SDK tool parts: the
 * chat hook would otherwise try to execute them as Weblab tools, and a later
 * cloud-model turn would replay tool calls its provider has never seen.
 */

const { flattenToolResult, journalPath, summarizeInput, toolChunk, truncate } = require('./shared');

/** Claude tools that write files, and the input key holding the path. */
const EDIT_TOOLS = { Edit: 'file_path', MultiEdit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };

function createClaudeMapper({ cwd, provider = 'claude-code' } = {}) {
    const state = {
        sessionId: null,
        result: null,
        sawOutput: false,
        stepHasContent: false,
        currentMessageId: null,
        streamedMessageIds: new Set(),
        openBlocks: new Map(), // stream index → { kind, id }
        tools: new Map(), // tool_use id → { tool, input, status }
        editTargets: new Map(), // tool_use id → project-relative path
        touchedPaths: new Set(), // paths Claude successfully edited
        fallbackCounter: 0,
    };

    const blockId = (index) => `${state.currentMessageId ?? 'msg'}-${index}`;

    function closeBlock(index, out) {
        const block = state.openBlocks.get(index);
        if (!block) return;
        state.openBlocks.delete(index);
        out.push({ type: block.kind === 'text' ? 'text-end' : 'reasoning-end', id: block.id });
    }

    function handleStreamEvent(event, out) {
        switch (event?.type) {
            case 'message_start': {
                for (const index of [...state.openBlocks.keys()]) closeBlock(index, out);
                // A new model call after tool results is a new step.
                if (state.stepHasContent) {
                    out.push({ type: 'finish-step' }, { type: 'start-step' });
                    state.stepHasContent = false;
                }
                state.currentMessageId = event.message?.id ?? `msg-${++state.fallbackCounter}`;
                state.streamedMessageIds.add(state.currentMessageId);
                return;
            }
            case 'content_block_start': {
                const kind = event.content_block?.type;
                if (kind !== 'text' && kind !== 'thinking') return;
                const id = blockId(event.index);
                const uiKind = kind === 'text' ? 'text' : 'reasoning';
                state.openBlocks.set(event.index, { kind: uiKind, id });
                out.push({ type: uiKind === 'text' ? 'text-start' : 'reasoning-start', id });
                const initial = kind === 'text' ? event.content_block.text : event.content_block.thinking;
                if (initial) {
                    out.push({ type: uiKind === 'text' ? 'text-delta' : 'reasoning-delta', id, delta: initial });
                }
                return;
            }
            case 'content_block_delta': {
                const block = state.openBlocks.get(event.index);
                if (!block) return;
                const delta = event.delta ?? {};
                if (block.kind === 'text' && delta.type === 'text_delta' && delta.text) {
                    state.sawOutput = true;
                    state.stepHasContent = true;
                    out.push({ type: 'text-delta', id: block.id, delta: delta.text });
                } else if (block.kind === 'reasoning' && delta.type === 'thinking_delta' && delta.thinking) {
                    out.push({ type: 'reasoning-delta', id: block.id, delta: delta.thinking });
                }
                return;
            }
            case 'content_block_stop':
                closeBlock(event.index, out);
                return;
            default:
                return;
        }
    }

    function handleAssistant(message, out) {
        const content = Array.isArray(message?.content) ? message.content : [];
        const streamed = message?.id && state.streamedMessageIds.has(message.id);
        for (const block of content) {
            if (block?.type === 'tool_use' && block.id) {
                const data = {
                    provider,
                    tool: String(block.name ?? 'tool'),
                    input: summarizeInput(cwd, block.input),
                    status: 'running',
                };
                state.tools.set(block.id, data);
                const key = EDIT_TOOLS[block.name];
                const rel = key ? journalPath(cwd, block.input?.[key]) : null;
                if (rel) state.editTargets.set(block.id, rel);
                state.sawOutput = true;
                state.stepHasContent = true;
                out.push(toolChunk(block.id, data));
            } else if (block?.type === 'text' && !streamed && block.text) {
                // Partial messages were not streamed (older CLI): emit whole text.
                const id = `text-${++state.fallbackCounter}`;
                state.sawOutput = true;
                state.stepHasContent = true;
                out.push(
                    { type: 'text-start', id },
                    { type: 'text-delta', id, delta: block.text },
                    { type: 'text-end', id },
                );
            }
        }
    }

    function handleUser(message, out) {
        const content = Array.isArray(message?.content) ? message.content : [];
        for (const block of content) {
            if (block?.type !== 'tool_result' || !block.tool_use_id) continue;
            const known = state.tools.get(block.tool_use_id);
            if (!known) continue;
            const text = truncate(flattenToolResult(block.content));
            const data = block.is_error
                ? { ...known, status: 'error', errorText: text || 'The tool failed.' }
                : { ...known, status: 'done', output: text };
            state.tools.set(block.tool_use_id, data);
            const target = state.editTargets.get(block.tool_use_id);
            if (target && !block.is_error) state.touchedPaths.add(target);
            out.push(toolChunk(block.tool_use_id, data));
        }
    }

    /** Map one parsed stream-json object to zero or more UI chunks. */
    function handle(obj) {
        const out = [];
        if (!obj || typeof obj !== 'object') return out;
        if (obj.session_id && !state.sessionId) state.sessionId = obj.session_id;
        if (obj.parent_tool_use_id) return out;
        switch (obj.type) {
            case 'stream_event':
                handleStreamEvent(obj.event, out);
                break;
            case 'assistant':
                handleAssistant(obj.message, out);
                break;
            case 'user':
                handleUser(obj.message, out);
                break;
            case 'result':
                state.sessionId = obj.session_id ?? state.sessionId;
                state.result = {
                    isError: obj.is_error === true || (obj.subtype && obj.subtype !== 'success'),
                    subtype: obj.subtype ?? null,
                    text: typeof obj.result === 'string' ? obj.result : '',
                };
                break;
            default:
                break;
        }
        return out;
    }

    /** Close anything still open. Running tools end as stopped when aborted. */
    function finish({ aborted = false } = {}) {
        const out = [];
        for (const index of [...state.openBlocks.keys()]) closeBlock(index, out);
        for (const [id, data] of state.tools) {
            if (data.status !== 'running') continue;
            // An interrupted edit may already have written the file.
            const target = state.editTargets.get(id);
            if (target) state.touchedPaths.add(target);
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
        handle,
        finish,
        get sessionId() { return state.sessionId; },
        get result() { return state.result; },
        get sawOutput() { return state.sawOutput; },
        /** Project-relative paths Claude reported editing (for the handoff journal). */
        get touchedPaths() { return [...state.touchedPaths]; },
    };
}

module.exports = { createClaudeMapper };
