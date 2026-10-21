'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOG_NAME = 'main.log';
const MAX_BYTES = 1024 * 1024;
const MAX_LINE = 2000;

/** Sign-in tickets and tokens can appear in URLs that renderer errors quote. */
function redact(text) {
    return text.replace(/\b(ticket|token|state|code|key|secret|password)=[^&\s"']+/gi, '$1=[redacted]');
}

function formatLine(level, values, now = new Date()) {
    const text = values.map((value) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack || value.message;
        try { return JSON.stringify(value); } catch { return String(value); }
    }).join(' ').replace(/\s*\n\s*/g, ' | ');
    return `${now.toISOString()} ${level} ${redact(text).slice(0, MAX_LINE)}\n`;
}

/**
 * Mirrors main-process console output to a small file so a packaged app leaves
 * a trace when something fails. One previous file is kept. Returns the log
 * path, or null when the folder cannot be used (logging then stays console-only).
 */
function installDesktopLog(directory, target = console) {
    const file = path.join(directory, LOG_NAME);
    let size = 0;
    try {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        try { size = fs.statSync(file).size; } catch { size = 0; }
    } catch {
        return null;
    }
    const write = (level, values) => {
        try {
            const line = formatLine(level, values);
            if (size + line.length > MAX_BYTES) {
                fs.renameSync(file, path.join(directory, 'main.old.log'));
                size = 0;
            }
            fs.appendFileSync(file, line, { mode: 0o600 });
            size += Buffer.byteLength(line);
        } catch {
            // Logging must never break the app.
        }
    };
    for (const [method, level] of [['log', 'info'], ['warn', 'warn'], ['error', 'error']]) {
        const original = target[method].bind(target);
        target[method] = (...values) => {
            original(...values);
            write(level, values);
        };
    }
    return file;
}

module.exports = { installDesktopLog, formatLine, redact };
