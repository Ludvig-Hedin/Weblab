/**
 * Audio mount manifest. The `<Audio>` elements are mounted from each
 * Storyboard composition via `<AudioTracks />`. We expose the SFX trigger
 * frames here so any scene can reference them by name.
 *
 * SFX policy (enforced by the cue lists below):
 *   - `click`     — fires only when the cursor visibly clicks a target,
 *                   volume 0.45.
 *   - `keypress`  — fires per character batch when text is typing on
 *                   screen, volume 0.18.
 *   - `success`   — fires AT MOST ONCE per video, on the final brand
 *                   reveal, volume 0.4.
 *   - everything else (`hover`, `whoosh`, `tick`, `ding`) is BANNED for any
 *     decorative/ambient use. We keep the file list intact so old cue lists
 *     don't crash if anything still references them, but no cue array in
 *     this file ever queues them.
 */

export const SFX_FILES = {
    music: 'audio/music-groove.mp3',
    click: 'audio/sfx-click.mp3',
    keypress: 'audio/sfx-keypress.mp3',
    success: 'audio/sfx-success.mp3',
    // Retained for legacy references only. Never queue these into a cue list.
    hover: 'audio/sfx-hover.mp3',
    ding: 'audio/sfx-ding.mp3',
    tick: 'audio/sfx-tick.mp3',
    whoosh: 'audio/sfx-whoosh.mp3',
} as const;

export type AllowedSfx = 'click' | 'keypress' | 'success';

export interface SfxCue {
    /** Composition-global frame at which the SFX fires. */
    at: number;
    sound: AllowedSfx;
    /** 0..1 volume. */
    volume?: number;
}

export const SFX_VOL = {
    click: 0.45,
    keypress: 0.18,
    success: 0.4,
} as const;

/**
 * Build a list of keypress cues, one per `count`, spaced `gap` frames apart
 * starting at `start`. Volume default matches `SFX_VOL.keypress`.
 */
export const keypressBurst = (
    start: number,
    count: number,
    gap = 8,
    volume: number = SFX_VOL.keypress,
): SfxCue[] =>
    Array.from({ length: count }, (_, i) => ({
        at: start + i * gap,
        sound: 'keypress' as const,
        volume,
    }));

/**
 * Storyboard C — 90s. Click cues match cursor click frames in scenes.
 * Keypress cues match typing frames. One success at the brand reveal.
 */
