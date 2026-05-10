/**
 * Helper for expressing scene timing as `s(start, length)`.
 * Returns the props Remotion's `<Sequence>` expects.
 */
export const s = (start: number, length: number): { from: number; durationInFrames: number } => ({
    from: start,
    durationInFrames: length,
});
