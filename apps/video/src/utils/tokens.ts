/**
 * Remotion-friendly subset of Weblab tokens. Mirrors values that already
 * exist in `packages/ui/tokens.ts` and `packages/ui/src/globals.css`.
 * Never introduce new colors here — every value below appears in the
 * shared token palette.
 *
 * The @weblab/ui workspace package is intentionally NOT imported as a
 * direct dependency. tsc would descend into its source files (the package
 * is symlinked, not in node_modules) and surface unrelated cross-version
 * React typing errors. Mirroring the small slice we need keeps the video
 * workspace self-contained.
 *
 * Color values traced to dark-theme entries in
 * `packages/ui/src/globals.css`:
 *   - background       <- --background       (0 0% 7%   #121212  L580 area)
 *   - background-canvas (canvas)             <- --background-canvas (0 0% 11% #1B1B1B  L580)
 *   - surface (chrome) <- --background-chrome (0 0% 7%  #121212  L581)
 *   - surfaceElevated  <- --background-tab-active (0 0% 22% #383838 L585)
 *   - border           <- --border-bar (0 0% 14%   #232323  L587)
 *   - borderSubtle     <- --background-bar-active (0 0% 18% #2D2D2D L583)
 *   - textPrimary      <- --foreground-primary (0 0% 100% #FFFFFF L542)
 *   - textSecondary    <- --foreground-secondary (0 0% 67% #ABABAB L543)
 *   - textMuted        <- --foreground-tertiary (0 0% 57%  #919191 L544)
 *   - textDisabled     <- --foreground-quadranary (0 0% 38% #616161 L545)
 *   - blue / blueSoft  <- amber-500 / amber-300 from light tokens (L335 / L333)
 *   - purple / purpleSoft <- secondary brand purple from `np` tokens (L240 / L246)
 */
export const palette = {
    background: '#121212',
    backgroundCanvas: '#1B1B1B',
    surface: '#121212',
    surfaceElevated: '#1E1E1E',
    surfaceTabStrip: '#262626',
    surfaceActive: '#2D2D2D',
    border: '#232323',
    borderSubtle: '#1A1A1A',
    borderTabActive: '#454545',
    textPrimary: '#FFFFFF',
    textSecondary: '#ABABAB',
    textMuted: '#919191',
    textDisabled: '#616161',
    blue: '#0081DE',
    blueSoft: '#53B8FF',
    purple: '#920EFF',
    purpleSoft: '#C174FF',
} as const;

export const radii = {
    xs: 4,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
} as const;

export const fontStack =
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
