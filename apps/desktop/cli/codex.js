/**
 * Codex CLI adapter over `codex app-server` (JSON-RPC, one JSON object per
 * line on stdio). Plain-JS port of the flow in t3code's
 * codexAppServerManager: initialize → thread/start|resume → turn/start, then
 * stream notifications until turn/completed.
 *
 * Safety: the thread runs with sandbox `read-only` and approval policy
 * `untrusted`. Codex may run known read-only commands in that sandbox; any
 * command needing approval is declined, and file changes are accepted only
 * when every path stays inside the project (see codex-events.js).
 *
 * One app-server process per turn; the thread id is reported back so the
 * next turn can `thread/resume` instead of replaying the transcript.
 */

const { createInterface } = require('readline');

const { createCodexMapper } = require('./codex-events');
const { cliEnv, killTree, resolveOnPath, runCapture, spawnCli } = require('./process');
const {
    SAFE_SESSION_ID,
    WEBLAB_CONTEXT,
    buildTranscriptPrompt,
    latestUserText,
    parseJsonLine,
} = require('./shared');
const { describeCliFailure } = require('./status');

const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;
/** Manifest sentinel: let Codex use the model from the user's own config. */
const DEFAULT_MODEL_SENTINEL = 'codex-default';
const REQUEST_TIMEOUT_MS = 60_000;

function normalizeModel(model) {
    if (typeof model !== 'string' || !model || model === DEFAULT_MODEL_SENTINEL) return null;
    return model;
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = new Error('Codex was stopped.');
        error.name = 'AbortError';
        throw error;
    }
}

function readMcpServers(result) {
    if (result.code !== 0 || result.timedOut || result.aborted || result.truncated || result.error) {
        throw new Error('Codex MCP isolation could not be verified.');
    }
    let servers;
    try { servers = JSON.parse(result.stdout); }
    catch { throw new Error('Codex MCP isolation returned invalid data.'); }
    if (!Array.isArray(servers) || servers.length > 256) throw new Error('Invalid Codex MCP server list.');
    const names = new Set();
    for (const server of servers) {
        if (!server || typeof server.name !== 'string' || !server.name ||
            server.name.length > 128 || /[\x00-\x1f\x7f]/.test(server.name) ||
            typeof server.enabled !== 'boolean' || names.has(server.name)) {
            throw new Error('Invalid Codex MCP server entry.');
        }
        names.add(server.name);
    }
    return servers;
}

/** Both probes must prove all MCP servers are disabled before a turn starts. */
async function mcpDisableArgs(binary, env, cwd, signal, capture = runCapture) {
    throwIfAborted(signal);
    const servers = readMcpServers(await capture(binary, ['mcp', 'list', '--json'],
        { env, cwd, signal, timeoutMs: 8000 }));
    throwIfAborted(signal);
    const enabled = servers.filter((server) => server.enabled);
    const args = enabled.flatMap(({ name }) => {
        const key = /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
        return ['-c', `mcp_servers.${key}.enabled=false`];
    });
    if (!enabled.length) return args;
    const checked = readMcpServers(await capture(binary, [...args, 'mcp', 'list', '--json'],
        { env, cwd, signal, timeoutMs: 8000 }));
    throwIfAborted(signal);
    if (checked.some((server) => server.enabled) ||
        enabled.some(({ name }) => !checked.some((server) => server.name === name && !server.enabled))) {
        throw new Error('Codex MCP servers remain enabled. Weblab did not start the turn.');
    }
    return args;
}

function threadParams({ cwd, model }) {
    return {
        cwd,
        model: model ?? null,
        approvalPolicy: 'untrusted',
        sandbox: 'read-only',
        developerInstructions: WEBLAB_CONTEXT,
    };
}

