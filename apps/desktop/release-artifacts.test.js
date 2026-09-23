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

function extractConfiguredFiles(step, field = 'files') {
    const lines = step.split('\n');
    const filesIndex = lines.findIndex((line) => line.trim().startsWith(`${field}:`));
    if (filesIndex === -1) {
        throw new Error(`Step is missing a ${field}: field`);
    }

    const filesLine = lines[filesIndex].trim();
    const inlineValue = filesLine.slice(`${field}:`.length).trim();
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
        const desktopPackageJson = JSON.parse(
            await readFile(resolve(DESKTOP_ROOT, 'package.json'), 'utf8'),
        );
        const versionMatch = packageJson.packageManager.match(/^bun@(.+)$/);
        expect(versionMatch).not.toBeNull();

        const bunVersion = versionMatch[1];
        const configuredVersions = [...workflow.matchAll(/bun-version:\s*(\S+)/g)].map(
            ([, version]) => version,
        );

        expect(workflow).not.toContain('bun-version: latest');
        expect(configuredVersions).toEqual([bunVersion, bunVersion, bunVersion]);
        expect(desktopPackageJson.packageManager).toBe(packageJson.packageManager);
    });

    test('packages the staged Bun runtime outside ASAR on every release platform', async () => {
        const desktop = JSON.parse(await readFile(resolve(DESKTOP_ROOT, 'package.json'), 'utf8'));
        const build = desktop.build;
        const expected = {
            mac: { from: '.runtime/mac/bun', to: 'bin/bun' },
            win: { from: '.runtime/win/bun.exe', to: 'bin/bun.exe' },
            linux: { from: '.runtime/linux/bun', to: 'bin/bun' },
        };

        for (const [platform, resource] of Object.entries(expected)) {
            expect(build[platform].extraResources).toEqual([resource]);
            expect(desktop.scripts[`build:${platform}`]).toContain(`stage-bun-runtime.mjs ${platform}`);
            expect(desktop.scripts[`build:${platform}`]).toContain('electron-builder --');
            expect(desktop.scripts[`build:${platform}`]).toContain('--publish never');
        }
        expect(desktop.scripts.build).toContain('--publish never');
        expect(build.mac.x64ArchFiles).toBe('Contents/Resources/bin/bun');
        expect(build.mac.binaries).toContain('Contents/Resources/bin/bun');
        expect(build.mac.target).toEqual([
            { target: 'dmg', arch: ['universal'] },
            { target: 'zip', arch: ['universal'] },
        ]);
        expect(build.mac.artifactName).toBe('Weblab.${ext}');
        expect(build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
        expect(build.linux.target).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
    });

    test.each([
        [
            'Save DMG artifacts',
            [
                'apps/desktop/dist/Weblab.dmg',
                'apps/desktop/dist/Weblab.zip',
                'apps/desktop/dist/Weblab.dmg.blockmap',
                'apps/desktop/dist/Weblab.zip.blockmap',
                'apps/desktop/dist/latest-mac.yml',
            ],
        ],
        [
            'Save EXE artifacts',
            [
                'apps/desktop/dist/Weblab-Setup.exe',
                'apps/desktop/dist/Weblab-Setup.exe.blockmap',
                'apps/desktop/dist/latest.yml',
            ],
        ],
        [
            'Save AppImage artifacts',
            [
                'apps/desktop/dist/Weblab.AppImage',
                'apps/desktop/dist/latest-linux.yml',
            ],
        ],
    ])('%s saves installer and updater metadata for the final release', async (stepName, expectedFiles) => {
        const workflow = await readFile(WORKFLOW_PATH, 'utf8');
        const step = extractStep(workflow, stepName);

        expect(extractConfiguredFiles(step, 'path')).toEqual(expectedFiles);
        expect(step).toContain('uses: actions/upload-artifact@v4');
        expect(step).toContain('if-no-files-found: error');
    });

    test('publishes only after all platform builds have passed', async () => {
        const workflow = await readFile(WORKFLOW_PATH, 'utf8');
        const publish = workflow.slice(workflow.indexOf('\n  publish:'));
        const upload = extractStep(publish, 'Upload verified desktop release');
        expect(workflow).toContain('name: Match tag to desktop package version');
        expect(workflow).toContain('test "$GITHUB_REF_NAME" = "desktop-v$PACKAGE_VERSION"');
        expect([...workflow.matchAll(/    needs: verify-tag/g)]).toHaveLength(3);
        expect(workflow).toContain('A Developer ID Application certificate is required for desktop releases');
        expect(workflow).toContain('Apple notarization credentials are required for desktop releases');
        expect(workflow).toContain('codesign --verify --deep --strict');
        expect(workflow).toContain('base64 -D > "$CERT_PATH"');
        expect(workflow).toContain('base64 -D > "$KEY_PATH"');
        expect(publish).toContain('needs: [build-mac, build-win, build-linux]');
        expect(publish).toContain('uses: actions/download-artifact@v4');
        expect(publish).toContain('name: Verify complete release set');
        expect(upload).toContain('uses: softprops/action-gh-release@v2');
        expect(extractConfiguredFiles(upload)).toEqual([
            'release-assets/Weblab.dmg',
            'release-assets/Weblab.zip',
            'release-assets/Weblab.dmg.blockmap',
            'release-assets/Weblab.zip.blockmap',
            'release-assets/latest-mac.yml',
            'release-assets/Weblab-Setup.exe',
            'release-assets/Weblab-Setup.exe.blockmap',
            'release-assets/latest.yml',
            'release-assets/Weblab.AppImage',
            'release-assets/latest-linux.yml',
        ]);
    });
});
