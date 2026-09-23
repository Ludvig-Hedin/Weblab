import { describe, expect, it } from 'bun:test';

import { NodeFsProvider } from '@weblab/code-provider';

import type { SandboxManager } from '../sandbox';
import { GitManager } from './git';

function makeLocalSandbox(isRepositoryRoot: boolean) {
    let probes = 0;
    const provider = new NodeFsProvider({ rootPath: '/existing-project' });
    provider.gitInfo = async () => {
        probes += 1;
        return { isRepositoryRoot, branch: isRepositoryRoot ? 'main' : undefined };
    };
    const sandbox = {
        session: {
            provider,
            runCommand: async () => {
                throw new Error('Local Git must not use a generic command');
            },
        },
        fileExists: async () => {
            throw new Error('Local Git must not probe IndexedDB ZenFS');
        },
    } as unknown as SandboxManager;

    return { sandbox, provider, getProbes: () => probes };
}

describe('GitManager local project startup', () => {
    it('uses the native root probe and leaves history to the Git client', async () => {
        const { sandbox, getProbes } = makeLocalSandbox(true);
        const manager = new GitManager(sandbox);

        await manager.init();

        expect(manager.commits).toEqual([]);
        expect(getProbes()).toBe(1);
        expect(await manager.isRepoInitialized()).toBe(true);
    });

    it('does not treat an enclosing parent repository as the selected folder repo', async () => {
        const { sandbox } = makeLocalSandbox(false);
        const manager = new GitManager(sandbox);

        await manager.init();

        expect(manager.commits).toEqual([]);
        expect(await manager.isRepoInitialized()).toBe(false);
        expect(await manager.getStatus()).toEqual({ files: [] });
        expect(await manager.initRepo()).toBe(false);
    });

    it('returns changed file paths from the native status method', async () => {
        const { sandbox, provider } = makeLocalSandbox(true);
        provider.gitStatus = async () => ({ changedFiles: ['src/page.tsx', 'assets/logo.svg'] });
        const manager = new GitManager(sandbox);

        expect(await manager.getStatus()).toEqual({ files: ['src/page.tsx', 'assets/logo.svg'] });
    });

    it('keeps unsupported local history and diff commands inert', async () => {
        const { sandbox } = makeLocalSandbox(true);
        const manager = new GitManager(sandbox);

        expect(await manager.listCommits()).toEqual([]);
        expect(await manager.getDiffs()).toEqual([]);
        expect(await manager.getStagedFileCount()).toBe(0);
        expect(await manager.getDiffStat()).toBeNull();
        expect(await manager.getCommitNote('abc123')).toBeNull();
    });
});
