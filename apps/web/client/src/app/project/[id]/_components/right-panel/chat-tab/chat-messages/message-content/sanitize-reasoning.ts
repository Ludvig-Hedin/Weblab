/** Some providers (OpenRouter/Gemini) replace encrypted reasoning segments
 *  with a literal "[REDACTED]" marker. It's provider plumbing, not model
 *  output — showing it reads like a bug, so strip it before rendering. */
export const sanitizeReasoningText = (text: string): string =>
    text
        .replaceAll('[REDACTED]', '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
