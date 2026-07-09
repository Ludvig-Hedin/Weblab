import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DESKTOP_ROOT, '../..');
const WORKFLOW_PATH = resolve(REPO_ROOT, '.github/workflows/desktop-release.yml');

function extractStep(workflow, stepName) {
    const marker = `      - name: ${stepName}`;
    const start = workflow.indexOf(marker);
    if (start === -1) {
        throw new Error(`Could not find workflow step: ${stepName}`);
    }

    const nextStep = workflow.indexOf('\n      - name:', start + marker.length);
    if (nextStep === -1) {
        return workflow.slice(start);
    }
    return workflow.slice(start, nextStep);
}

function extractUploadedFiles(step) {
    const lines = step.split('\n');
    const filesIndex = lines.findIndex((line) => line.trim().startsWith('files:'));
    if (filesIndex === -1) {
        throw new Error('Upload step is missing a files: field');
    }

    const filesLine = lines[filesIndex].trim();
    const inlineValue = filesLine.slice('files:'.length).trim();
    if (inlineValue && inlineValue !== '|') {
        return [inlineValue];
    }

    const files = [];
    for (const line of lines.slice(filesIndex + 1)) {
        if (!line.startsWith('            ')) break;
        const value = line.trim();
        if (value) files.push(value);
    }
    return files;
}

describe('desktop release artifacts', () => {
    test('uses the repository-pinned Bun version', async () => {
        const workflow = await readFile(WORKFLOW_PATH, 'utf8');
        const packageJson = JSON.parse(
            await readFile(resolve(REPO_ROOT, 'package.json'), 'utf8'),
        );
        const versionMatch = packageJson.packageManager.match(/^bun@(.+)$/);
        expect(versionMatch).not.toBeNull();

        const bunVersion = versionMatch[1];
        const configuredVersions = [...workflow.matchAll(/bun-version:\s*(\S+)/g)].map(
            ([, version]) => version,
        );

        expect(workflow).not.toContain('bun-version: latest');
        expect(configuredVersions).toEqual([bunVersion, bunVersion, bunVersion]);
    });

    test.each([
        [
            'Upload DMG artifacts',
            [
                'apps/desktop/dist/Weblab.dmg',
                'apps/desktop/dist/Weblab.dmg.blockmap',
                'apps/desktop/dist/latest-mac.yml',
            ],
        ],
        [
            'Upload EXE artifacts',
            [
                'apps/desktop/dist/Weblab-Setup.exe',
                'apps/desktop/dist/Weblab-Setup.exe.blockmap',
                'apps/desktop/dist/latest.yml',
            ],
        ],
        [
            'Upload AppImage artifacts',
            [
                'apps/desktop/dist/Weblab.AppImage',
                'apps/desktop/dist/latest-linux.yml',
            ],
        ],
    ])('%s uploads installer and updater metadata', async (stepName, expectedFiles) => {
        const workflow = await readFile(WORKFLOW_PATH, 'utf8');
        const step = extractStep(workflow, stepName);

        expect(extractUploadedFiles(step)).toEqual(expectedFiles);
    });
});