function createRpc(child, { onNotification, onRequest }) {
    let nextId = 1;
    const pending = new Map();
    const write = (message) => {
        if (!child.stdin.writable) throw new Error('Codex app-server is not accepting input.');
        child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
        const msg = parseJsonLine(line);
        if (!msg) return;
        if (msg.id !== undefined && msg.method) {
            // Server → client request (approvals etc.).
            const answer = onRequest(msg.method, msg.params);
            try { write({ id: msg.id, ...answer }); } catch { /* process gone */ }
            return;
        }
        if (msg.id !== undefined) {
            const entry = pending.get(String(msg.id));
            if (!entry) return;
            pending.delete(String(msg.id));
            clearTimeout(entry.timer);
            if (msg.error) entry.reject(new Error(`${entry.method} failed: ${msg.error.message ?? 'unknown error'}`));
            else entry.resolve(msg.result);
            return;
        }
        if (msg.method) onNotification(msg.method, msg.params);
    });

    return {
        rl,
        request(method, params) {
            return new Promise((resolve, reject) => {
                const id = nextId++;
                const timer = setTimeout(() => {
                    pending.delete(String(id));
                    reject(new Error(`${method} timed out.`));
                }, REQUEST_TIMEOUT_MS);
                pending.set(String(id), { method, resolve, reject, timer });
                try {
                    write({ id, method, params });
                } catch (error) {
                    clearTimeout(timer);
                    pending.delete(String(id));
                    reject(error);
                }
            });
        },
        notify(method, params) {
            write(params === undefined ? { method } : { method, params });
        },
        rejectAll(reason) {
            for (const [key, entry] of pending) {
                clearTimeout(entry.timer);
                entry.reject(new Error(reason));
                pending.delete(key);
            }
        },
    };
}

