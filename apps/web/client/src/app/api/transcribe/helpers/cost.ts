// Whisper transcription cost estimate for the AI spend safeguards.
//
// OpenAI bills whisper-1 at $0.006 per audio minute. The route asks for plain
// `json` (text only, no duration) because the OpenRouter fallback may not
// support `verbose_json`, so estimate the duration from the upload size.
// 4 KB/s ≈ 32 kbps, the low end of browser MediaRecorder Opus output — a low
// assumed bitrate over-estimates minutes, which is the safe side for a cap.

export const WHISPER_USD_PER_MINUTE = 0.006;
const ASSUMED_BYTES_PER_SECOND = 4_000;

export function estimateWhisperCostUsd(audioBytes: number): number {
    if (!(audioBytes > 0)) return 0;
    const seconds = Math.max(1, Math.ceil(audioBytes / ASSUMED_BYTES_PER_SECOND));
    return (seconds / 60) * WHISPER_USD_PER_MINUTE;
}
