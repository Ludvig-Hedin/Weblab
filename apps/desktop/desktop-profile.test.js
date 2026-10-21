import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { betaSiteUrl, resolveDesktopProfile, desktopBootstrapArgument, createBetaBuildConfig, BOOTSTRAP_PREFIX, BETA_ELECTRON_VERSION, BUILD_HOOKS } = require('./desktop-profile');
const root = dirname(fileURLToPath(import.meta.url));
const siteUrl = 'https://private-beta.up.railway.app';
const metadata = { version: 1, channel: 'beta', siteUrl };
const beta = resolveDesktopProfile({ packaged: true, metadata });
const preloadSource = readFileSync(join(root, 'preload.js'), 'utf8');
const mainSource = readFileSync(join(root, 'main.js'), 'utf8');

function preload(argv, origin = siteUrl) {
    const exposed = {};
    const calls = [];
    runInNewContext(preloadSource, {
        URL, location: { origin }, process: { platform: 'darwin', argv,
            env: { NEXT_PUBLIC_SITE_URL: 'https://weblab.build', NODE_ENV: 'development' } },
        require: name => {
            if (name !== 'electron') throw new Error('Sandbox preload cannot require local files.');
            return { contextBridge: { exposeInMainWorld: (key, value) => { exposed[key] = value; } },
                ipcRenderer: { sendSync: (...args) => { calls.push(args); return '0.2.6'; } }, webUtils: {} };
        },
    });
    return { bridge: exposed.weblabNative, calls };
}

function mainHarness({ profile = metadata, packaged = true, environment = {}, argv = [] } = {}) {
    const events = new Map();
    const calls = [];
    const windows = [];
    let resolveReady;
    let csp;
    const app = {
        isPackaged: packaged,
        on: (event, callback) => events.set(event, callback),
        whenReady: () => new Promise(resolve => { resolveReady = resolve; }),
        setName: name => calls.push(['name', name]),
        getName: () => 'Weblab Beta',
        getVersion: () => '0.2.6',
        getPath: name => name === 'appData' ? '/disposable/app-data' : '/disposable/user-data',
        setPath: (name, value) => calls.push(['path', name, value]),
        requestSingleInstanceLock: () => { calls.push(['lock']); return true; },
        setAsDefaultProtocolClient: scheme => calls.push(['protocol', scheme]),
        quit: () => calls.push(['quit']),
    };
    class Window {
        constructor(options) {
            this.options = options;
            this.loads = [];
            this.webContents = { userAgent: 'test', mainFrame: { url: siteUrl + '/sign-in' },
                on() {}, setWindowOpenHandler: callback => { this.popup = callback; },
                openDevTools() {}, send() {}, executeJavaScript: () => Promise.resolve(),
                insertCSS: () => Promise.resolve(),
            };
            windows.push(this);
        }
        static getAllWindows() { return windows; }
        loadURL(value) { this.loads.push(value); return Promise.resolve(); }
        on() {} once() {} show() {} focus() {} setTitle() {}
        isDestroyed() { return false; } isMinimized() { return false; }
    }
    const local = { registerLocalIpc() {}, grantLocalRoot() {}, disposeLocal: () => Promise.resolve() };
    const modules = {
        electron: { app, BrowserWindow: Window, shell: { openExternal: () => Promise.resolve() },
            Menu: { buildFromTemplate: value => value, setApplicationMenu() {} },
            ipcMain: { on() {}, handle() {} }, dialog: {}, safeStorage: {},
            session: { fromPartition: partition => { calls.push(['partition', partition]);
                return { webRequest: { onHeadersReceived: callback => { csp = callback; } } }; } } },
        'electron-updater': { autoUpdater: { checkForUpdatesAndNotify: () => calls.push(['updater']) } },
        path: require('node:path'), './desktop-profile': require('./desktop-profile'),
        './package.json': { weblabDesktopProfile: profile },
        './auth-policy': require('./auth-policy'), './auth-hosts': { isOAuthHost: () => false },
        './weblab-local': local, './weblab-cli': { registerIpcHandlers() {}, disposeCli: () => Promise.resolve() },
        './release/store': { ReleaseStore: class {} }, './release/service': { PublishingService: class {} },
        './desktop-log': { installDesktopLog: () => null },
        './release/site-engine': { hasSiteEngine: () => true },
        './release/sanity-content': { SanityContentCoordinator: class {} },
        './release/authorize': { createPublishAuthorizer: () => () => {} }, './release/ipc': { registerPublishingIpc() {} },
    };
    runInNewContext(mainSource, { require: name => {
        if (!(name in modules)) throw new Error('Unexpected dependency ' + name);
        return modules[name];
    }, __dirname: root, URL, console, setTimeout, process: { env: environment, argv, platform: 'darwin' } });
    return { events, calls, windows, headers: (...args) => csp(...args),
        ready: async () => { resolveReady(); await Promise.resolve(); } };
}