async function startStream({ request, emit, signal }) {
    const { streamId, messages, workingDirectory: cwd } = request;
    let terminalEmitted = false;
    const emitTerminal = (event) => {
        if (terminalEmitted) return;
        terminalEmitted = true;
        emit(event);
    };
    const emitPart = (payload) => emit({ streamId, kind: 'part', payload });
    const fail = (code, message) => {
        emitPart({ type: 'error', errorText: message });
        emitTerminal({ streamId, kind: 'error', payload: { message, code } });
    };

    if (signal?.aborted) {
        emitTerminal({ streamId, kind: 'finish' });
        return { touchedPaths: [] };
    }
    const model = normalizeModel(request.model);
    if (model && !SAFE_MODEL_ID.test(model)) return fail('invalid_model', `Invalid model id: ${model}`);

    const env = cliEnv();
    const binary = resolveOnPath('codex', env);
    if (!binary) return fail('not_installed', 'Codex is not installed. Install it, then try again.');

    const resumeThreadId = typeof request.resumeSessionId === 'string' &&
        SAFE_SESSION_ID.test(request.resumeSessionId) ? request.resumeSessionId : null;

    let mcpArgs;
    try {
        mcpArgs = await mcpDisableArgs(binary, env, cwd, signal);
        throwIfAborted(signal);
    } catch (cause) {
        if (cause.code === 'cleanup_unconfirmed') throw cause;
        if (signal?.aborted) {
            emitTerminal({ streamId, kind: 'finish' });
            return { touchedPaths: [] };
        }
        return fail('mcp_isolation_failed', 'Codex safety settings could not be verified. The turn was not started.');
    }
    let child;
    try {
        child = spawnCli(binary, ['app-server', ...mcpArgs], { cwd, env });
    } catch (cause) {
        return fail('spawn_failed', `Could not start Codex: ${cause.message}`);
    }

    const mapper = createCodexMapper({ cwd, readOnly: request.readOnly === true });
    let stderr = '';
    child.stderr.on('data', (b) => {
        if (stderr.length < 64 * 1024) stderr += b.toString();
    });
    child.stdin.on('error', () => { /* process exited */ });

    let resolveTurn;
    const turnDone = new Promise((resolve) => { resolveTurn = resolve; });

    const rpc = createRpc(child, {
        onNotification: (method, params) => {
            for (const chunk of mapper.handleNotification(method, params)) emitPart(chunk);
            if (method === 'turn/completed') resolveTurn('completed');
        },
        onRequest: (method, params) => mapper.answerRequest(method, params),
    });

    let spawnError = null;
    child.on('error', (err) => {
        spawnError = err.message;
        rpc.rejectAll(`Codex failed to start: ${err.message}`);
        resolveTurn('exited');
    });
    child.on('exit', () => {
        rpc.rejectAll('Codex app-server exited.');
        resolveTurn('exited');
    });

    let aborted = false;
    let stopping = null;
    const stop = () => {
        if (!stopping) {
            stopping = killTree(child);
            stopping.catch(() => {}); // Awaited in finally; never release on failure.
        }
        return stopping;
    };
    const onAbort = () => {
        aborted = true;
        rpc.rejectAll('Codex was stopped.');
        void stop();
        resolveTurn('aborted');
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();

    const messageId = `codex-${streamId}`;
    emitPart({ type: 'start', messageId });
    emitPart({ type: 'start-step' });

    let setupError = null;
    try {
        throwIfAborted(signal);
        await rpc.request('initialize', {
            clientInfo: { name: 'weblab_desktop', title: 'Weblab Desktop', version: '1.0.0' },
            capabilities: { experimentalApi: true },
        });
        throwIfAborted(signal);
        rpc.notify('initialized');

        let threadId = null;
        let resumed = false;
        if (resumeThreadId) {
            try {
                const res = await rpc.request('thread/resume', {
                    ...threadParams({ cwd, model }),
                    threadId: resumeThreadId,
                });
                threadId = res?.thread?.id ?? resumeThreadId;
                resumed = true;
            } catch {
                throwIfAborted(signal);
                // Thread gone or unreadable — start fresh with the transcript.
            }
        }
        throwIfAborted(signal);
        if (!threadId) {
            const res = await rpc.request('thread/start', threadParams({ cwd, model }));
            threadId = res?.thread?.id ?? res?.threadId ?? null;
            if (!threadId) throw new Error('Codex did not return a thread id.');
        }
        throwIfAborted(signal);
        emit({ streamId, kind: 'session', payload: { provider: 'codex', sessionId: threadId } });

        const text = resumed ? latestUserText(messages) : buildTranscriptPrompt(messages);
        if (!text.trim()) throw new Error('There is no message to send.');
        const turnParams = { threadId, input: [{ type: 'text', text, text_elements: [] }] };
        if (model) turnParams.model = model;
        throwIfAborted(signal);
        await rpc.request('turn/start', turnParams);
        throwIfAborted(signal);
        await turnDone;
    } catch (error) {
        if (!aborted) setupError = error instanceof Error ? error.message : String(error);
    } finally {
        signal.removeEventListener('abort', onAbort);
        rpc.rejectAll('Codex turn ended.');
        try { await stop(); }
        finally { rpc.rl.close(); }
    }

    for (const chunk of mapper.finish({ aborted })) emitPart(chunk);
    const result = { touchedPaths: mapper.touchedPaths };

    if (aborted || mapper.turnStatus === 'interrupted') {
        emitPart({ type: 'finish' });
        emitTerminal({ streamId, kind: 'finish' });
        return result;
    }
    if (spawnError) {
        fail('spawn_failed', `Could not start Codex: ${spawnError}`);
        return result;
    }
    if (mapper.turnStatus === 'completed' && !mapper.errorMessage) {
        emitPart({ type: 'finish' });
        emitTerminal({ streamId, kind: 'finish' });
        return result;
    }
    const detail = mapper.errorMessage || setupError || stderr.trim() || 'Codex stopped before finishing.';
    const { code, message } = describeCliFailure('codex', detail);
    fail(code, message);
    return result;
}

module.exports = {
    kind: 'codex',
    startStream,
    // exported for tests
    normalizeModel,
    threadParams,
    mcpDisableArgs,
};
