import { describe, expect, it } from 'bun:test';

import type { ProjectFolder } from './project-card-utils';
import { fromConvexProjectListCard, moveProjectIdsToFolder } from './project-card-utils';

const folders = (): ProjectFolder[] => [
    {
        id: 'client',
        name: 'Client',
        projectIds: ['site-a', 'site-b'],
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
    },
    {
        id: 'personal',
        name: 'Personal',
        projectIds: [],
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
    },
];

describe('project organization', () => {
    it('moves one site without changing peers or the prior saved value', () => {
        const saved = folders();
        const moved = moveProjectIdsToFolder(saved, ['site-a'], 'personal');
        expect(moved.map((folder) => folder.projectIds)).toEqual([['site-b'], ['site-a']]);
        expect(saved.map((folder) => folder.projectIds)).toEqual([['site-a', 'site-b'], []]);
    });

    it('removes a site from its folder and retains empty folders', () => {
        const moved = moveProjectIdsToFolder(folders(), ['site-a', 'site-b'], null);
        expect(moved.map((folder) => folder.projectIds)).toEqual([[], []]);
        expect(moved.map((folder) => folder.name)).toEqual(['Client', 'Personal']);
    });

    it('keeps exactly one assignment when moving to the same folder again', () => {
        const moved = moveProjectIdsToFolder(folders(), ['site-a'], 'client');
        expect(moved[0]?.projectIds).toEqual(['site-b', 'site-a']);
    });

    it('preserves the local path and dates used by hover and details', () => {
        const project = fromConvexProjectListCard({
            _id: 'site-a',
            _creationTime: 1000,
            name: 'Site',
            tags: [],
            updatedAt: 2000,
            storageMode: 'local',
            runtimeMetadata: { framework: 'nextjs' },
            defaultBranch: { runtimeMetadata: { local: { rootPath: '/Users/designer/My site' } } },
        });
        expect(project.metadata.runtime?.local?.rootPath).toBe('/Users/designer/My site');
        expect(project.metadata.runtime?.framework).toBe('nextjs');
        expect(project.metadata.createdAt.getTime()).toBe(1000);
        expect(project.metadata.updatedAt.getTime()).toBe(2000);
    });
});
