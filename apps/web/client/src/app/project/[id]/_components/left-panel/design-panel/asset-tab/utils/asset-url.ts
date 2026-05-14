import { DEFAULT_IMAGE_DIRECTORY } from '@weblab/constants';

/**
 * The public URL path an asset is served at. Assets live under `public/`,
 * which the framework serves from the site root — so `public/About/logo.svg`
 * resolves to `/About/logo.svg`.
 */
export function getAssetUrl(assetPath: string): string {
    const prefix = `${DEFAULT_IMAGE_DIRECTORY}/`;
    const relative = assetPath.startsWith(prefix)
        ? assetPath.slice(prefix.length)
        : assetPath.replace(/^\/+/, '');
    return `/${relative}`;
}
