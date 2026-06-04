/**
 * Figma orders sibling nodes by `parentIndex.position`, a plain string compared
 * lexicographically (Figma re-keys to its canonical fractional index on paste,
 * so we only need values that sort in the intended order).
 *
 * We emit fixed-width strings over a contiguous, ascending ASCII range so plain
 * lexicographic order equals numeric (document) order regardless of sibling
 * count.
 */
const POS_START = 0x23; // '#'
const POS_COUNT = 90; // 0x23..0x7c, all printable, contiguous → sorts by code point

export function positionForIndex(index: number, total: number): string {
    const width = Math.max(1, Math.ceil(Math.log(Math.max(total, 1)) / Math.log(POS_COUNT)));
    let n = Math.max(0, Math.floor(index));
    let out = '';
    for (let i = 0; i < width; i++) {
        out = String.fromCharCode(POS_START + (n % POS_COUNT)) + out;
        n = Math.floor(n / POS_COUNT);
    }
    return out;
}
