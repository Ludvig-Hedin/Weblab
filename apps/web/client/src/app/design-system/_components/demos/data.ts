export interface TypographyRowData {
    label: string;
    className: string;
    sizeDefault: number;
    weightDefault: number;
    leadingDefault: string;
    trackingDefault: number;
}

export const TYPOGRAPHY_ROWS: TypographyRowData[] = [
    {
        label: 'title1',
        className: 'text-title1',
        sizeDefault: 2.25,
        weightDefault: 400,
        leadingDefault: 'auto',
        trackingDefault: 0,
    },
    {
        label: 'title2',
        className: 'text-title2',
        sizeDefault: 1.5,
        weightDefault: 400,
        leadingDefault: 'normal',
        trackingDefault: 0,
    },
    {
        label: 'title3',
        className: 'text-title3',
        sizeDefault: 1.25,
        weightDefault: 400,
        leadingDefault: 'normal',
        trackingDefault: 0,
    },
    {
        label: 'large-plus',
        className: 'text-large-plus',
        sizeDefault: 1,
        weightDefault: 500,
        leadingDefault: '1.4rem',
        trackingDefault: 0.02,
    },
    {
        label: 'large',
        className: 'text-large',
        sizeDefault: 1,
        weightDefault: 400,
        leadingDefault: '1.4rem',
        trackingDefault: 0.02,
    },
    {
        label: 'regular-plus',
        className: 'text-regular-plus',
        sizeDefault: 0.9375,
        weightDefault: 500,
        leadingDefault: '1.4rem',
        trackingDefault: 0.02,
    },
    {
        label: 'regular',
        className: 'text-regular',
        sizeDefault: 0.9375,
        weightDefault: 300,
        leadingDefault: '1.4rem',
        trackingDefault: 0.02,
    },
    {
        label: 'small-plus',
        className: 'text-small-plus',
        sizeDefault: 0.8125,
        weightDefault: 500,
        leadingDefault: '1.3rem',
        trackingDefault: 0,
    },
    {
        label: 'small',
        className: 'text-small',
        sizeDefault: 0.8125,
        weightDefault: 300,
        leadingDefault: '1.3rem',
        trackingDefault: 0,
    },
    {
        label: 'mini-plus',
        className: 'text-mini-plus',
        sizeDefault: 0.75,
        weightDefault: 500,
        leadingDefault: 'normal',
        trackingDefault: 0.01,
    },
    {
        label: 'mini',
        className: 'text-mini',
        sizeDefault: 0.75,
        weightDefault: 400,
        leadingDefault: 'normal',
        trackingDefault: 0.01,
    },
    {
        label: 'micro-plus',
        className: 'text-micro-plus',
        sizeDefault: 0.6875,
        weightDefault: 500,
        leadingDefault: 'normal',
        trackingDefault: 0.005,
    },
    {
        label: 'micro',
        className: 'text-micro',
        sizeDefault: 0.6875,
        weightDefault: 400,
        leadingDefault: 'normal',
        trackingDefault: 0.005,
    },
];

export function typoVars(label: string) {
    return [
        `--font-size-${label}`,
        `--font-weight-${label}`,
        `--font-leading-${label}`,
        `--font-tracking-${label}`,
    ];
}

