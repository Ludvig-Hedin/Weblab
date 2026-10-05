#!/usr/bin/env node
// One start command.
//   bun dev            web stack: client (3000) + preload + sandbox server (8080)
//   bun dev desktop    the same, then the desktop app once the client is up
import { spawn } from 'node:child_process';

const withDesktop = process.argv.slice(2).includes('desktop');
const children = [];

const run = (cmd, args, env = {}) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    children.push(child);
    return child;
};

const stopAll = () => {
    for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const web = run('bun', ['--filter', '@weblab/web', 'dev']);
web.on('exit', (code) => {
    stopAll();
    process.exit(code ?? 0);
});

if (withDesktop) {
    const healthUrl = 'http://localhost:3000/api/health';
    const waitForClient = async () => {
        while (web.exitCode === null) {
            try {
                if ((await fetch(healthUrl)).ok) return true;
            } catch {}
            await new Promise((r) => setTimeout(r, 1000));
        }
        return false;
    };
    if (await waitForClient()) {
        // Compile the first routes so the window does not open blank.
        for (const path of ['/sign-in?native=1', '/w/warmup/projects']) {
            await fetch(`http://localhost:3000${path}`).catch(() => {});
        }
        const desktop = run('bun', ['--filter', '@weblab/desktop', 'start'], {
            NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        });
        // Closing the window stops the whole stack.
        desktop.on('exit', stopAll);
    }
}
