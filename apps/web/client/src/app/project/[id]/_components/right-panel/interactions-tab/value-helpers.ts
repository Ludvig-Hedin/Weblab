import type { NumericUnit, NumericValue } from '@weblab/models';

const VALID_UNITS: ReadonlyArray<NumericUnit> = [
    'px',
    '%',
    'rem',
    'em',
    'deg',
    'rad',
    'turn',
    'none',
];

export function formatNumeric(v: NumericValue | undefined, fallbackUnit: NumericUnit): string {
    if (!v) return '';
    const unit = v.unit === 'none' ? '' : v.unit;
    return `${v.value}${unit || fallbackUnit}`;
}

export function parseNumeric(input: string, defaultUnit: NumericUnit): NumericValue | undefined {
    const trimmed = input.trim();
    if (trimmed === '') return undefined;
    const match = /^([-+]?[0-9]*\.?[0-9]+)([a-zA-Z%]*)$/.exec(trimmed);
    if (!match) return undefined;
    const value = Number.parseFloat(match[1] ?? '0');
    const unitToken = (match[2] ?? '').toLowerCase();
    const unit = VALID_UNITS.find((u) => u === unitToken) ?? defaultUnit;
    return { value, unit };
}

export function clampNumber(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}
