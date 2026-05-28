import { describe, expect, it } from 'bun:test';

import { classifyProjectLoadError } from './classify-load-error';

describe('classifyProjectLoadError', () => {
    describe('invalid-id (F-131)', () => {
        it('classifies a Convex v.id() validator rejection as invalid-id', () => {
            // The exact shape Convex throws for a malformed document id.
            const msg =
                'ArgumentValidationError: Value does not match validator.\n' +
                'Path: .projectId\nValue: "abc"\nValidator: v.id("projects")';
            expect(classifyProjectLoadError(msg)).toBe('invalid-id');
        });

        it('matches the "does not match validator" phrase regardless of casing', () => {
            expect(classifyProjectLoadError('Value DOES NOT MATCH VALIDATOR')).toBe('invalid-id');
        });

        it('matches the bare ArgumentValidationError name', () => {
            expect(classifyProjectLoadError('argumentvalidationerror thrown')).toBe('invalid-id');
        });

        it('takes precedence over a "not found" substring in the same message', () => {
            // A validator error that also mentions "not found" must still be
            // classified as invalid-id, not not-found — invalid-id is checked
            // first by design.
            const msg =
                'ArgumentValidationError: project not found and value does not match validator';
            expect(classifyProjectLoadError(msg)).toBe('invalid-id');
        });
    });

    describe('forbidden', () => {
        it('classifies a forbidden error', () => {
            expect(classifyProjectLoadError('Forbidden: you lack access')).toBe('forbidden');
        });

        it('does not get swallowed by the unauthorized branch', () => {
            // "forbidden" is checked before "unauth"/"session"; a message with
            // only "forbidden" must resolve to forbidden.
            expect(classifyProjectLoadError('FORBIDDEN')).toBe('forbidden');
        });
    });

    describe('unauthorized', () => {
        it('classifies an unauthorized error', () => {
            expect(classifyProjectLoadError('Unauthorized request')).toBe('unauthorized');
        });

        it('classifies a session-expiry error', () => {
            expect(classifyProjectLoadError('Your session has expired')).toBe('unauthorized');
        });
    });

    describe('not-found', () => {
        it('classifies a "not found" error', () => {
            expect(classifyProjectLoadError('Project not found')).toBe('not-found');
        });

        it('classifies a "not_found" error code', () => {
            expect(classifyProjectLoadError('error: NOT_FOUND')).toBe('not-found');
        });
    });

    describe('unknown', () => {
        it('falls back to unknown for an unrecognized error', () => {
            expect(classifyProjectLoadError('Network request failed')).toBe('unknown');
        });

        it('falls back to unknown for an empty message', () => {
            expect(classifyProjectLoadError('')).toBe('unknown');
        });
    });
});
