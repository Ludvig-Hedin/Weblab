import { Base64 } from 'convex/values';

/** Storage metadata uses Base64 with current SDKs; older deployments returned hex. */
export function storageSha256Matches(stored: string, expectedHex: string): boolean {
    if (expectedHex.length !== 64 || /[^0-9a-f]/.test(expectedHex)) return false;
    if (stored === expectedHex) return true;
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(expectedHex.slice(index * 2, index * 2 + 2), 16));
    return stored === Base64.fromByteArray(bytes);
}
