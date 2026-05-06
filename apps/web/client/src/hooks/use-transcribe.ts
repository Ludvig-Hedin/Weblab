'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type TranscribeState = 'idle' | 'recording' | 'transcribing' | 'error';

interface UseTranscribeOptions {
    /** Called when a transcription completes successfully. */
    onTranscript: (text: string) => void;
    /** Called when something goes wrong (permissions denied, upload failed, etc). */
    onError?: (error: Error) => void;
    /** Optional ISO-639-1 language hint. Whisper auto-detects when omitted. */
    language?: string;
    /** Hard cap on recording length (ms). Defaults to 2 minutes. */
    maxDurationMs?: number;
}

interface UseTranscribeReturn {
    state: TranscribeState;
    /** Milliseconds the current recording has been running. 0 when idle. */
    elapsedMs: number;
    /** Begin recording. No-op if not idle. */
    start: () => Promise<void>;
    /** Stop recording and upload for transcription. */
    stop: () => Promise<void>;
    /** Cancel an in-flight recording without uploading. */
    cancel: () => void;
    /** Whether the browser supports the APIs we need. */
    isSupported: boolean;
}

const TRANSCRIBE_ENDPOINT = '/api/transcribe';
const DEFAULT_MAX_DURATION_MS = 2 * 60 * 1000;

/**
 * Picks a MediaRecorder mime type the current browser supports, falling back
 * cleanly across Chrome/Firefox (webm/opus) and Safari (mp4/aac).
 *
 * Returns both the mime type to feed MediaRecorder and the file extension that
 * matches it, so Whisper can route by extension.
 */
