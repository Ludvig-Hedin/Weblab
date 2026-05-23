/**
 * DEPRECATED — the v3 `Overlays` section was split into two v4 sections:
 *   - `./background.tsx` for the bg-color / bg-image / bg-size / bg-position / bg-repeat
 *   - `./border.tsx`     for the stroke + radius
 *
 * This file is kept as a tombstone so a stale import surfaces an obvious
 * build-time error pointing at the new files. Delete on the v3 cleanup pass.
 */
export const OverlaysSection = () => {
    throw new Error(
        'OverlaysSection has been split into BackgroundSection and BorderSection in style-tab-v4.',
    );
};
