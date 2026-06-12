import { type NextRequest } from 'next/server';

/**
 * First-party desktop-app download endpoint.
 *
 * `weblab.build/api/download/mac` 302s to the latest release asset, which is
 * served with `Content-Disposition: attachment` — the browser downloads the
 * file in place and the user never lands on a GitHub page. Release assets are
 * published by `.github/workflows/desktop-release.yml` on `desktop-v*` tags;
 * `releases/latest/download/<asset>` always tracks the newest release, so this
 * route needs no per-release changes.
 *
 * Public by design (no auth): it serves the public installer download.
 */
const RELEASE_ASSET_BASE = 'https://github.com/Ludvig-Hedin/Weblab/releases/latest/download';

// The macOS build is a single universal DMG (Intel + Apple Silicon), so
// `mac` and `mac-intel` resolve to the same artifact.
const PLATFORM_ASSETS: Record<string, string> = {
    mac: 'Weblab.dmg',
    'mac-intel': 'Weblab.dmg',
    windows: 'Weblab-Setup.exe',
    linux: 'Weblab.AppImage',
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ platform: string }> },
) {
    const { platform } = await params;
    const asset = PLATFORM_ASSETS[platform];
    if (!asset) {
        return new Response('Unknown platform', { status: 404 });
    }
    return Response.redirect(`${RELEASE_ASSET_BASE}/${asset}`, 302);
}