export const STORYBOARD_C_CUES: readonly SfxCue[] = [
    // Scene 1 (0-180): hook headline types in (8 keypress hits).
    ...keypressBurst(36, 8, 14),
    // Scene 5 (1200-1800): user clicks composer, types prompt, sends.
    { at: 1340, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(1420, 6, 16),
    { at: 1500, sound: 'click', volume: SFX_VOL.click }, // send
    // Scene 6 (1800-2280): user clicks tablet breakpoint, then edits inline.
    { at: 1900, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(2000, 6, 12),
    // Scene 7 (2280-2880): user clicks Components icon, then a card.
    { at: 2360, sound: 'click', volume: SFX_VOL.click },
    { at: 2520, sound: 'click', volume: SFX_VOL.click },
    // Scene 8 (2880-3300): import URL — click + 5 keypress.
    { at: 2960, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(3000, 5, 10),
    // Scene 10 (3720-4200): click chevron to view code.
    { at: 3820, sound: 'click', volume: SFX_VOL.click },
    // Scene 11 (4200-4800): click Publish.
    { at: 4640, sound: 'click', volume: SFX_VOL.click },
    // Scene 12 (4800-5400): brand reveal — single success.
    { at: 5040, sound: 'success', volume: SFX_VOL.success },
];

/** Storyboard A — 75s. */
export const STORYBOARD_A_CUES: readonly SfxCue[] = [
    ...keypressBurst(36, 8, 14),
    { at: 1140, sound: 'click', volume: SFX_VOL.click },
    { at: 1390, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(1410, 5, 12),
    { at: 2370, sound: 'click', volume: SFX_VOL.click },
    { at: 3960, sound: 'success', volume: SFX_VOL.success },
];

/** Storyboard B — 90s. */
export const STORYBOARD_B_CUES: readonly SfxCue[] = [
    ...keypressBurst(60, 6, 14),
    { at: 240, sound: 'click', volume: SFX_VOL.click },
    { at: 1080, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(1120, 5, 14),
    { at: 1900, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(1940, 5, 14),
    { at: 2820, sound: 'click', volume: SFX_VOL.click },
    { at: 3000, sound: 'click', volume: SFX_VOL.click },
    { at: 3700, sound: 'click', volume: SFX_VOL.click },
    { at: 4620, sound: 'click', volume: SFX_VOL.click },
    { at: 5180, sound: 'success', volume: SFX_VOL.success },
];

/** Storyboard D — 90s. */
export const STORYBOARD_D_CUES: readonly SfxCue[] = [
    ...keypressBurst(60, 6, 14),
    { at: 600, sound: 'click', volume: SFX_VOL.click },
    { at: 1500, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(1540, 5, 14),
    { at: 1640, sound: 'click', volume: SFX_VOL.click },
    { at: 2640, sound: 'click', volume: SFX_VOL.click },
    { at: 3540, sound: 'click', volume: SFX_VOL.click },
    { at: 4440, sound: 'click', volume: SFX_VOL.click },
    { at: 5180, sound: 'success', volume: SFX_VOL.success },
];

/** Storyboard E — 105s. */
export const STORYBOARD_E_CUES: readonly SfxCue[] = [
    ...keypressBurst(120, 6, 14),
    { at: 900, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(940, 5, 14),
    { at: 3060, sound: 'click', volume: SFX_VOL.click },
    { at: 3300, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(3340, 5, 14),
    { at: 3460, sound: 'click', volume: SFX_VOL.click },
    { at: 4860, sound: 'click', volume: SFX_VOL.click },
    { at: 6080, sound: 'success', volume: SFX_VOL.success },
];

/**
 * Focus F1 — 45s. Pace beats per spec:
 *   - Attach click ~ frame 240
 *   - Type prompt 540–900 (across ~6 word boundaries)
 *   - Send click ~ frame 960
 *   - End plate success at 2580
 */
export const FOCUS_F1_CUES: readonly SfxCue[] = [
    { at: 240, sound: 'click', volume: SFX_VOL.click },
    ...keypressBurst(560, 6, 50),
    { at: 960, sound: 'click', volume: SFX_VOL.click },
    { at: 2580, sound: 'success', volume: SFX_VOL.success },
];

/**
 * Focus F2 — 45s. Direct manipulation: drag, change font size, color,
 * breakpoint. Click-only SFX.
 */
export const FOCUS_F2_CUES: readonly SfxCue[] = [
    { at: 220, sound: 'click', volume: SFX_VOL.click }, // pick hero
    { at: 380, sound: 'click', volume: SFX_VOL.click }, // drop
    { at: 600, sound: 'click', volume: SFX_VOL.click }, // font size
    { at: 760, sound: 'click', volume: SFX_VOL.click }, // value
    { at: 960, sound: 'click', volume: SFX_VOL.click }, // open color
    { at: 1140, sound: 'click', volume: SFX_VOL.click }, // pick color
    { at: 1440, sound: 'click', volume: SFX_VOL.click }, // breakpoint
    { at: 2580, sound: 'success', volume: SFX_VOL.success },
];

/**
 * Focus F3 — 45s. Project creation flow: open dialog, type URL, confirm.
 */
export const FOCUS_F3_CUES: readonly SfxCue[] = [
    { at: 260, sound: 'click', volume: SFX_VOL.click }, // open new project
    ...keypressBurst(620, 7, 36), // type URL
    { at: 980, sound: 'click', volume: SFX_VOL.click }, // confirm
    { at: 2580, sound: 'success', volume: SFX_VOL.success },
];