export const SEMANTIC_TOKENS = [
    { name: 'background', cssVar: '--background', value: '20 14.3% 4.1%' },
    { name: 'foreground', cssVar: '--foreground', value: '60 9.1% 97.8%' },
    { name: 'primary', cssVar: '--primary', value: '60 9.1% 97.8%' },
    { name: 'primary-fg', cssVar: '--primary-foreground', value: '24 9.8% 10%' },
    { name: 'secondary', cssVar: '--secondary', value: '12 6.5% 15.1%' },
    { name: 'secondary-fg', cssVar: '--secondary-foreground', value: '60 9.1% 97.8%' },
    { name: 'muted', cssVar: '--muted', value: '12 6.5% 15.1%' },
    { name: 'muted-fg', cssVar: '--muted-foreground', value: '24 5.4% 63.9%' },
    { name: 'accent', cssVar: '--accent', value: '12 6.5% 15.1%' },
    { name: 'accent-fg', cssVar: '--accent-foreground', value: '60 9.1% 97.8%' },
    { name: 'destructive', cssVar: '--destructive', value: '0 72% 51%' },
    { name: 'border', cssVar: '--border', value: '0 0% 12%' },
    { name: 'input', cssVar: '--input', value: '12 6.5% 15.1%' },
    { name: 'ring', cssVar: '--ring', value: '24 5.7% 82.9%' },
    { name: 'card', cssVar: '--card', value: '20 14.3% 4.1%' },
    { name: 'popover', cssVar: '--popover', value: '20 14.3% 4.1%' },
];

export const FOREGROUND_TOKENS = [
    { name: 'foreground-primary', cssVar: '--foreground-primary', value: '0 0% 100%' },
    { name: 'foreground-secondary', cssVar: '--foreground-secondary', value: '0 0% 67%' },
    { name: 'foreground-tertiary', cssVar: '--foreground-tertiary', value: '0 0% 57%' },
    { name: 'foreground-brand', cssVar: '--foreground-brand', value: '205 100% 53%' },
    { name: 'foreground-positive', cssVar: '--foreground-positive', value: '203 100% 78%' },
    { name: 'foreground-success', cssVar: '--foreground-success', value: '206 100% 44%' },
    { name: 'foreground-warning', cssVar: '--foreground-warning', value: '206 100% 66%' },
    { name: 'background-brand', cssVar: '--background-brand', value: '206 100% 28%' },
    { name: 'background-secondary', cssVar: '--background-secondary', value: '0 0% 12%' },
    { name: 'background-tertiary', cssVar: '--background-tertiary', value: '0 0% 20%' },
    { name: 'background-success', cssVar: '--background-success', value: '208 100% 16%' },
    { name: 'background-warning', cssVar: '--background-warning', value: '206 100% 14%' },
    { name: 'border-success', cssVar: '--border-success', value: '206 100% 44%' },
    { name: 'border-warning', cssVar: '--border-warning', value: '206 100% 66%' },
];

export const CANVAS_EDITOR_TOKENS = [
    { name: 'background-canvas', cssVar: '--background-canvas', value: '0 0% 11%' },
    { name: 'background-chrome', cssVar: '--background-chrome', value: '0 0% 7%' },
    { name: 'background-bar', cssVar: '--background-bar', value: '0 0% 7%' },
    { name: 'background-bar-active', cssVar: '--background-bar-active', value: '0 0% 18%' },
    { name: 'background-tab-strip', cssVar: '--background-tab-strip', value: '0 0% 15%' },
    { name: 'background-tab-active', cssVar: '--background-tab-active', value: '0 0% 22%' },
    { name: 'border-canvas', cssVar: '--border-canvas', value: '0 0% 13%' },
    { name: 'border-bar', cssVar: '--border-bar', value: '0 0% 14%' },
    { name: 'border-tab-active', cssVar: '--border-tab-active', value: '0 0% 27%' },
    { name: 'border-tab-divider', cssVar: '--border-tab-divider', value: '0 0% 24%' },
];

