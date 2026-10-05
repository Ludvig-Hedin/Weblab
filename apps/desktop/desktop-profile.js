const BOOTSTRAP_PREFIX = '--weblab-desktop-bootstrap=';
const BETA_APP_ID = 'com.ludvighedin.weblab.beta';
const BETA_ELECTRON_VERSION = '42.2.0';
const BUILD_HOOKS = ['afterAllArtifactBuild', 'afterExtract', 'afterPack', 'afterSign',
    'appxManifestCreated', 'artifactBuildCompleted', 'artifactBuildStarted',
    'beforeBuild', 'beforePack', 'msiProjectCreated', 'onNodeModuleFile'];

function desktopBrand(packageJson) {
    // electron-builder removes build metadata from app.asar. The preparer
    // preserves this source brand in one immutable top-level package field.
    const brand = packageJson.build?.productName ?? packageJson.weblabDesktopBrand;
    if (typeof brand !== 'string' || !brand || brand.trim() !== brand || brand.length > 128 ||
        /[\\/:*?"<>|\x00-\x1f]/.test(brand)) throw new Error('Desktop package productName is required.');
    return brand;
}

function betaSiteUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('A bare beta HTTPS origin is required.');
    const url = new URL(value);
    const hostname = url.hostname;
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.port ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(hostname) ||
        hostname === 'weblab.build' || hostname.endsWith('.weblab.build') ||
        hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw new Error('Beta must use a separate public HTTPS origin outside weblab.build.');
    }
    return url.origin;
}

function parseBetaMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'channel,siteUrl,version' ||
        value.version !== 1 || value.channel !== 'beta') {
        throw new Error('Invalid packaged desktop profile.');
    }
    return Object.freeze({ version: 1, channel: 'beta', siteUrl: betaSiteUrl(value.siteUrl) });
}

/** Beta metadata is authoritative. Runtime environment cannot redirect its native privileges. */
function resolveDesktopProfile({ packaged, metadata, environment = {}, packageJson = require('./package.json') }) {
    if (metadata !== undefined) {
        const beta = parseBetaMetadata(metadata);
        const name = `${desktopBrand(packageJson)} Beta`;
        return Object.freeze({ ...beta, name, protocol: 'weblab-beta',
            partition: 'persist:weblab-beta', userDataName: name, updates: false });
    }
    const channel = packaged ? 'stable' : 'development';
    const domain = environment.NEXT_PUBLIC_APP_DOMAIN || 'weblab.build';
    const url = new URL(environment.NEXT_PUBLIC_SITE_URL || `https://${domain}`);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.username || url.password || (url.protocol !== 'https:' &&
        !(channel === 'development' && local && url.protocol === 'http:'))) {
        throw new Error('Invalid desktop app origin.');
    }
    return Object.freeze({ version: 1, channel, siteUrl: url.origin,
        name: environment.NEXT_PUBLIC_APP_NAME || 'Weblab', protocol: 'weblab',
        partition: 'persist:weblab', userDataName: null, updates: channel === 'stable' });
}

function desktopBootstrapArgument(profile) {
    return BOOTSTRAP_PREFIX + encodeURIComponent(JSON.stringify({
        version: 1, channel: profile.channel, siteUrl: profile.siteUrl,
    }));
}

/** Complete overrides prevent beta from inheriting stable publication or notary hooks. */
function createBetaBuildConfig(packageJson, siteUrl, outputDirectory) {
    const metadata = parseBetaMetadata({ version: 1, channel: 'beta', siteUrl });
    const brand = desktopBrand(packageJson);
    const name = `${brand} Beta`;
    const artifact = `${brand.replace(/\s+/g, '-')}-Beta`;
    const build = structuredClone(packageJson.build);
    if (!build || !Array.isArray(build.files)) throw new Error('Desktop package build config is missing.');
    // electronDist can be a callback, but its schema does not accept null.
    delete build.electronDist;
    if (build.mas) build.mas = { ...build.mas, sign: null, identity: null, forceCodeSigning: false };
    if (build.masDev) build.masDev = { ...build.masDev, sign: null, identity: null, forceCodeSigning: false };
    return {
        ...build,
        ...Object.fromEntries(BUILD_HOOKS.map(hook => [hook, null])),
        extends: null,
        appId: BETA_APP_ID,
        electronVersion: BETA_ELECTRON_VERSION,
        productName: name,
        artifactName: `${artifact}.\${ext}`,
        directories: { ...build.directories, output: outputDirectory },
        protocols: [{ name, schemes: ['weblab-beta'], role: 'Viewer' }],
        extraMetadata: { ...build.extraMetadata, weblabDesktopBrand: brand, weblabDesktopProfile: metadata },
        forceCodeSigning: false,
        publish: null,
        mac: { ...build.mac, artifactName: `${artifact}.\${ext}`, notarize: false,
            identity: null, sign: null, forceCodeSigning: false },
        dmg: { ...build.dmg, writeUpdateInfo: false, sign: false },
        win: { ...build.win, artifactName: `${artifact}-Setup.\${ext}`, sign: null,
            forceCodeSigning: false, signAndEditExecutable: false,
            ...(build.win?.signtoolOptions ? { signtoolOptions: { ...build.win.signtoolOptions, sign: null } } : {}),
        },
        linux: { ...build.linux, artifactName: `${artifact}.\${ext}` },
    };
}

module.exports = { betaSiteUrl, parseBetaMetadata, resolveDesktopProfile, desktopBootstrapArgument,
    createBetaBuildConfig, BOOTSTRAP_PREFIX, BETA_APP_ID, BETA_ELECTRON_VERSION, BUILD_HOOKS };
