/**
 * Stub adapters — fail-fast so the renderer surfaces a clear error rather
 * than hanging. Each will be replaced by a real adapter in the next phase
 * of the CLI rollout (see plan §3 — port from reference/t3code).
 */

function makeStub(kind) {
    return {
        kind,
        async startStream({ request, emit }) {
            emit({
                streamId: request.streamId,
                kind: 'error',
                payload: {
                    message: `${kind} adapter is not implemented yet`,
                    code: 'not_implemented',
                },
            });
        },
    };
}

module.exports = {
    codex: makeStub('codex'),
    gemini: makeStub('gemini'),
    opencode: makeStub('opencode'),
    cursor: makeStub('cursor'),
    ollama: makeStub('ollama'),
};
