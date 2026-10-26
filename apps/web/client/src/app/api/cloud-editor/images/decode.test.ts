import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { deflateSync } from 'node:zlib';
import { decodeCloudImage, decodeCloudImageWithMetadata, inspectCloudImageDimensions } from './decode';
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

/** Small, valid two-frame RGBA APNG. A static PNG decoder may expose only its default frame. */
function animatedPng(): Buffer {
    const chunk = (type: string, data: Buffer) => {
        const name = Buffer.from(type), payload = Buffer.concat([name, data]);
        let crc = 0xffffffff;
        for (const byte of payload) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        const result = Buffer.alloc(data.length + 12);
        result.writeUInt32BE(data.length); payload.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
        return result;
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
    const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
    const frame = (sequence: number) => {
        const control = Buffer.alloc(26); control.writeUInt32BE(sequence); control.writeUInt32BE(1, 4); control.writeUInt32BE(1, 8);
        control.writeUInt16BE(1, 20); control.writeUInt16BE(10, 22); return chunk('fcTL', control);
    };
    const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('acTL', animation), frame(0),
        chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), frame(1),
        chunk('fdAT', Buffer.concat([sequence, deflateSync(Buffer.from([0, 0, 255, 0, 255]))])), chunk('IEND', Buffer.alloc(0))]);
}
describe('verified normalized image dimensions', () => {
    it.each([1, 3, 5, 6, 7, 8])('uses fully decoded output dimensions for EXIF orientation %s', async orientation => {
        const input = await sharp({ create: { width: 5, height: 3, channels: 3, background: '#aabbcc' } }).jpeg().withMetadata({ orientation }).toBuffer();
        const before = Buffer.from(input);
        const expected = orientation >= 5 ? { width: 3, height: 5 } : { width: 5, height: 3 };
        const decoded = await decodeCloudImageWithMetadata(input, limits);
        expect({ width: decoded.width, height: decoded.height }).toEqual(expected);
        const output = await sharp(decoded.bytes).metadata();
        expect({ width: output.width, height: output.height }).toEqual(expected);
        expect(output.orientation).toBeUndefined(); expect(output.exif).toBeUndefined();
        expect(await inspectCloudImageDimensions(input)).toEqual(expected);
        expect(input.equals(before)).toBe(true);
        expect(await decodeCloudImage(input, limits)).toEqual(decoded.bytes);
    });
    it('refuses animated PNG for both normalization and original inspection', async () => {
        const input = animatedPng();
        await expect(decodeCloudImageWithMetadata(input, limits)).rejects.toThrow('Animated images');
        await expect(inspectCloudImageDimensions(input)).rejects.toThrow('Animated images');
    });
    it('checks byte limits, dimensions and complete original pixel decoding', async () => {
        await expect(decodeCloudImageWithMetadata(Buffer.alloc(4_000_001), limits)).rejects.toThrow('Invalid image size');
        await expect(inspectCloudImageDimensions(Buffer.alloc(32 * 1024 * 1024 + 1))).rejects.toThrow('Invalid image size');
        const wide = await sharp({ create: { width: 8193, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
        await expect(inspectCloudImageDimensions(wide)).rejects.toThrow('Unsupported image');
        const original = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#aabbcc' } }).jpeg().toBuffer();
        await expect(inspectCloudImageDimensions(original.subarray(0, original.length - 20))).rejects.toThrow();
        await expect(inspectCloudImageDimensions(Buffer.from('<svg width="1" height="1"/>'))).rejects.toThrow();
        await expect(decodeCloudImageWithMetadata(original, { ...limits, maxPixels: Number.NaN })).rejects.toThrow('Invalid image limits');
        await expect(decodeCloudImageWithMetadata(original, { ...limits, maxBytes: 600_001 })).rejects.toThrow('Invalid image limits');
    });
});
