import { describe, expect, it } from 'bun:test';
import { storageSha256Matches } from './storageHash';

// Actual local Convex metadata for the retained Stilta font.
const hex = '781667af198f583b9d78e2093a7d3693c462f5406768183c5591c0a3cd56bfb8';
const base64 = 'eBZnrxmPWDudeOIJOn02k8Ri9UBnaBg8VZHAo81Wv7g=';

describe('storage SHA-256 representations', () => {
    it('accepts the exact digest in current Base64 or legacy hex metadata', () => {
        expect(storageSha256Matches(base64, hex)).toBe(true);
        expect(storageSha256Matches(hex, hex)).toBe(true);
    });

    it('rejects different hashes and noncanonical encodings of the same bytes', () => {
        for (const stored of [hex.toUpperCase(), ` ${base64}`, `${base64}\n`, base64.slice(0, -1),
            `${base64}=`, base64.replace('7g=', '7h='), base64.replace('eB', 'fB'), '0'.repeat(64)]) {
            expect(storageSha256Matches(stored, hex)).toBe(false);
        }
        const allOnes = '/'.repeat(42) + '8=';
        expect(storageSha256Matches(allOnes, 'f'.repeat(64))).toBe(true);
        expect(storageSha256Matches(allOnes.replaceAll('/', '_'), 'f'.repeat(64))).toBe(false);
    });

    it('requires a complete lowercase hex manifest digest', () => {
        for (const expected of ['', hex.toUpperCase(), base64, hex.slice(1), `${hex}\n`, 'x'.repeat(64)]) {
            expect(storageSha256Matches(expected, expected)).toBe(false);
            expect(storageSha256Matches(base64, expected)).toBe(false);
        }
    });
});
