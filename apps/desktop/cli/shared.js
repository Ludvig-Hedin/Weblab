/**
 * Pure helpers shared by the Claude Code and Codex adapters. No Electron, no
 * child processes — safe to unit test.
 */

const fs = require('fs');
const path = require('path');

/** Short context every CLI turn gets on top of the CLI's own system prompt. */
const WEBLAB_CONTEXT = [
    'You are running inside Weblab, a visual editor for websites.',
    'The current working directory is the website project the user is editing.',
    'Keep every file change inside this folder. Do not touch files outside it.',
    'Shell commands are not available; read and edit files directly.',
    'The Weblab preview reloads on its own after you save, so do not start dev servers.',
    'Reply to the user in short, plain language.',
].join(' ');

const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

const MAX_TEXT = 2000;

function truncate(value, max = MAX_TEXT) {
    if (typeof value !== 'string') return value;
    return value.length > max ? `${value.slice(0, max)}\n… (${value.length - max} more characters)` : value;
}

/** Display a path relative to the project so chat cards stay readable. */
function displayPath(cwd, filePath) {
    if (typeof filePath !== 'string' || !filePath) return filePath;
    if (!cwd || !path.isAbsolute(filePath)) return filePath;
    const rel = path.relative(cwd, filePath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return filePath;
    return rel.split(path.sep).join('/');
}

/** Folders an agent must never write into, even inside the project. */
const PROTECTED_DIRS = new Set(['.git', '.claude', '.codex', 'node_modules']);

/** Real path of `abs`, resolving the nearest existing ancestor (the file itself may not exist yet). */
function realpathNearest(abs) {
    let current = abs;
    const rest = [];
    for (;;) {
        try {
            return path.join(fs.realpathSync.native(current), ...rest.reverse());
        } catch {
            const parent = path.dirname(current);
            if (parent === current) return abs;
            rest.push(path.basename(current));
            current = parent;
        }
    }
}

function within(root, abs) {
    return abs === root || abs.startsWith(root + path.sep);
}

/**
 * True when an agent may write `candidate` (absolute or cwd-relative): it stays
 * inside `cwd` both lexically and after resolving symlinks on the nearest
 * existing parent, and it is not under .git, .claude, .codex or node_modules.
 */
function isAllowedEditPath(cwd, candidate) {
    if (typeof cwd !== 'string' || !cwd || typeof candidate !== 'string' || !candidate) return false;
    const root = path.resolve(cwd);
    const abs = path.resolve(root, candidate);
    if (!within(root, abs) || abs === root) return false;
    const rel = path.relative(root, abs);
    if (rel.split(path.sep).some((part) => PROTECTED_DIRS.has(part.toLowerCase()))) return false;
    const realRoot = realpathNearest(root);
    return within(realRoot, realpathNearest(abs)) && realpathNearest(abs) !== realRoot;
}

/** Project-relative POSIX path for journaling, or null when not an allowed edit path. */
function journalPath(cwd, candidate) {
    if (!isAllowedEditPath(cwd, candidate)) return null;
    return path.relative(path.resolve(cwd), path.resolve(cwd, candidate)).split(path.sep).join('/');
}

const PATH_KEYS = new Set(['file_path', 'path', 'notebook_path']);

/** Copy a tool input for display: relative paths, long strings shortened. */
function summarizeInput(cwd, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input ?? {};
    const out = {};
    for (const [key, value] of Object.entries(input)) {
        if (PATH_KEYS.has(key)) out[key] = displayPath(cwd, value);
        else if (typeof value === 'string') out[key] = truncate(value, 1000);
        else out[key] = value;
    }
    return out;
}

function flattenToolResult(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
            .filter(Boolean)
            .join('\n');
    }
    return '';
}

function textOf(message) {
    return typeof message?.content === 'string' ? message.content : '';
}

/**
 * Prompt for a turn without a resumable CLI session: replay the conversation
 * so the CLI has the context, then ask for the latest message.
 */
function buildTranscriptPrompt(messages) {
    const list = Array.isArray(messages) ? messages.filter((m) => textOf(m).trim()) : [];
    if (list.length === 0) return '';
    const last = list[list.length - 1];
    if (list.length === 1) return textOf(last);
    const history = list
        .slice(0, -1)
        .map((m) => `${m.role === 'assistant' ? 'ASSISTANT' : 'USER'}: ${textOf(m)}`)
        .join('\n\n');
    return `Conversation so far:\n\n${history}\n\nLatest message from the user:\n${textOf(last)}`;
}

/** The newest user message — all a resumed CLI session needs. */
function latestUserText(messages) {
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]?.role === 'user' && textOf(list[i]).trim()) return textOf(list[i]);
    }
    return '';
}

/** A `data-cli-tool` UI chunk. Re-sent with the same id to update the card. */
function toolChunk(id, data) {
    return { type: 'data-cli-tool', id, data };
}

function parseJsonLine(line) {
    const trimmed = typeof line === 'string' ? line.trim() : '';
    if (!trimmed || trimmed[0] !== '{') return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

module.exports = {
    WEBLAB_CONTEXT,
    SAFE_SESSION_ID,
    truncate,
    displayPath,
    PROTECTED_DIRS,
    isAllowedEditPath,
    journalPath,
    summarizeInput,
    flattenToolResult,
    buildTranscriptPrompt,
    latestUserText,
    toolChunk,
    parseJsonLine,
};
