const { execFile } = require('child_process');
const { promisify } = require('util');
const capture = promisify(execFile);

/** Only identity/ancestry metadata, never command lines or environment values. */
async function readProcessTable() {
    if (process.platform === 'win32') {
        const script = 'Get-CimInstance Win32_Process | ForEach-Object { [PSCustomObject]@{ pid=$_.ProcessId; ppid=$_.ParentProcessId; start=$_.CreationDate.ToUniversalTime().ToString("o") } } | ConvertTo-Json -Compress';
        const { stdout } = await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
            { encoding: 'utf8', timeout: 3000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        const rows = JSON.parse(stdout.replace(/^\uFEFF/, ''));
        return validateRows(Array.isArray(rows) ? rows : [rows]);
    }
    const { stdout } = await capture('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,uid=,lstart='],
        { encoding: 'utf8', timeout: 3000, maxBuffer: 4 * 1024 * 1024 });
    return parsePosixProcessTable(stdout);
}

function parsePosixProcessTable(stdout) {
    const rows = stdout.trim().split('\n').filter(Boolean).map((line) => {
        // BSD ps prints some system UIDs as signed values, for example nobody (-2).
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(.+?)\s*$/);
        if (!match) throw new Error('Process identity is unavailable.');
        return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), uid: Number(match[4]), start: match[5] };
    });
    return validateRows(rows);
}

function validateRows(rows) {
    const result = new Map();
    for (const row of rows) {
        if (row?.pid === 0) continue;
        if (!row || !Number.isSafeInteger(row.pid) || row.pid <= 0 ||
            !Number.isSafeInteger(row.ppid) || row.ppid < 0 ||
            (row.uid !== undefined && !Number.isSafeInteger(row.uid)) ||
            typeof row.start !== 'string' || !row.start || result.has(row.pid)) {
            throw new Error('Process identity is unavailable.');
        }
        result.set(row.pid, row);
    }
    if (!result.size) throw new Error('Process identity is unavailable.');
    return result;
}

function sameProcess(left, right) {
    return Boolean(left && right && left.pid === right.pid && left.start === right.start);
}

module.exports = { readProcessTable, sameProcess, parsePosixProcessTable };
