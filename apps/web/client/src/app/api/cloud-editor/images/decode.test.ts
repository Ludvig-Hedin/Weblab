import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { decodeCloudImage } from './decode';
const limits = { maxBytes: 600_000, maxPixels: 16_000_000 };
describe('customer image decoding', () => {
    for (const format of ['png', 'jpeg', 'webp'] as const) it(`fully decodes ${format} and produces a bounded WebP`, async () => {
        const input = await sharp({ create: { width: 5, height: 4, channels: 3, background: '#aabbcc' } })[format]().toBuffer();
        const result = await decodeCloudImage(input, limits);
        const metadata = await sharp(result).metadata();
        expect(metadata.format).toBe('webp'); expect(metadata.width).toBe(5); expect(metadata.height).toBe(4);
        expect(metadata.exif).toBeUndefined();
    });
    it('refuses SVG, broken files and a decoded image exceeding its pixel budget', async () => {
        await expect(decodeCloudImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'), limits)).rejects.toThrow();
        await expect(decodeCloudImage(Buffer.from('not an image'), limits)).rejects.toThrow();
        const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
        await expect(decodeCloudImage(input, { ...limits, maxPixels: 10 })).rejects.toThrow();
        await expect(decodeCloudImage(input, { ...limits, maxBytes: 1 })).rejects.toThrow();
        await expect(decodeCloudImage(input.subarray(0, input.length / 2), limits)).rejects.toThrow();
    });
});
