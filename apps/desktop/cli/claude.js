/**
 * Claude Code CLI adapter — JS mirror of `@weblab/ai-cli/src/claude.ts`.
 * Electron main is plain CommonJS today, so the runtime version lives here.
 *
 * Spawns `claude -p --output-format stream-json --verbose --model <model>`,
 * pipes the prompt to stdin, parses one JSON message per line from stdout,
 * and emits AI SDK v6 UIMessageStreamPart payloads for the text deltas.
 */

const { spawn } = require('child_process');
const { createInterface } = require('readline');

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
    const prompt = buildPrompt(messages);
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model];

    let child;
    try {
        child = spawn('claude', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: workingDirectory,
            shell: process.platform === 'win32',
        });
    } catch (cause) {
        emit({
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
        emit({
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
            if (textOpened) {
                emit({ streamId, kind: 'part', payload: { type: 'text-end', id: textBlockId } });
            }
            emit({ streamId, kind: 'part', payload: { type: 'finish-step' } });

            if (code === 0 && receivedAny) {
                emit({ streamId, kind: 'part', payload: { type: 'finish' } });
                emit({ streamId, kind: 'finish' });
            } else {
                const detail = stderrBuf.trim() || `claude exited with code ${code}`;
                emit({ streamId, kind: 'part', payload: { type: 'error', errorText: detail } });
                emit({ streamId, kind: 'error', payload: { message: detail, code: 'cli_error' } });
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
