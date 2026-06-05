import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Weblab's design system defines custom font-size utilities (text-micro, text-mini,
// text-small, text-regular, text-large, text-title1…3 and their `Plus` variants) in
// packages/ui/tokens.ts. tailwind-merge's default config doesn't recognise these as
// font sizes, so it lumps them into the same `text-*` bucket as text-color utilities
// (text-white, text-foreground, …). When both appear in one cn() call it treats them
// as conflicting and silently drops the earlier class — e.g.
//   cn('text-white', 'text-small')  ->  'text-small'   (color lost)
// That left the primary <Button> default variant (`bg-[#0d0d0d] text-white … text-small`)
// with no text color in light theme, rendering an invisible dark-on-dark label.
// Registering the custom sizes under the `font-size` group keeps them in a separate
// group from `text-color`, so size + color coexist instead of clobbering each other.
const CUSTOM_FONT_SIZES = [
    'title1',
    'title2',
    'title3',
    'largePlus',
    'large',
    'regularPlus',
    'regular',
    'smallPlus',
    'small',
    'miniPlus',
    'mini',
    'microPlus',
    'micro',
];

const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ text: CUSTOM_FONT_SIZES }],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
