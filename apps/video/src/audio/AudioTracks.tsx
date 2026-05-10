import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';

import type { SfxCue } from './tracks';
import { SFX_FILES, STORYBOARD_C_CUES } from './tracks';

export interface AudioTracksProps {
    compositionFrames: number;
    cues?: readonly SfxCue[];
    /** Music peak volume (0..1). Default 0.30 (lower so it sits behind SFX). */
    musicVolume?: number;
    /** Frames over which music ramps in/out. Default 60. */
    musicRamp?: number;
    /** SFX bed length in frames. Trimmed via `endAt` so each SFX hits ≤8 frames. */
    sfxLengthFrames?: number;
    /**
     * Music playback rate. >1 = faster + higher pitch (catchier). Default
     * 1.20 — speeds the existing music-groove track up ~20% so it feels
     * punchy instead of slow.
     */
    musicPlaybackRate?: number;
}

/**
 * Mounts the music bed for the whole composition (with linear fade-in and
 * fade-out) plus each SFX cue as a `<Sequence>`-anchored `<Audio>` mount,
 * so each SFX fires at its composition-global frame.
 *
 * SFX trimming: each SFX is mounted for ≤8 frames via `endAt` so click /
 * keypress hits never drone. `success` runs slightly longer for the
 * end-plate.
 */
export const AudioTracks: React.FC<AudioTracksProps> = ({
    compositionFrames,
    cues = STORYBOARD_C_CUES,
    musicVolume = 0.3,
    musicRamp = 60,
    sfxLengthFrames = 8,
    musicPlaybackRate = 1.2,
}) => {
    const tailStart = compositionFrames - musicRamp;
    return (
        <>
            <Sequence from={0} durationInFrames={compositionFrames}>
                <Audio
                    src={staticFile(SFX_FILES.music)}
                    playbackRate={musicPlaybackRate}
                    volume={(frame: number): number => {
                        if (frame < musicRamp) {
                            return (frame / musicRamp) * musicVolume;
                        }
                        if (frame > tailStart) {
                            const t = (compositionFrames - frame) / musicRamp;
                            return Math.max(0, t * musicVolume);
                        }
                        return musicVolume;
                    }}
                />
            </Sequence>
            {cues.map((cue, i) => {
                const isSuccess = cue.sound === 'success';
                const length = isSuccess ? 36 : sfxLengthFrames;
                return (
                    <Sequence
                        key={`${cue.sound}-${cue.at}-${i}`}
                        from={cue.at}
                        durationInFrames={length}
                    >
                        <Audio
                            src={staticFile(SFX_FILES[cue.sound])}
                            volume={cue.volume ?? 0.4}
                            endAt={length}
                        />
                    </Sequence>
                );
            })}
        </>
    );
};
