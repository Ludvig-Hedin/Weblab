import path from 'path';

const SANDBOX_ROOT = '/project/sandbox';

export function normalizePath(p: string): string {
    const abs = path.isAbsolute(p) ? p : path.join(SANDBOX_ROOT, p);
    const relative = path.relative(SANDBOX_ROOT, abs);
    return relative.replace(/\\/g, '/'); // Always POSIX style
}
