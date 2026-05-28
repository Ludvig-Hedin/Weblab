// Utility to clear client-side telemetry identities on logout.
// Safe to call even if PostHog/Gleap aren't loaded; both use dynamic import
// so neither SDK is pulled into the critical-path bundle pre-consent.
export async function resetTelemetry(): Promise<void> {
    try {
        const mod = await import('posthog-js');
        const posthog = mod.default ?? mod;
        posthog?.reset();
    } catch {
        // ignore if PostHog isn't loaded
    }
    try {
        const mod = await import('gleap');
        const Gleap = mod.default ?? mod;
        Gleap?.clearIdentity();
    } catch {
        // ignore if Gleap isn't present
    }
}

// Opens the Gleap widget if available.
export async function openFeedbackWidget(): Promise<void> {
    try {
        const mod = await import('gleap');
        const Gleap = mod.default ?? mod;
        if (Gleap?.open) {
            Gleap?.open();
        }
    } catch {
        // ignore if Gleap isn't present
    }
}
