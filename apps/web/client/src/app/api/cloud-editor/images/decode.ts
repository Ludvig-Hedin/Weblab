import sharp from 'sharp';

const MAX_INPUT_BYTES = 4_000_000;
const MAX_ORIGINAL_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 600_000;
const MAX_PIXELS = 16_000_000;
const MAX_DIMENSION = 8192;
type Limits = { maxBytes: number; maxPixels: number };
type Dimensions = { width: number; height: number };

function dimensions(width: number | undefined, height: number | undefined, maxPixels: number): Dimensions {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !width || !height || width < 1 || height < 1 ||
        width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > maxPixels) throw new Error('Unsupported image');
    return { width, height };
}
/** Sharp can decode an APNG's static default image without reporting its animation pages. */
function rejectAnimatedPng(input: Buffer): void {
    if (input.length < 8 || !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return;
    let offset = 8;
    while (offset < input.length) {
        if (input.length - offset < 12) throw new Error('Unsupported image');
        const length = input.readUInt32BE(offset);
        const end = offset + length + 12;
        if (end > input.length) throw new Error('Unsupported image');
        const type = input.readUInt32BE(offset + 4);
        if (type === 0x6163544c) throw new Error('Animated images are unsupported'); // acTL
        if (type === 0x49454e44) return; // IEND; the decoder validates the image itself.
        offset = end;
    }
}
async function imageInput(input: Buffer, maxBytes: number, maxPixels: number) {
    if (!input.length || input.length > maxBytes) throw new Error('Invalid image size');
    rejectAnimatedPng(input);
    const image = sharp(input, { animated: false, limitInputPixels: maxPixels, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('Unsupported image');
    dimensions(metadata.width, metadata.height, maxPixels);
    return image;
}
/** Decode and normalize on Railway. Dimensions describe the actual orientation-corrected WebP. */
export async function decodeCloudImageWithMetadata(input: Buffer, limits: Limits): Promise<Dimensions & { bytes: Buffer }> {
    if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || limits.maxBytes > MAX_OUTPUT_BYTES ||
        !Number.isSafeInteger(limits.maxPixels) || limits.maxPixels < 1 || limits.maxPixels > MAX_PIXELS) throw new Error('Invalid image limits');
    const image = await imageInput(input, MAX_INPUT_BYTES, limits.maxPixels);
    const { data, info } = await image.rotate().webp({ quality: 82, effort: 2 }).toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > limits.maxBytes) throw new Error('Image is too large');
    return { bytes: data, ...dimensions(info.width, info.height, limits.maxPixels) };
}
/** Existing v1 callers still receive only normalized WebP bytes. */
export async function decodeCloudImage(input: Buffer, limits: Limits): Promise<Buffer> {
    return (await decodeCloudImageWithMetadata(input, limits)).bytes;
}
/** Decode original private bytes fully to verify intrinsic ratio; never return rewritten original bytes. */
export async function inspectCloudImageDimensions(input: Buffer): Promise<Dimensions> {
    const image = await imageInput(input, MAX_ORIGINAL_BYTES, MAX_PIXELS);
    const { info } = await image.rotate().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
    return dimensions(info.width, info.height, MAX_PIXELS);
}