describe('isolated desktop beta profile', () => {
    test('packaged beta ignores all runtime host/name overrides', () => {
        const result = resolveDesktopProfile({ packaged: true, metadata,
            environment: { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', NEXT_PUBLIC_APP_DOMAIN: 'weblab.build', NEXT_PUBLIC_APP_NAME: 'Other' } });
        expect(result.siteUrl).toBe(siteUrl);
        expect(result.name).toBe('Weblab Beta');
        expect(result.updates).toBe(false);
    });
    test.each(['https://weblab.build', 'https://www.weblab.build', 'https://beta.weblab.build',
        'http://private-beta.up.railway.app', siteUrl + '/', siteUrl + '/project', siteUrl + '?x=1', siteUrl + '#x',
        'https://user:pass@private-beta.up.railway.app', 'https://localhost', 'https://127.0.0.1',
        'https://[::1]', 'https://private-beta.local', 'https://private-beta.up.railway.app:8443'])('refuses unsafe beta origin %s', value => {
        expect(() => betaSiteUrl(value)).toThrow();
    });
    test('invalid packaged metadata cannot fall back to stable', () => {
        for (const value of [null, {}, { ...metadata, channel: 'stable' }, { ...metadata, version: 2 }, { ...metadata, extra: true }]) {
            expect(() => resolveDesktopProfile({ packaged: true, metadata: value })).toThrow();
        }
    });
    test('review config clears stable notary/publish settings and pins beta identity', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
        const before = JSON.stringify(pkg);
        const config = createBetaBuildConfig(pkg, siteUrl, '/disposable/beta-artifacts');
        expect(config.appId).toBe('com.ludvighedin.weblab.beta');
        expect(BETA_ELECTRON_VERSION).toBe('42.2.0');
        expect(config.electronVersion).toBe(BETA_ELECTRON_VERSION);
        expect(JSON.stringify(pkg)).toBe(before);
        expect(config.protocols[0].schemes).toEqual(['weblab-beta']);
        expect(config.extraMetadata.weblabDesktopProfile).toEqual(metadata);
        expect(config.afterSign).toBeNull();
        expect(config.publish).toBeNull();
        expect(config.extends).toBeNull();
        expect(config.mac.notarize).toBe(false);
        expect(config.mac.identity).toBeNull();
        expect(config.mac.sign).toBeNull();
        expect(config.mac.forceCodeSigning).toBe(false);
        expect(config.forceCodeSigning).toBe(false);
        expect(config.dmg.writeUpdateInfo).toBe(false);
        expect(config.directories.output).toBe('/disposable/beta-artifacts');
        expect(pkg.build.appId).toBe('com.weblab.desktop');
    });
    test('all installed builder callback hooks are cleared, including custom signing', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
        for (const hook of BUILD_HOOKS) pkg.build[hook] = './unsafe-inherited-hook.js';
        pkg.build.electronDist = './unsafe-electron-provider.js';
        pkg.build.mac.sign = './unsafe-signing-hook.js';
        pkg.build.mac.identity = 'Automatically selected certificate';
        pkg.build.forceCodeSigning = true;
        pkg.build.win.sign = './unsafe-windows-signing-hook.js';
        pkg.build.win.signtoolOptions = { sign: './unsafe-signtool-hook.js' };
        const config = createBetaBuildConfig(pkg, siteUrl, '/disposable/beta-artifacts');
        for (const hook of BUILD_HOOKS) expect(config[hook]).toBeNull();
        expect(config.electronDist).toBeUndefined();
        expect(config.win.sign).toBeNull();
        expect(config.win.signAndEditExecutable).toBe(false);
        expect(config.win.signtoolOptions.sign).toBeNull();
        const builderRoot = dirname(require.resolve('app-builder-lib/package.json'));
        const schema = JSON.parse(readFileSync(join(builderRoot, 'scheme.json'), 'utf8'));
        const callbackKeys = Object.entries(schema.properties)
            .filter(([, definition]) => JSON.stringify(definition).includes('"typeof":"function"'))
            .map(([key]) => key).sort();
        expect([...BUILD_HOOKS, 'electronDist'].sort()).toEqual(callbackKeys);
        // The installed validator's Bluebird source-map initialization breaks
        // under Bun. Validate the exact config in Node without building anything.
        const result = execFileSync('node', ['-e', `
            const { validateConfiguration } = require(process.argv[1]);
            const config = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
            validateConfiguration(config, { isEnabled: false }).then(() => {
                process.stdout.write('config valid\\n');
            }).catch(error => { console.error(error.message); process.exitCode = 1; });
        `, require.resolve('app-builder-lib/out/util/config/config.js')], {
            input: JSON.stringify(config), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
        });
        expect(result).toBe('config valid\n');
    });
    test('beta names derive from source productName and survive cleaned packaged metadata', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
        pkg.build.productName = 'Source Brand';
        const config = createBetaBuildConfig(pkg, siteUrl, '/disposable/beta-artifacts');
        expect(config.productName).toBe('Source Brand Beta');
        expect(config.protocols[0].name).toBe('Source Brand Beta');
        expect(config.artifactName).toBe('Source-Brand-Beta.${ext}');
        const packagedProfile = resolveDesktopProfile({ packaged: true,
            metadata: config.extraMetadata.weblabDesktopProfile, packageJson: config.extraMetadata });
        expect(packagedProfile.name).toBe('Source Brand Beta');
        expect(packagedProfile.userDataName).toBe('Source Brand Beta');
        expect(() => resolveDesktopProfile({ packaged: true, metadata, packageJson: {} })).toThrow();
    });
});

