import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// Published archive checksums: https://github.com/oven-sh/bun/releases/expanded_assets/bun-v1.3.10
const BUN_VERSION = '1.3.10';
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const ASSETS = {
    macArm64: {
        name: 'bun-darwin-aarch64',
        sha256: '82034e87c9d9b4398ea619aee2eed5d2a68c8157e9a6ae2d1052d84d533ccd8d',
        executable: 'bun',
    },
    macX64: {
        name: 'bun-darwin-x64',
        sha256: 'c1d90bf6140f20e572c473065dc6b37a4b036349b5e9e4133779cc642ad94323',
        executable: 'bun',
    },
    winX64: {
        name: 'bun-windows-x64',
        sha256: '7a77b3e245e2e26965c93089a4a1332e8a326d3364c89fae1d1fd99cdd3cd73d',
        executable: 'bun.exe',
    },
    linuxX64: {
        name: 'bun-linux-x64',
        sha256: 'f57bc0187e39623de716ba3a389fda5486b2d7be7131a980ba54dc7b733d2e08',
        executable: 'bun',
    },
};

const DESKTOP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ROOT = join(DESKTOP_ROOT, '.runtime');

function buildTarget(argument) {
    const host = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
    const target = argument === 'host' ? host : argument;
    if (!target || target !== host || (target !== 'mac' && process.arch !== 'x64') ||
        (target === 'mac' && !['arm64', 'x64'].includes(process.arch))) {
        throw new Error(`Unsupported desktop build target ${argument ?? '(missing)'} on ${process.platform}/${process.arch}. Build on the target OS; Windows and Linux releases are x64.`);
    }
    return target;
}

async function downloadAsset(asset, directory) {
    const archive = join(directory, `${asset.name}.zip`);
    const url = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${asset.name}.zip`;
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) {
        throw new Error(`Could not download ${asset.name}: HTTP ${response.status}.`);
    }
    let received = 0;
    const limit = new Transform({
        transform(chunk, _encoding, callback) {
            received += chunk.length;
            callback(received > MAX_ARCHIVE_BYTES
                ? new Error(`${asset.name} exceeds the archive size limit.`)
                : null, chunk);
        },
    });
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(archive, { flags: 'wx' }));
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest('hex') !== asset.sha256) {
        throw new Error(`${asset.name} did not match the published SHA-256 checksum.`);
    }
    const extracted = join(directory, asset.name);
    await mkdir(extracted);
    if (process.platform === 'win32') {
        // Windows' inbox tar.exe uses libarchive and can extract ZIP files.
        execFileSync('tar.exe', ['-xf', archive, '-C', extracted], { timeout: 60_000 });
    } else {
        execFileSync('unzip', ['-q', archive, '-d', extracted], { timeout: 60_000 });
    }
    const binary = join(extracted, asset.name, asset.executable);
    if (!(await stat(binary)).isFile()) throw new Error(`${asset.name} has no expected Bun executable.`);
    return binary;
}

async function stage() {
    const target = buildTarget(process.argv[2]);
    await mkdir(RUNTIME_ROOT, { recursive: true });
    const temporary = await mkdtemp(join(tmpdir(), 'weblab-bun-'));
    const staging = await mkdtemp(join(RUNTIME_ROOT, '.stage-'));
    try {
        const output = join(staging, target === 'win' ? 'bun.exe' : 'bun');
        if (target === 'mac') {
            const arm64 = await downloadAsset(ASSETS.macArm64, temporary);
            const x64 = await downloadAsset(ASSETS.macX64, temporary);
            execFileSync('xcrun', ['lipo', '-create', arm64, x64, '-output', output], { timeout: 60_000 });
            const architectures = execFileSync('xcrun', ['lipo', '-archs', output], { encoding: 'utf8' });
            if (!architectures.includes('arm64') || !architectures.includes('x86_64')) {
                throw new Error('Staged Bun is not a universal macOS executable.');
            }
        } else {
            const asset = target === 'win' ? ASSETS.winX64 : ASSETS.linuxX64;
            await copyFile(await downloadAsset(asset, temporary), output);
        }
        if (target !== 'win') await chmod(output, 0o755);
        const actualVersion = execFileSync(output, ['--version'], {
            encoding: 'utf8', timeout: 10_000,
        }).trim();
        if (actualVersion !== BUN_VERSION) {
            throw new Error(`Staged Bun reported ${actualVersion}, expected ${BUN_VERSION}.`);
        }
        const destination = join(RUNTIME_ROOT, target);
        await rm(destination, { recursive: true, force: true });
        await rename(staging, destination);
        process.stdout.write(`Staged Bun ${BUN_VERSION} for ${target} at ${destination}\n`);
    } finally {
        await rm(staging, { recursive: true, force: true });
        await rm(temporary, { recursive: true, force: true });
    }
}

await stage();
