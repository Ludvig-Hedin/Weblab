import { describe, expect, test } from 'bun:test';

import {
    isFrameBridgeReady,
    shouldUnlockCodeSandboxPreview,
} from '@/app/project/[id]/_components/canvas/frame/frame-connection';

describe('isFrameBridgeReady', () => {
    test('returns true only when preload and Penpal are both ready', () => {
        expect(
            isFrameBridgeReady({
                preloadScriptReady: true,
                isConnecting: false,
                hasTimedOut: false,
                isPenpalConnected: true,
            }),
        ).toBe(true);
    });

    test('returns false while Penpal is still disconnected', () => {
        expect(
            isFrameBridgeReady({
                preloadScriptReady: true,
                isConnecting: false,
                hasTimedOut: false,
                isPenpalConnected: false,
            }),
        ).toBe(false);
    });

    test('returns false while the sandbox is still connecting', () => {
        expect(
            isFrameBridgeReady({
                preloadScriptReady: true,
                isConnecting: true,
                hasTimedOut: false,
                isPenpalConnected: true,
            }),
        ).toBe(false);
    });

    test('returns true after the slow-connect timeout has elapsed and Penpal is connected', () => {
        expect(
            isFrameBridgeReady({
                preloadScriptReady: true,
                isConnecting: true,
                hasTimedOut: true,
                isPenpalConnected: true,
            }),
        ).toBe(true);
    });
});

describe('shouldUnlockCodeSandboxPreview', () => {
    test('returns true once a disconnected CodeSandbox preview has failed enough times', () => {
        expect(
            shouldUnlockCodeSandboxPreview({
                isCodeSandboxFrame: true,
                isPenpalConnected: false,
                connectionFailureCount: 2,
                isFirstCreation: false,
            }),
        ).toBe(true);
    });

    test('returns false during the initial connection attempt', () => {
        // Even though the frame is a disconnected CodeSandbox preview, no
        // handshake has failed yet — auto-unlocking here would flip every
        // freshly-loaded project into PREVIEW for the cold-boot window.
        expect(
            shouldUnlockCodeSandboxPreview({
                isCodeSandboxFrame: true,
                isPenpalConnected: false,
                connectionFailureCount: 0,
                isFirstCreation: false,
            }),
        ).toBe(false);
    });

    test('returns false during a fresh project creation', () => {
        // The AI is still writing the first version; the user is meant
        // to wait in DESIGN mode behind the loader rather than land on
        // a half-built preview.
        expect(
            shouldUnlockCodeSandboxPreview({
                isCodeSandboxFrame: true,
                isPenpalConnected: false,
                connectionFailureCount: 5,
                isFirstCreation: true,
            }),
        ).toBe(false);
    });

    test('returns false once the CodeSandbox preview bridge is connected', () => {
        expect(
            shouldUnlockCodeSandboxPreview({
                isCodeSandboxFrame: true,
                isPenpalConnected: true,
                connectionFailureCount: 0,
                isFirstCreation: false,
            }),
        ).toBe(false);
    });

    test('returns false for non-CodeSandbox previews', () => {
        expect(
            shouldUnlockCodeSandboxPreview({
                isCodeSandboxFrame: false,
                isPenpalConnected: false,
                connectionFailureCount: 5,
                isFirstCreation: false,
            }),
        ).toBe(false);
    });
});
