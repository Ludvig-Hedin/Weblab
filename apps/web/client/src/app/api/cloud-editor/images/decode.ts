import sharp from 'sharp';
/** Decode and re-encode on Railway. Missing native decoder always fails closed. */
export async function decodeCloudImage(input: Buffer, limits: { maxBytes: number; maxPixels: number }): Promise<Buffer> {
    if (!input.length || input.length > 4_000_000) throw new Error('Invalid image size');
    const image = sharp(input, { animated: false, limitInputPixels: limits.maxPixels, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height ||
        metadata.width > 8192 || metadata.height > 8192 || metadata.width * metadata.height > limits.maxPixels || (metadata.pages ?? 1) !== 1) throw new Error('Unsupported image');
    const result = await image.rotate().webp({ quality: 82, effort: 2 }).toBuffer();
    if (!result.length || result.length > limits.maxBytes) throw new Error('Image is too large');
    return result;
}
