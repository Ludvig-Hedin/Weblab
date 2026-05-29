import { describe, expect, it } from 'bun:test';

import { buildTxtRecord, getARecords, normalizeDomainInput, parseDomain } from './freestyle';

// Pure helpers behind the custom-domain connect/verify flow. They were
// previously untested even though `parseDomain`/`normalizeDomainInput` decide
// the apex dedup key and the persisted `fullDomain`, and `getARecords` decides
// the DNS records shown to the user.

describe('parseDomain', () => {
    it('splits a bare apex (subdomain is the empty string, not null, from tldts)', () => {
        expect(parseDomain('example.com')).toEqual({ apexDomain: 'example.com', subdomain: '' });
    });

    it('extracts the subdomain for www and deeper labels', () => {
        expect(parseDomain('www.example.com')).toEqual({
            apexDomain: 'example.com',
            subdomain: 'www',
        });
        expect(parseDomain('a.b.example.com')).toEqual({
            apexDomain: 'example.com',
            subdomain: 'a.b',
        });
    });

    it('normalizes case and strips protocol/port/path via tldts', () => {
        expect(parseDomain('EXAMPLE.COM').apexDomain).toBe('example.com');
        expect(parseDomain('https://example.com').apexDomain).toBe('example.com');
        expect(parseDomain('https://www.example.com:3000/path').apexDomain).toBe('example.com');
        expect(parseDomain('https://www.example.com:3000/path').subdomain).toBe('www');
    });

    it('handles multi-label PUBLIC suffixes (.co.uk) correctly', () => {
        expect(parseDomain('foo.co.uk')).toEqual({ apexDomain: 'foo.co.uk', subdomain: '' });
        expect(parseDomain('app.foo.co.uk')).toEqual({ apexDomain: 'foo.co.uk', subdomain: 'app' });
    });

    it('throws BAD_REQUEST on input with no registrable domain', () => {
        expect(() => parseDomain('')).toThrow(/BAD_REQUEST/);
        expect(() => parseDomain('localhost')).toThrow(/BAD_REQUEST/);
        expect(() => parseDomain('192.168.1.1')).toThrow(/BAD_REQUEST/);
        expect(() => parseDomain('not a domain')).toThrow(/BAD_REQUEST/);
    });

    it('documents that PRIVATE suffixes (github.io / vercel.app) are NOT treated as the apex', () => {
        // parse() is called without `allowPrivateDomains`, so PSL private
        // entries are not honored: the registrable domain is `label + ICANN
        // suffix`. The code comment in freestyle.ts claims these are split
        // "correctly via the PSL" — for ccTLDs like .co.uk that holds, but for
        // PRIVATE suffixes it does not. Pinned here so the discrepancy is
        // explicit and a future change to enable private domains fails loudly.
        expect(parseDomain('user.github.io')).toEqual({
            apexDomain: 'github.io',
            subdomain: 'user',
        });
        expect(parseDomain('myapp.vercel.app')).toEqual({
            apexDomain: 'vercel.app',
            subdomain: 'myapp',
        });
    });
});

describe('normalizeDomainInput', () => {
    it('lowercases and trims surrounding whitespace', () => {
        expect(normalizeDomainInput('  Example.com  ')).toBe('example.com');
        expect(normalizeDomainInput('MyDomain.COM')).toBe('mydomain.com');
    });

    it('strips protocol, port, and path from a pasted URL', () => {
        expect(normalizeDomainInput('HTTPS://WWW.Example.com:3000/path?q=1')).toBe(
            'www.example.com',
        );
        expect(normalizeDomainInput('http://example.com/')).toBe('example.com');
    });

    it('leaves an already-clean hostname unchanged and is idempotent', () => {
        expect(normalizeDomainInput('mydomain.com')).toBe('mydomain.com');
        const once = normalizeDomainInput('HTTPS://WWW.Example.com/x');
        expect(normalizeDomainInput(once)).toBe(once);
    });

    it('falls back to trim+lowercase when tldts cannot derive a hostname', () => {
        // No hostname extractable -> manual fallback (still flows to parseDomain
        // downstream, which throws BAD_REQUEST for genuinely invalid input).
        expect(normalizeDomainInput('  NOPE  ')).toBe('nope');
    });
});

describe('getARecords', () => {
    it('returns @ and www A records for an apex (null subdomain)', () => {
        const records = getARecords(null);
        expect(records).toHaveLength(2);
        expect(records.map((r) => r.name)).toEqual(['@', 'www']);
        expect(records.every((r) => r.type === 'A')).toBe(true);
        expect(records.every((r) => r.verified === false)).toBe(true);
        // Both apex records point at the same Freestyle IP.
        expect(records[0]!.value).toBeTruthy();
        expect(records[0]!.value).toBe(records[1]!.value);
    });

    it('treats the empty string as apex (falsy) — does not emit a record named ""', () => {
        const records = getARecords('');
        expect(records).toHaveLength(2);
        expect(records.map((r) => r.name)).toEqual(['@', 'www']);
    });

    it('returns a single A record named after a real subdomain', () => {
        expect(getARecords('www')).toEqual([
            { type: 'A', name: 'www', value: expect.any(String), verified: false },
        ]);
        const deep = getARecords('app.staging');
        expect(deep).toHaveLength(1);
        expect(deep[0]!.name).toBe('app.staging');
    });
});

describe('buildTxtRecord', () => {
    it('builds an unverified TXT record carrying the verification code verbatim', () => {
        const rec = buildTxtRecord('verify-code-123');
        expect(rec.type).toBe('TXT');
        expect(rec.value).toBe('verify-code-123');
        expect(rec.verified).toBe(false);
        expect(typeof rec.name).toBe('string');
        expect(rec.name.length).toBeGreaterThan(0);
    });
});
