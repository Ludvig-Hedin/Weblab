// Curated, priced model allow-list for the hosted editor AI routes (inline
// edit, tab complete). Mirrors /api/chat: an OpenRouter slug outside the
// curated line-up has no MODEL_PRICING entry, so it would cost $0 in our
// accounting (free, unbounded spend). Local `ollama/*` models are validated
// separately by each route.

import {
    AUTO_MODEL_ID,
    CHAT_MODEL_OPTIONS,
    DEFAULT_INLINE_EDIT_MODEL,
    DEFAULT_TAB_COMPLETE_MODEL,
} from '@weblab/models';

const HOSTED_EDITOR_MODELS = new Set<string>([
    ...CHAT_MODEL_OPTIONS.map((o) => o.model).filter((m) => m !== AUTO_MODEL_ID),
    DEFAULT_INLINE_EDIT_MODEL,
    DEFAULT_TAB_COMPLETE_MODEL,
]);

export function isAllowedHostedEditorModel(model: string): boolean {
    return HOSTED_EDITOR_MODELS.has(model);
}

export function unsupportedModelResponse(): Response {
    return new Response(JSON.stringify({ error: 'Unsupported model.', code: 400 }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
    });
}