export const PALETTE = [
    {
        label: 'Blue / Amber',
        colors: [
            { name: '100', value: '206 100% 94%' },
            { name: '200', value: '206 100% 78%' },
            { name: '300', value: '206 100% 66%' },
            { name: '400', value: '206 100% 53%' },
            { name: '500', value: '206 100% 44%' },
            { name: '600', value: '206 100% 35%' },
            { name: '700', value: '206 100% 28%' },
            { name: '800', value: '206 100% 20%' },
            { name: '900', value: '206 100% 14%' },
        ],
    },
    {
        label: 'Gray',
        colors: [
            { name: '50', value: '0 0% 100%' },
            { name: '100', value: '0 0% 78%' },
            { name: '200', value: '0 0% 67%' },
            { name: '300', value: '0 0% 57%' },
            { name: '400', value: '0 0% 47%' },
            { name: '500', value: '0 0% 38%' },
            { name: '600', value: '0 0% 29%' },
            { name: '700', value: '0 0% 20%' },
            { name: '800', value: '0 0% 12%' },
            { name: '900', value: '0 0% 10%' },
        ],
    },
    {
        label: 'Red',
        colors: [
            { name: '100', value: '0 93% 94%' },
            { name: '200', value: '0 96% 89%' },
            { name: '300', value: '0 94% 82%' },
            { name: '400', value: '0 91% 71%' },
            { name: '500', value: '0 84% 60%' },
            { name: '600', value: '0 72% 51%' },
            { name: '700', value: '0 74% 42%' },
            { name: '800', value: '0 70% 35%' },
            { name: '900', value: '0 63% 31%' },
        ],
    },
];

export const RADIUS_PRESETS = [
    { label: 'sharp', value: 0.1 },
    { label: 'default', value: 1 },
    { label: 'soft', value: 1.6 },
    { label: 'pill', value: 3 },
];

export const RADII = [
    { name: 'xs', value: '0.25rem', tailwind: 'rounded-xs' },
    { name: 'sm', value: '0.5rem', tailwind: 'rounded-sm' },
    { name: 'md', value: '0.75rem', tailwind: 'rounded-md' },
    { name: 'lg', value: '1rem', tailwind: 'rounded-lg' },
    { name: 'xl', value: '1.25rem', tailwind: 'rounded-xl' },
    { name: '2xl', value: '1.5rem', tailwind: 'rounded-2xl' },
    { name: '3xl', value: '2rem', tailwind: 'rounded-3xl' },
    { name: 'full', value: '9999px', tailwind: 'rounded-full' },
];

export const SPACING_DATA = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32];

export const WEBSITE_TYPOGRAPHY = [
    {
        label: 'heading-style-h1',
        className: 'heading-style-h1',
        size: '4xl → 7xl',
        note: 'Hero headline (one per page)',
    },
    {
        label: 'heading-style-h2',
        className: 'heading-style-h2',
        size: '4xl → 6xl',
        note: 'Major section headline',
    },
    {
        label: 'heading-style-h3',
        className: 'heading-style-h3',
        size: '3xl → 5xl',
        note: 'Section headline (medium)',
    },
    {
        label: 'heading-style-h4',
        className: 'heading-style-h4',
        size: '2xl → 4xl',
        note: 'Subsection / card title',
    },
    {
        label: 'heading-style-h5',
        className: 'heading-style-h5',
        size: 'xl',
        note: 'Small heading / large UI title',
    },
    {
        label: 'heading-style-h6',
        className: 'heading-style-h6',
        size: 'mini (uppercase)',
        note: 'Eyebrow / label',
    },
];

export const BODY_SCALE_RULES: Array<{ use: string; useThis: string; avoid: string }> = [
    {
        use: 'Long-form body paragraph',
        useThis: 'text-regular (light) or text-large (default body)',
        avoid: 'text-base, text-sm',
    },
    { use: 'Lead paragraph under heading', useThis: 'text-large', avoid: 'text-lg, text-xl' },
    {
        use: 'Caption / metadata',
        useThis: 'text-mini (or text-mini-plus for emphasis)',
        avoid: 'text-xs, text-[11px]',
    },
    {
        use: 'UI label (button, tab, badge)',
        useThis: 'text-small / text-small-plus',
        avoid: 'text-sm font-medium',
    },
    {
        use: 'Tiny system text (status, counts)',
        useThis: 'text-micro / text-micro-plus',
        avoid: 'text-[10px]',
    },
    {
        use: 'Editor-side section title',
        useThis: 'text-title2 / text-title3',
        avoid: 'raw text-xl, text-2xl',
    },
];
