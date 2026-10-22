import { expect, mock, test } from 'bun:test';

test('a trusted CLI start waiting for folder validation cannot acquire work after Quit drains streams', async () => {
    let releaseDirectory;
    let enteredDirectory;
    const waiting = new Promise((resolve) => { releaseDirectory = resolve; });
    const entered = new Promise((resolve) => { enteredDirectory = resolve; });
    let directoryReads = 0;
    let sourceTurns = 0;
    mock.module('../weblab-local', () => ({
        requirePrivateWorkingRoot: async () => {
            directoryReads++;
            enteredDirectory();
            return waiting;
        },
        withCliTurn: async () => { sourceTurns++; },
    }));
    const { disposeStreams, registerStreamingHandlers } = await import('./main-bridge.js');
    const handlers = new Map();
    const frame = { url: 'http://localhost:3210/projects' };
    const contents = { mainFrame: frame, send() {} };
    registerStreamingHandlers({
        ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
        allowedOrigins: new Set(['http://localhost:3210']),
        getWebContents: () => contents,
    });
    const start = handlers.get('weblab-cli:start');
    const event = { sender: contents, senderFrame: frame };
    const request = { provider: 'gemini', streamId: 'pending-start', workingDirectory: '/private/customer-copy' };
    const pending = start(event, request);
    await entered;
    await disposeStreams();
    releaseDirectory('/private/customer-copy');
    expect(await pending).toEqual({ ok: false, error: 'shutting_down' });
    expect(sourceTurns).toBe(0);
    expect(await start(event, { ...request, streamId: 'later-start' })).toEqual({ ok: false, error: 'shutting_down' });
    expect(directoryReads).toBe(1);
    expect(await start({ ...event, senderFrame: { url: frame.url } }, request)).toEqual({ ok: false, error: 'origin_mismatch' });
});
