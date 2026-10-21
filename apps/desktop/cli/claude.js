/**
 * Claude Code CLI adapter.
 *
 * Launch arguments retained for a future independently verified confinement:
 *
 *   claude -p --output-format stream-json --verbose --include-partial-messages
 *          --restricted --safe-mode --setting-sources '' --strict-mcp-config
 *          --disallowedTools Bash Edit(.git/**) Write(.claude/**) …
 *          --append-system-prompt <Weblab context> [--model M] [--resume ID]
 *
 * Restricted mode requires v2.1.248+. User/project settings are not loaded.
 * Managed hooks can still run despite safe mode and disableAllHooks, so this
 * adapter stays unavailable until OS confinement or complete managed-policy
 * absence is independently verified. No renderer preference can bypass it.
 *
 * No version probe, auth probe, or paid turn launches from this adapter.
 * The picker receives the same unavailable reason through isolationStatus.
 */

const {
    PROTECTED_DIRS,
    WEBLAB_CONTEXT,
} = require('./shared');

// Reject leading `-` so a model id can't become a flag.
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;
const CLAUDE_POLICY_BLOCKED_REASON = 'Claude Code needs verified operating-system isolation before it can safely edit this copy. Use Codex for now.';

function claudeIsolationStatus(version) {
    const match = typeof version === 'string' && version.match(/^(\d+)\.(\d+)\.(\d+)(?:\s|$)/);
    const supported = match && (Number(match[1]) > 2 || (Number(match[1]) === 2 &&
        (Number(match[2]) > 1 || (Number(match[2]) === 1 && Number(match[3]) >= 248))));
    return { available: false, reason: supported ? CLAUDE_POLICY_BLOCKED_REASON :
        'Claude Code needs version 2.1.248 or later and verified operating-system isolation. Use Codex for now.' };
}

/** Weblab lists `claude-sonnet-4.6`; the CLI expects `claude-sonnet-4-6`. */
function normalizeModel(model) {
    if (typeof model !== 'string' || !model) return null;
    return model.startsWith('claude-') ? model.replace(/\./g, '-') : model;
}

function buildArgs({ model, resumeSessionId, readOnly = false }) {
    const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--permission-mode', readOnly ? 'plan' : 'acceptEdits',
        '--restricted',
        '--safe-mode',
        '--tools', readOnly ? 'Read,Glob,Grep' : 'Read,Glob,Grep,Edit,Write',
        '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', '',
        '--settings', '{"disableAllHooks":true}',
        '--disallowedTools', 'Bash', 'Agent', 'Task', 'mcp__*',
        ...(readOnly ? ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] : []),
        ...PROTECTED_DIRS_DENY_RULES,
        '--append-system-prompt', WEBLAB_CONTEXT,
    ];
    if (model) args.push('--model', model);
    if (resumeSessionId) args.push('--resume', resumeSessionId);
    return args;
}

const PROTECTED_DIRS_DENY_RULES = [...PROTECTED_DIRS].flatMap((dir) =>
    ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].map((tool) => `${tool}(${dir}/**)`),
);

async function startStream({ request, emit }) {
    const { streamId } = request;
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

    const model = normalizeModel(request.model);
    if (model && !SAFE_MODEL_ID.test(model)) return fail('invalid_model', `Invalid model id: ${model}`);

    // Safe mode cannot disable managed hooks, including remotely delivered
    // policy. Local file absence is insufficient proof. Do not probe/spawn a
    // CLI until an authoritative confinement implementation exists.
    return fail('claude_isolation_unverified', CLAUDE_POLICY_BLOCKED_REASON);
}

module.exports = {
    kind: 'claude-code',
    startStream,
    // exported for tests
    buildArgs,
    normalizeModel,
    claudeIsolationStatus,
    CLAUDE_POLICY_BLOCKED_REASON,
};