describe('sandboxed native bootstrap', () => {
    test('beta bridge attaches only to its pinned origin without local require or env', () => {
        const hint = desktopBootstrapArgument(beta);
        expect(typeof preload([hint]).bridge.localfs?.read).toBe('function');
        for (const origin of ['https://weblab.build', 'http://localhost:3000', 'https://other.up.railway.app']) {
            const result = preload([hint], origin);
            expect(result.bridge.localfs).toBeUndefined();
            expect(result.bridge.publishing).toBeUndefined();
            expect(result.calls).toEqual([]);
        }
    });
    test('absent, duplicated and malformed bootstrap exposes no native calls', () => {
        const hint = desktopBootstrapArgument(beta);
        for (const args of [[], [hint, hint], [hint, '--weblab-desktop-bootstrap'], [BOOTSTRAP_PREFIX + '%'],
            [BOOTSTRAP_PREFIX + encodeURIComponent(JSON.stringify({ ...metadata, siteUrl: 'https://beta.weblab.build' }))],
            [BOOTSTRAP_PREFIX + encodeURIComponent(JSON.stringify({ ...metadata, extra: true }))]]) {
            const result = preload(args);
            expect(result.bridge.openExternal).toBeUndefined();
            expect(result.bridge.cli).toBeUndefined();
            expect(result.bridge.localfs).toBeUndefined();
            expect(result.calls).toEqual([]);
        }
    });
    test('stable and development windows also require exact mandatory bootstrap', () => {
        for (const packaged of [true, false]) {
            const profile = resolveDesktopProfile({ packaged, environment: packaged ? {} : { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' } });
            const result = preload([desktopBootstrapArgument(profile)], profile.siteUrl);
            expect(typeof result.bridge.localfs?.read).toBe('function');
        }
    });
});

describe('native startup integration', () => {
    test('beta separates user data before lock and supplies bootstrap to windows and CSP partition', async () => {
        const main = mainHarness({ environment: { NEXT_PUBLIC_SITE_URL: 'https://weblab.build' } });
        const pathIndex = main.calls.findIndex(call => call[0] === 'path');
        const lockIndex = main.calls.findIndex(call => call[0] === 'lock');
        expect(pathIndex).toBeLessThan(lockIndex);
        expect(main.calls[pathIndex]).toEqual(['path', 'userData', '/disposable/app-data/Weblab Beta']);
        await main.ready();
        expect(main.calls).toContainEqual(['protocol', 'weblab-beta']);
        expect(main.calls).toContainEqual(['partition', 'persist:weblab-beta']);
        expect(main.calls.some(call => call[0] === 'updater')).toBe(false);
        const window = main.windows[0];
        expect(window.loads).toEqual([siteUrl + '/sign-in?native=1']);
        expect(window.options.webPreferences.additionalArguments).toEqual([desktopBootstrapArgument(beta)]);
        const popup = window.popup({ url: siteUrl + '/projects' });
        expect(popup.overrideBrowserWindowOptions.webPreferences.additionalArguments).toEqual([desktopBootstrapArgument(beta)]);
        expect(popup.overrideBrowserWindowOptions.webPreferences.partition).toBe('persist:weblab-beta');
        let response;
        main.headers({ url: siteUrl, resourceType: 'mainFrame', responseHeaders: { 'content-security-policy': ["frame-src 'self'; connect-src 'self'"] } }, result => { response = result; });
        expect(response.responseHeaders['content-security-policy'][0]).toContain('http://localhost:*');
    });
    test('early macOS deep link waits for readiness', async () => {
        const main = mainHarness();
        main.events.get('open-url')({ preventDefault() {} }, 'weblab-beta://projects');
        expect(main.windows).toHaveLength(0);
        await main.ready();
        expect(main.windows[0].loads).toEqual([siteUrl + '/projects?native=1']);
    });
    test('a cold unbound auth callback still opens the ordinary sign-in window', async () => {
        const main = mainHarness({ argv: ['weblab-beta://auth/handoff?ticket=unbound&state=' + 'a'.repeat(64)] });
        await main.ready();
        expect(main.windows).toHaveLength(1);
        expect(main.windows[0].loads).toEqual([siteUrl + '/sign-in?native=1']);
    });
});
