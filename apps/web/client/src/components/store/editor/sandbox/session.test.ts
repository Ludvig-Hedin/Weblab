import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { NodeFsProvider } from '@weblab/code-provider';
import type { Branch } from '@weblab/models';

import type { ErrorManager } from '../error';
import { SessionManager } from './session';
import { CLISessionImpl } from './terminal';

const taskInit = spyOn(CLISessionImpl.prototype, 'initTask').mockImplementation(async () => {});
const terminalInit = spyOn(CLISessionImpl.prototype, 'initTerminal').mockImplementation(async () => {});

afterEach(() => {
    taskInit.mockClear();
    terminalInit.mockClear();
    delete (globalThis as unknown as { weblabNative?: unknown }).weblabNative;
});

describe('SessionManager local startup', () => {
    test('attaches a provider for each local branch without starting its dev task', async () => {
        const sessions = ['branch-one', 'branch-two'].map((id) => {
            const branch = {
                id,
                runtime: { type: 'local', local: { rootPath: `/projects/${id}` } },
            } as Branch;
            return new SessionManager(branch, {} as ErrorManager);
        });

        for (const session of sessions) {
            await session.start('');
            expect(session.provider).toBeInstanceOf(NodeFsProvider);
            expect(session.terminalSessions.size).toBe(2);
            expect(await session.readDevServerLogs()).toBe('Local preview has not been started');
        }
        expect(taskInit).not.toHaveBeenCalled();
        expect(terminalInit).toHaveBeenCalledTimes(2);

        for (const session of sessions) await session.clear();
    });

    test('starts local preview only from the explicit restart action', async () => {
        let starts = 0;
        (globalThis as unknown as { weblabNative?: unknown }).weblabNative = {
            localfs: {},
            localdev: {
                stop: async () => ({ success: true }),
                start: async () => {
                    starts += 1;
                    return { url: 'http://localhost:31847' };
                },
            },
        };
        const branch = {
            id: 'local',
            runtime: { type: 'local', local: { rootPath: '/projects/local' } },
        } as Branch;
        const session = new SessionManager(branch, {} as ErrorManager);

        await session.start('');
        expect(starts).toBe(0);
        expect(await session.ping()).toBe(true);
        expect(await session.restartDevServer()).toBe(true);
        expect(starts).toBe(1);
        expect(taskInit).toHaveBeenCalledTimes(1);
        await session.clear();
    });
});