function pickAudioFormat(): { mimeType: string; extension: string } | null {
    if (typeof MediaRecorder === 'undefined') return null;

    const candidates: { mimeType: string; extension: string }[] = [
        { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
        { mimeType: 'audio/webm', extension: 'webm' },
        { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
        { mimeType: 'audio/mp4', extension: 'm4a' },
        { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
    ];

    for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
    }
    // No candidate matched. Don't pretend it's webm — the actual browser-default
    // format will be detected post-recording from the resulting Blob's `type`.
    console.warn('[useTranscribe] No supported audio mime type detected; using browser default.');
    return { mimeType: '', extension: '' };
}

const MIME_TO_EXTENSION: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
};

function extensionFromBlob(blob: Blob, fallback: string): string {
    if (fallback) return fallback;
    const baseType = (blob.type || '').split(';')[0]!.trim().toLowerCase();
    return MIME_TO_EXTENSION[baseType] ?? 'webm';
}

export function useTranscribe({
    onTranscript,
    onError,
    language,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
}: UseTranscribeOptions): UseTranscribeReturn {
    const [state, setState] = useState<TranscribeState>('idle');
    const [elapsedMs, setElapsedMs] = useState(0);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const formatRef = useRef<{ mimeType: string; extension: string } | null>(null);
    const startedAtRef = useRef<number>(0);
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelledRef = useRef(false);

    const isSupported =
        typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined';

    const cleanupStream = useCallback(() => {
        if (tickerRef.current) {
            clearInterval(tickerRef.current);
            tickerRef.current = null;
        }
        if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current);
            maxDurationTimerRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        recorderRef.current = null;
        setElapsedMs(0);
    }, []);

    const reportError = useCallback(
        (err: unknown, fallback: string) => {
            const error = err instanceof Error ? err : new Error(fallback);
            console.error('[useTranscribe]', error);
            setState('error');
            onError?.(error);
            // Auto-reset back to idle after a brief moment so the UI doesn't
            // get stuck in an error visual. Tracked in a ref so we can cancel
            // it on unmount and avoid setState-on-unmounted warnings.
            if (errorResetTimerRef.current) {
                clearTimeout(errorResetTimerRef.current);
            }
            errorResetTimerRef.current = setTimeout(() => {
                setState((prev) => (prev === 'error' ? 'idle' : prev));
                errorResetTimerRef.current = null;
            }, 2000);
        },
        [onError],
    );

    const uploadAndTranscribe = useCallback(
        async (blob: Blob, extension: string) => {
            const form = new FormData();
            const file = new File([blob], `recording.${extension}`, {
                type: blob.type || `audio/${extension}`,
            });
            form.append('file', file);
            if (language) form.append('language', language);

            const response = await fetch(TRANSCRIBE_ENDPOINT, {
                method: 'POST',
                body: form,
            });

            if (!response.ok) {
                let message = `Transcription failed (${response.status})`;
                try {
                    const data = (await response.json()) as { error?: string };
                    if (data?.error) message = data.error;
                } catch {
                    // ignore JSON parse failure
                }
                throw new Error(message);
            }

            const data = (await response.json()) as { text?: string };
            return (data.text ?? '').trim();
        },
        [language],
    );

    const start = useCallback(async () => {
        if (state !== 'idle') return;
        if (!isSupported) {
            reportError(new Error('Voice input is not supported in this browser.'), 'unsupported');
            return;
        }

        const format = pickAudioFormat();
        if (!format) {
            reportError(new Error('Voice input is not supported in this browser.'), 'unsupported');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = format.mimeType
                ? new MediaRecorder(stream, { mimeType: format.mimeType })
                : new MediaRecorder(stream);

            cancelledRef.current = false;
            chunksRef.current = [];
            formatRef.current = format;
            streamRef.current = stream;
            recorderRef.current = recorder;

            recorder.addEventListener('dataavailable', (event) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            });

            recorder.addEventListener('stop', async () => {
                const wasCancelled = cancelledRef.current;
                const chunks = chunksRef.current;
                const fmt = formatRef.current;
                chunksRef.current = [];
                cleanupStream();

                if (wasCancelled || chunks.length === 0 || !fmt) {
                    setState('idle');
                    return;
                }

                setState('transcribing');
                try {
                    const blob = new Blob(chunks, {
                        type: fmt.mimeType || (fmt.extension ? `audio/${fmt.extension}` : ''),
                    });
                    // If we fell back to the browser default, pick the extension
                    // from the actual resulting blob.type rather than assuming webm.
                    const extension = extensionFromBlob(blob, fmt.extension);
                    const text = await uploadAndTranscribe(blob, extension);
                    if (text) onTranscript(text);
                    setState('idle');
                } catch (err) {
                    reportError(err, 'Transcription failed');
                }
            });

            recorder.start();
            startedAtRef.current = Date.now();
            setElapsedMs(0);
            setState('recording');

            tickerRef.current = setInterval(() => {
                setElapsedMs(Date.now() - startedAtRef.current);
            }, 100);

            maxDurationTimerRef.current = setTimeout(() => {
                if (recorderRef.current?.state === 'recording') {
                    recorderRef.current.stop();
                }
            }, maxDurationMs);
        } catch (err) {
            cleanupStream();
            const error =
                err instanceof DOMException && err.name === 'NotAllowedError'
                    ? new Error('Microphone permission denied. Enable it in your browser settings.')
                    : err;
            reportError(error, 'Could not access the microphone.');
        }
    }, [
        state,
        isSupported,
        cleanupStream,
        maxDurationMs,
        onTranscript,
        reportError,
        uploadAndTranscribe,
    ]);

    const stop = useCallback(async () => {
        const recorder = recorderRef.current;
        if (recorder?.state !== 'recording') return;
        cancelledRef.current = false;
        recorder.stop();
    }, []);

    const cancel = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder?.state === 'recording') {
            cancelledRef.current = true;
            recorder.stop();
        } else {
            cleanupStream();
            setState('idle');
        }
    }, [cleanupStream]);

    // Always release the mic on unmount.
    useEffect(() => {
        return () => {
            if (errorResetTimerRef.current) {
                clearTimeout(errorResetTimerRef.current);
                errorResetTimerRef.current = null;
            }
            const recorder = recorderRef.current;
            if (recorder?.state === 'recording') {
                cancelledRef.current = true;
                try {
                    recorder.stop();
                } catch {
                    // ignore
                }
            }
            cleanupStream();
        };
    }, [cleanupStream]);

    return { state, elapsedMs, start, stop, cancel, isSupported };
}
