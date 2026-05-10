/**
 * Claude Code CLI adapter — JS mirror of `@weblab/ai-cli/src/claude.ts`.
 * Electron main is plain CommonJS today, so the runtime version lives here.
 *
 * Spawns `claude` directly without a shell to avoid argument injection on
 * Windows. The prompt is piped via stdin (no shell-escape concerns); model
 * is validated against a strict character set before being placed in argv.
 */

const { spawn } = require('child_process');
const { createInterface } = require('readline');
const { existsSync } = require('fs');
const { delimiter, join } = require('path');

// Allow only safe characters in CLI model identifiers. Reject leading `-` to
// prevent flag injection (`--help`, `-y`, etc.).
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;

/**
 * Resolve an executable on PATH ourselves so we can spawn directly without a
 * shell — Windows otherwise needs `shell: true` to find `.cmd`/`.bat`, but
 * shell mode interpolates user data through cmd.exe and re-introduces an
 * injection vector. With an absolute path we use `CreateProcessW` directly.
 */
function resolveOnPath(name) {
    const PATH = process.env.PATH || '';
    const dirs = PATH.split(delimiter);
    const exts = process.platform === 'win32'
        ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
        : [''];
    for (const dir of dirs) {
        if (!dir) continue;
        for (const ext of exts) {
            const candidate = join(dir, `${name}${ext}`);
            try {
                if (existsSync(candidate)) return candidate;
            } catch {
                // ignore EACCES on individual entries
            }
        }
    }
    return null;
}

function buildPrompt(messages) {
    if (!messages || messages.length === 0) return '';
    return messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');
}

function parseLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

async function startStream({ request, emit, signal }) {
    const { streamId, model, messages, workingDirectory } = request;

    // Single-fire terminal guard. Adapters can emit duplicate terminal events
    // (spawn 'error' followed by readline 'close' → finalize); the renderer's
    // ReadableStream throws if `controller.error()`/`close()` runs twice.
    let terminalEmitted = false;
    const emitTerminal = (event) => {
        if (terminalEmitted) return;
        terminalEmitted = true;
        emit(event);
    };

    if (model && !SAFE_MODEL_ID.test(model)) {
        emitTerminal({
            streamId,
            kind: 'error',
            payload: { message: `Invalid model id: ${model}`, code: 'invalid_model' },
        });
        return;
    }

    const claudeBinary = resolveOnPath('claude');
    if (!claudeBinary) {
        emitTerminal({
            streamId,
            kind: 'error',
            payload: { message: 'claude CLI not found on PATH', code: 'not_installed' },
        });
        return;
    }

    const prompt = buildPrompt(messages);
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (model) args.push('--model', model);

    let child;
    try {
        child = spawn(claudeBinary, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: workingDirectory,
            // shell:false (default) — never interpret model/prompt through cmd.exe.
            shell: false,
        });
    } catch (cause) {
        emitTerminal({
            streamId,
            kind: 'error',
            payload: { message: `Failed to spawn claude: ${cause.message}`, code: 'spawn_failed' },
        });
        return;
    }

    const onAbort = () => {
        try {
            child.kill('SIGTERM');
        } catch {
            // ignore
        }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    child.on('error', (err) => {
        emitTerminal({
            streamId,
            kind: 'error',
            payload: { message: `Failed to spawn claude: ${err.message}`, code: 'spawn_failed' },
        });
    });

    const messageId = `claude-${streamId}`;
    const textBlockId = `${messageId}-text`;
    let textOpened = false;
    let receivedAny = false;

    emit({ streamId, kind: 'part', payload: { type: 'start', messageId } });
    emit({ streamId, kind: 'part', payload: { type: 'start-step' } });

    if (child.stdin) {
        child.stdin.write(prompt);
        child.stdin.end();
    }

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
        const parsed = parseLine(line);
        if (!parsed) return;
        if (parsed.type === 'assistant') {
            const content = (parsed.message && parsed.message.content) || [];
            for (const block of content) {
                if (block.type === 'text' && typeof block.text === 'string') {
                    if (!textOpened) {
                        textOpened = true;
                        emit({
                            streamId,
                            kind: 'part',
                            payload: { type: 'text-start', id: textBlockId },
                        });
                    }
                    receivedAny = true;
                    emit({
                        streamId,
                        kind: 'part',
                        payload: { type: 'text-delta', id: textBlockId, delta: block.text },
                    });
                }
            }
        }
    });

    let stderrBuf = '';
    if (child.stderr) {
        child.stderr.on('data', (b) => {
            stderrBuf += b.toString();
        });
    }

    await new Promise((resolve) => {
        let savedExitCode = null;
        let childExited = false;

        child.on('exit', (code) => {
            savedExitCode = code;
            childExited = true;
        });

        const finalize = (code) => {
            // Skip finalize if a terminal event was already emitted (e.g.
            // from `child.on('error')`); otherwise we'd double-emit.
            if (terminalEmitted) {
                signal.removeEventListener('abort', onAbort);
                resolve();
                return;
            }
            if (textOpened) {
                emit({ streamId, kind: 'part', payload: { type: 'text-end', id: textBlockId } });
            }
            emit({ streamId, kind: 'part', payload: { type: 'finish-step' } });

            if (code === 0 && receivedAny) {
                emit({ streamId, kind: 'part', payload: { type: 'finish' } });
                emitTerminal({ streamId, kind: 'finish' });
            } else {
                const detail = stderrBuf.trim() || `claude exited with code ${code}`;
                emit({ streamId, kind: 'part', payload: { type: 'error', errorText: detail } });
                emitTerminal({
                    streamId,
                    kind: 'error',
                    payload: { message: detail, code: 'cli_error' },
                });
            }
            signal.removeEventListener('abort', onAbort);
            resolve();
        };

        rl.on('close', () => {
            if (childExited) {
                finalize(savedExitCode);
            } else {
                child.once('exit', (code) => finalize(code));
            }
        });
    });
}

module.exports = {
    kind: 'claude-code',
    startStream,
};
