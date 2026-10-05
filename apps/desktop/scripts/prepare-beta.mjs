import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import profile from '../desktop-profile.js';

// Prepares inspectable configuration only. No builds, deployment or provider calls.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 1) throw new Error('Usage: bun run prepare:beta https://private-beta-host');
const siteUrl = profile.betaSiteUrl(args[0]);
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const identity = createHash('sha256').update(siteUrl).digest('hex').slice(0, 16);
const output = join(root, 'dist', 'beta', identity);
const config = profile.createBetaBuildConfig(packageJson, siteUrl, join(output, 'artifacts'));
const runtimeProfile = profile.resolveDesktopProfile({ packaged: true,
    metadata: config.extraMetadata.weblabDesktopProfile, packageJson: config.extraMetadata });
await mkdir(output, { recursive: true });
const configPath = join(output, 'electron-builder.json');
await writeFile(configPath, JSON.stringify(config, null, 4) + '\n', { flag: 'wx' });
await writeFile(join(output, 'beta-manifest.json'), JSON.stringify({
    version: 1, sourcePackageVersion: packageJson.version, appId: config.appId,
    profile: config.extraMetadata.weblabDesktopProfile, protocol: 'weblab-beta',
    partition: runtimeProfile.partition, userDataName: runtimeProfile.userDataName,
    productName: runtimeProfile.name,
    updater: false, publication: 'never', notarization: false, signing: false,
    configSha256: createHash('sha256').update(JSON.stringify(config, null, 4) + '\n').digest('hex'),
    status: 'configuration-only; no app built or provider activated',
}, null, 4) + '\n', { flag: 'wx' });
console.log(`Prepared beta configuration: ${configPath}`);
