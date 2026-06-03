import { describe, expect, it } from 'bun:test';

import { CloneOutputFramework } from '@weblab/models';

import { capScrapedContent, MAX_SCRAPE_CHARS, toFrameworkLiteral } from './clone-prompt';

describe('toFrameworkLiteral', () => {
    it('maps NEXTJS to the nextjs literal', () => {
        expect(toFrameworkLiteral(CloneOutputFramework.NEXTJS)).toBe('nextjs');
    });

    it('maps STATIC_HTML to the static-html literal', () => {
        expect(toFrameworkLiteral(CloneOutputFramework.STATIC_HTML)).toBe('static-html');
    });
});

describe('capScrapedContent', () => {
    it('returns empty, not-truncated for null/undefined', () => {
        expect(capScrapedContent(null)).toEqual({ content: '', truncated: false });
        expect(capScrapedContent(undefined)).toEqual({ content: '', truncated: false });
    });

    it('passes short content through untouched', () => {
        const short = 'hello world';
        expect(capScrapedContent(short)).toEqual({ content: short, truncated: false });
    });

    it('does not truncate content exactly at the cap', () => {
        const exact = 'a'.repeat(MAX_SCRAPE_CHARS);
        const result = capScrapedContent(exact);
        expect(result.truncated).toBe(false);
        expect(result.content.length).toBe(MAX_SCRAPE_CHARS);
    });

    it('truncates over-cap content to exactly the cap and flags it', () => {
        const tooLong = 'a'.repeat(MAX_SCRAPE_CHARS + 500);
        const result = capScrapedContent(tooLong);
        expect(result.truncated).toBe(true);
        expect(result.content.length).toBe(MAX_SCRAPE_CHARS);
    });
});
