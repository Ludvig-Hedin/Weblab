import { generateText } from 'ai';

import type { ChatModel, OPENROUTER_MODELS } from '@weblab/models';
import { getProviderFromModel, LLMProvider, OPENROUTER_MODELS as MODELS } from '@weblab/models';

import { initModel } from '../chat/providers';
import { escapeXml } from './xml-escape';

/**
 * Default model for natural-language → shell-command translation. A small,
 * fast chat model is plenty for "turn one sentence into one command" and keeps
 * latency/cost low. Deliberately NOT an Anthropic model — we use `generateText`
 * (plain string out) so any provider works, but the cheap OpenAI mini gives the
 * best perf-per-dollar for this micro-task.
 */
const DEFAULT_TERMINAL_COMMAND_MODEL: OPENROUTER_MODELS = MODELS.OPEN_AI_GPT_5_4_MINI;

const SYSTEM_PROMPT = `You translate a user's natural-language request into a SINGLE shell command to run in a Linux (bash) project sandbox.

Rules:
- Output ONLY the command. No explanations, no markdown, no code fences, no leading "$".
- Produce exactly one command line. Chain with && or | only when genuinely required.
- Prefer safe, non-interactive flags (e.g. add --yes / -y where it avoids a prompt).
- Use the project's package manager when obvious from context (bun, npm, pnpm, yarn). Default to bun if unknown.
- Never invent file paths or package names that aren't implied by the request or context.
- If the request is destructive (rm -rf, git reset --hard, dropping data), still output the literal command the user asked for — the UI shows it for confirmation before running.
- If the request cannot be expressed as a shell command, output: echo "Could not translate that into a command"`;

const USER_TEMPLATE = (params: { instruction: string; context?: string }) =>
    `${params.context ? `<context>\n${escapeXml(params.context)}\n</context>\n\n` : ''}<request>${escapeXml(params.instruction)}</request>\n\nReturn the single shell command.`;

export interface TerminalCommandArgs {
    /** The user's natural-language instruction, e.g. "install three.js". */
    instruction: string;
    /** Optional context: cwd, framework, recent terminal output, etc. */
    context?: string;
    model?: ChatModel;
    userId: string;
    projectId: string;
    abortSignal?: AbortSignal;
}

/**
 * Strip anything that would break a paste-into-terminal: markdown fences, a
 * leading prompt sigil, surrounding backticks/quotes, and trailing newlines.
 * Models occasionally wrap output despite the system prompt, so we normalize
 * defensively rather than trusting the raw text.
 */
export function sanitizeCommand(raw: string): string {
    let cmd = raw.trim();

    // Drop ```lang ... ``` fences if the whole thing is fenced.
    const fenceMatch = /^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/.exec(cmd);
    if (fenceMatch?.[1] !== undefined) {
        cmd = fenceMatch[1].trim();
    }

    // Collapse to the first non-empty line — we only ever run one command.
    const firstLine = cmd
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    cmd = firstLine ?? '';

    // Strip a leading shell prompt sigil ("$ ", "# ").
    cmd = cmd.replace(/^[$#]\s+/, '');

    // Strip wrapping backticks the model sometimes adds around the line.
    if (cmd.startsWith('`') && cmd.endsWith('`') && cmd.length > 1) {
        cmd = cmd.slice(1, -1).trim();
    }

    return cmd;
}

/**
 * Convert a natural-language instruction into a single shell command string.
 * Returns the sanitized command (never throws for "can't translate" — the
 * model emits an `echo` fallback per the system prompt).
 */
export const generateTerminalCommand = async ({
    instruction,
    context,
    model,
    userId,
    projectId,
    abortSignal,
}: TerminalCommandArgs): Promise<string> => {
    const selectedModel: ChatModel = model ?? DEFAULT_TERMINAL_COMMAND_MODEL;
    const provider = getProviderFromModel(selectedModel);

    // Only OpenRouter is supported on hosted web for this micro-agent. Ollama
    // would need a sanitized base URL plumbed through; not worth it for a
    // one-line translation. Fall back to the default OpenRouter model.
    const modelConfig =
        provider === LLMProvider.OPENROUTER
            ? initModel({
                  provider: LLMProvider.OPENROUTER,
                  model: selectedModel as OPENROUTER_MODELS,
              })
            : initModel({
                  provider: LLMProvider.OPENROUTER,
                  model: DEFAULT_TERMINAL_COMMAND_MODEL,
              });

    const { text } = await generateText({
        model: modelConfig.model,
        providerOptions: modelConfig.providerOptions,
        system: SYSTEM_PROMPT,
        prompt: USER_TEMPLATE({ instruction, context }),
        // One command is short — cap hard to keep it snappy and cheap.
        maxOutputTokens: 256,
        temperature: 0,
        abortSignal,
        experimental_telemetry: {
            isEnabled: true,
            metadata: {
                userId,
                projectId,
                tags: ['terminal-command'],
            },
        },
    });

    return sanitizeCommand(text);
};
