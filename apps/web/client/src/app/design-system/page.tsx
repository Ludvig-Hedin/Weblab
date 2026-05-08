'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { APP_NAME } from '@weblab/constants';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@weblab/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@weblab/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Badge } from '@weblab/ui/badge';
import { BrandLogo, BrandWordmark } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@weblab/ui/card';
import { Checkbox } from '@weblab/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@weblab/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Progress } from '@weblab/ui/progress';
import { RadioGroup, RadioGroupItem } from '@weblab/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Separator } from '@weblab/ui/separator';
import { Skeleton } from '@weblab/ui/skeleton';
import { Slider } from '@weblab/ui/slider';
import { Switch } from '@weblab/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Textarea } from '@weblab/ui/textarea';
import { Toggle } from '@weblab/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type TokenOverrides = Record<string, string>;

interface TypographyRowData {
    label: string;
    className: string;
    sizeDefault: number; // rem
    weightDefault: number;
    leadingDefault: string;
    trackingDefault: number; // rem
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'weblab-ds-overrides';

function loadOverrides(): TokenOverrides {
    try {
        if (typeof window === 'undefined') return {};
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as TokenOverrides) : {};
    } catch {
        return {};
    }
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function hslToHex(hsl: string): string {
    try {
        const parts = hsl
            .trim()
            .split(/[\s,]+/)
            .map(Number);
        if (parts.length < 3 || parts.some(isNaN)) return '#888888';
        const [h, s, l] = parts;
        const sl = (s ?? 50) / 100;
        const ll = (l ?? 50) / 100;
        const a = sl * Math.min(ll, 1 - ll);
        const f = (n: number) => {
            const k = (n + (h ?? 0) / 30) % 12;
            const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color)
                .toString(16)
                .padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    } catch {
        return '#888888';
    }
}

function hexToHsl(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0 0% 50%';
    const r = parseInt(result[1]!, 16) / 255;
    const g = parseInt(result[2]!, 16) / 255;
    const b = parseInt(result[3]!, 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
    title,
    tag,
    filePath,
    children,
    controls,
    className,
    editedCount,
}: {
    title: string;
    tag?: string;
    filePath?: string;
    children: React.ReactNode;
    controls?: React.ReactNode;
    className?: string;
    editedCount?: number;
}) {
    const editUrl = filePath ? `cursor://file${filePath}` : undefined;

    return (
        <section
            className={cn('mb-12 scroll-mt-20', className)}
            id={title.toLowerCase().replace(/\s+/g, '-')}
        >
            <div className="group/section mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {tag && (
                        <span className="bg-foreground/8 text-foreground-tertiary rounded px-1.5 py-0.5 text-[10px] font-medium">
                            {tag}
                        </span>
                    )}
                    <h2 className="text-foreground text-sm font-medium">{title}</h2>
                    {editedCount !== undefined && editedCount > 0 && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            {editedCount} edited
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {controls}
                    {editUrl && (
                        <a
                            href={editUrl}
                            className="text-foreground-tertiary hover:text-foreground flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover/section:opacity-100"
                            title="Open in Cursor"
                        >
                            <Icons.Pencil className="h-3 w-3" />
                            edit
                        </a>
                    )}
                </div>
            </div>
            <div>{children}</div>
        </section>
    );
}

// ─── Color swatch ─────────────────────────────────────────────────────────────

function ColorSwatch({
    name,
    cssVar,
    value,
    isEdited,
    onChange,
    onReset,
}: {
    name: string;
    cssVar?: string;
    value: string;
    isEdited?: boolean;
    onChange?: (cssVar: string, hsl: string) => void;
    onReset?: (cssVar: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const hexValue =
        value.startsWith('#') || value.startsWith('oklch') || value.startsWith('hsl')
            ? '#888888'
            : hslToHex(value);
    const isEditable = !!cssVar && !!onChange;

    return (
        <div className="group/swatch flex min-w-0 items-center gap-2.5">
            <div
                className={cn(
                    'relative h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-white/10',
                    isEditable && 'cursor-pointer',
                )}
                onClick={() => isEditable && inputRef.current?.click()}
                title={isEditable ? `Edit ${name}` : undefined}
            >
                <div className="h-full w-full" style={{ background: `hsl(${value})` }} />
                {isEditable && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/swatch:opacity-100">
                        <Icons.Pencil className="h-3 w-3 text-white" />
                    </div>
                )}
                {isEditable && (
                    <input
                        ref={inputRef}
                        type="color"
                        value={hexValue}
                        onChange={(e) => onChange(cssVar, hexToHsl(e.target.value))}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                )}
                {/* Edited indicator */}
                {isEdited && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onReset?.(cssVar!);
                        }}
                        className="absolute -top-1 -right-1 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-black transition-colors hover:bg-amber-300"
                        title="Reset to default"
                    >
                        ×
                    </button>
                )}
            </div>
            <div className="min-w-0">
                <p className="text-foreground truncate text-xs leading-tight font-medium">{name}</p>
                {cssVar && (
                    <p className="text-foreground-tertiary truncate font-mono text-[10px] leading-tight">
                        {cssVar}
                    </p>
                )}
                <p
                    className={cn(
                        'truncate font-mono text-[10px] leading-tight',
                        isEdited ? 'text-amber-400' : 'text-foreground-tertiary opacity-60',
                    )}
                >
                    {hexValue}
                </p>
            </div>
        </div>
    );
}

// ─── Typography row editor ────────────────────────────────────────────────────

function TypographyEditor({
    row,
    overrides,
    onChange,
    onResetRow,
}: {
    row: TypographyRowData;
    overrides: TokenOverrides;
    onChange: (cssVar: string, value: string) => void;
    onResetRow: (label: string) => void;
}) {
    const sizeVar = `--font-size-${row.label}`;
    const weightVar = `--font-weight-${row.label}`;
    const leadingVar = `--font-leading-${row.label}`;
    const trackingVar = `--font-tracking-${row.label}`;

    const rawSize = overrides[sizeVar];
    const currentSize = rawSize ? parseFloat(rawSize) : row.sizeDefault;
    const currentWeight = overrides[weightVar] ?? String(row.weightDefault);
    const currentLeading = overrides[leadingVar] ?? row.leadingDefault;
    const rawTracking = overrides[trackingVar];
    const currentTracking = rawTracking ? parseFloat(rawTracking) : row.trackingDefault;

    const isEdited = [sizeVar, weightVar, leadingVar, trackingVar].some(
        (k) => overrides[k] !== undefined,
    );

    return (
        <div className="bg-foreground/[0.03] border-border border-t px-4 py-4">
            <div className="flex flex-wrap items-end gap-5">
                {/* Font size */}
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">Font size</p>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            step={0.0625}
                            min={0.25}
                            max={6}
                            value={currentSize}
                            onChange={(e) => onChange(sizeVar, `${e.target.value}rem`)}
                            className="bg-background border-border text-foreground focus:border-foreground/40 w-16 rounded-md border px-2 py-1.5 font-mono text-xs transition-colors outline-none"
                        />
                        <span className="text-foreground-tertiary text-xs">rem</span>
                        <span className="text-foreground-tertiary text-[10px] opacity-50">
                            {Math.round(currentSize * 16)}px
                        </span>
                    </div>
                </div>

                {/* Font weight */}
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">Weight</p>
                    <select
                        value={currentWeight}
                        onChange={(e) => onChange(weightVar, e.target.value)}
                        className="bg-background border-border text-foreground focus:border-foreground/40 rounded-md border px-2 py-1.5 text-xs transition-colors outline-none"
                    >
                        {[
                            ['100', 'Thin'],
                            ['200', 'Extralight'],
                            ['300', 'Light'],
                            ['400', 'Regular'],
                            ['500', 'Medium'],
                            ['600', 'Semibold'],
                            ['700', 'Bold'],
                            ['800', 'Extrabold'],
                            ['900', 'Black'],
                        ].map(([val, name]) => (
                            <option key={val} value={val}>
                                {val} — {name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Line height */}
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">Line height</p>
                    <input
                        type="text"
                        value={currentLeading}
                        onChange={(e) => onChange(leadingVar, e.target.value)}
                        className="bg-background border-border text-foreground focus:border-foreground/40 w-24 rounded-md border px-2 py-1.5 font-mono text-xs transition-colors outline-none"
                        placeholder="1.4rem"
                    />
                </div>

                {/* Letter spacing */}
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">
                        Letter spacing
                    </p>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            step={0.001}
                            min={-0.1}
                            max={0.2}
                            value={currentTracking}
                            onChange={(e) => onChange(trackingVar, `${e.target.value}rem`)}
                            className="bg-background border-border text-foreground focus:border-foreground/40 w-16 rounded-md border px-2 py-1.5 font-mono text-xs transition-colors outline-none"
                        />
                        <span className="text-foreground-tertiary text-xs">rem</span>
                    </div>
                </div>

                {isEdited && (
                    <button
                        onClick={() => onResetRow(row.label)}
                        className="text-foreground-tertiary hover:text-foreground self-end pb-2 text-xs transition-colors"
                    >
                        reset
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Radius presets ───────────────────────────────────────────────────────────

const RADIUS_PRESETS = [
    { label: 'sharp', value: 0.1 },
    { label: 'default', value: 1 },
    { label: 'soft', value: 1.6 },
    { label: 'pill', value: 3 },
];

// ─── Nav ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
    { label: 'Colors', id: 'colors' },
    { label: 'Typography', id: 'typography' },
    { label: 'Radius', id: 'radius' },
    { label: 'Spacing', id: 'spacing' },
    { label: 'Buttons', id: 'buttons' },
    { label: 'Badges', id: 'badges' },
    { label: 'Avatars', id: 'avatars' },
    { label: 'Inputs', id: 'inputs' },
    { label: 'Controls', id: 'controls' },
    { label: 'Progress', id: 'progress' },
    { label: 'Feedback', id: 'feedback' },
    { label: 'Cards', id: 'cards' },
    { label: 'Tabs', id: 'tabs' },
    { label: 'Accordions', id: 'accordions' },
    { label: 'Overlays', id: 'overlays' },
    { label: 'Motion', id: 'motion' },
    { label: 'Skeleton', id: 'skeleton' },
];

// ─── Typography data ──────────────────────────────────────────────────────────

const TYPOGRAPHY_ROWS: TypographyRowData[] = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typoVars(label: string) {
    return [
        `--font-size-${label}`,
        `--font-weight-${label}`,
        `--font-leading-${label}`,
        `--font-tracking-${label}`,
    ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
    const [overrides, setOverrides] = useState<TokenOverrides>(loadOverrides);
    const [savedOverrides, setSavedOverrides] = useState<TokenOverrides>(loadOverrides);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [radiusScale, setRadiusScale] = useState(1);
    const [transitionSpeed, setTransitionSpeed] = useState(1);
    const [switchOn, setSwitchOn] = useState(true);
    const [progress] = useState(62);
    const [sliderVal, setSliderVal] = useState([40]);
    const [activeSection, setActiveSection] = useState('colors');

    const isDirty = JSON.stringify(overrides) !== JSON.stringify(savedOverrides);
    const totalEdited = Object.keys(overrides).length;

    // ── Token helpers
    const setToken = useCallback((cssVar: string, value: string) => {
        setOverrides((prev) => ({ ...prev, [cssVar]: value }));
    }, []);

    const resetToken = useCallback((cssVar: string) => {
        setOverrides((prev) => {
            const n = { ...prev };
            delete n[cssVar];
            return n;
        });
    }, []);

    const resetTypoRow = useCallback((label: string) => {
        setOverrides((prev) => {
            const n = { ...prev };
            typoVars(label).forEach((k) => delete n[k]);
            return n;
        });
    }, []);

    // ── Save / discard
    const handleSave = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
        setSavedOverrides({ ...overrides });
    }, [overrides]);

    const handleDiscard = useCallback(() => {
        setOverrides({ ...savedOverrides });
    }, [savedOverrides]);

    const handleResetAll = useCallback(() => {
        setOverrides({});
        setSavedOverrides({});
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    // ── Smooth scroll
    const scrollTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // ── Scroll spy
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) =>
                entries.forEach((e) => {
                    if (e.isIntersecting) setActiveSection(e.target.id);
                }),
            { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
        );
        NAV_ITEMS.forEach(({ id }) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    // ── Inject CSS variable overrides
    useEffect(() => {
        const style =
            document.getElementById('ds-overrides') ??
            (() => {
                const s = document.createElement('style');
                s.id = 'ds-overrides';
                document.head.appendChild(s);
                return s;
            })();

        const radiusVars = `--radius: ${radiusScale}rem;`;
        const animVars = `--ds-anim-duration: ${Math.round(transitionSpeed * 200)}ms;`;
        const overrideVars = Object.entries(overrides)
            .map(([k, v]) => `${k}: ${v};`)
            .join('\n');
        style.textContent = `:root { ${radiusVars} ${animVars} ${overrideVars} }`;
    }, [overrides, radiusScale, transitionSpeed]);

    // ── Data
    const semanticTokens: { name: string; cssVar: string; value: string }[] = [
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
    ];

    const foregroundTokens = [
        { name: 'foreground-primary', cssVar: '--foreground-primary', value: '0 0% 100%' },
        { name: 'foreground-secondary', cssVar: '--foreground-secondary', value: '0 0% 67%' },
        { name: 'foreground-tertiary', cssVar: '--foreground-tertiary', value: '0 0% 57%' },
        { name: 'foreground-brand', cssVar: '--foreground-brand', value: '205 100% 53%' },
        { name: 'foreground-positive', cssVar: '--foreground-positive', value: '203 100% 78%' },
        { name: 'background-brand', cssVar: '--background-brand', value: '206 100% 28%' },
        { name: 'background-secondary', cssVar: '--background-secondary', value: '0 0% 12%' },
        { name: 'background-tertiary', cssVar: '--background-tertiary', value: '0 0% 20%' },
    ];

    const palette = [
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

    const websiteTypography = [
        {
            label: 'Display / 6xl',
            className: 'text-6xl font-light',
            size: '3.75rem',
            note: 'Hero, testimonials',
        },
        {
            label: 'Display / 5xl',
            className: 'text-5xl font-light',
            size: '3rem',
            note: 'Section headings',
        },
        {
            label: 'Display / 4xl',
            className: 'text-4xl font-light',
            size: '2.25rem',
            note: 'Sub-headings',
        },
        {
            label: 'Display / 3xl',
            className: 'text-3xl font-light',
            size: '1.875rem',
            note: 'Contributors heading',
        },
        {
            label: 'Display / 2xl',
            className: 'text-2xl font-light',
            size: '1.5rem',
            note: 'Feature intros',
        },
    ];

    const radiiData = [
        { name: 'xs', value: '0.25rem', tailwind: 'rounded-xs' },
        { name: 'sm', value: '0.5rem', tailwind: 'rounded-sm' },
        { name: 'md', value: '0.75rem', tailwind: 'rounded-md' },
        { name: 'lg', value: '1rem', tailwind: 'rounded-lg' },
        { name: 'xl', value: '1.25rem', tailwind: 'rounded-xl' },
        { name: '2xl', value: '1.5rem', tailwind: 'rounded-2xl' },
        { name: '3xl', value: '2rem', tailwind: 'rounded-3xl' },
        { name: 'full', value: '9999px', tailwind: 'rounded-full' },
    ];

    const spacingData = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32];

    // Computed edited counts per section
    const colorEditedCount = [...semanticTokens, ...foregroundTokens].filter(
        (t) => overrides[t.cssVar],
    ).length;
    const typoEditedCount = TYPOGRAPHY_ROWS.filter((r) =>
        typoVars(r.label).some((k) => overrides[k]),
    ).length;

    return (
        <TooltipProvider>
            <div className="bg-background min-h-screen">
                {/* ── Top nav ──────────────────────────────────────────── */}
                <header className="border-border sticky top-0 z-50 border-b bg-black/80 backdrop-blur-md">
                    <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-3">
                            <BrandLogo className="h-4" />
                            <span className="text-foreground-tertiary text-xs">/</span>
                            <span className="text-foreground text-xs font-medium">
                                design system
                            </span>
                            {totalEdited > 0 && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                    {totalEdited} custom
                                </span>
                            )}
                        </div>
                        <nav className="hidden items-center gap-0.5 lg:flex">
                            {NAV_ITEMS.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => scrollTo(item.id)}
                                    className={cn(
                                        'rounded px-2 py-1 text-xs transition-colors',
                                        activeSection === item.id
                                            ? 'text-foreground'
                                            : 'text-foreground-tertiary hover:text-foreground',
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </header>

                <div className="mx-auto max-w-7xl px-6 py-10">
                    <div className="mb-12">
                        <div className="mb-3 flex items-center gap-3">
                            <BrandWordmark className="h-6" />
                        </div>
                        <p className="text-foreground-tertiary text-sm">
                            Component library, visual tokens, and design language reference. Click
                            any color swatch or typography row to edit live.
                        </p>
                    </div>

                    {/* ── COLORS ──────────────────────────────────────────── */}
                    <div id="colors">
                        <Section
                            title="Semantic tokens"
                            tag="colors"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/globals.css"
                            editedCount={colorEditedCount}
                            controls={
                                colorEditedCount > 0 ? (
                                    <button
                                        onClick={handleResetAll}
                                        className="text-foreground-tertiary hover:text-foreground text-[10px] transition-colors"
                                    >
                                        reset all colors
                                    </button>
                                ) : undefined
                            }
                        >
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                {semanticTokens.map((t) => (
                                    <ColorSwatch
                                        key={t.cssVar}
                                        name={t.name}
                                        cssVar={t.cssVar}
                                        value={overrides[t.cssVar] ?? t.value}
                                        isEdited={!!overrides[t.cssVar]}
                                        onChange={setToken}
                                        onReset={resetToken}
                                    />
                                ))}
                            </div>
                        </Section>

                        <Section
                            title="Foreground & background tokens"
                            tag="colors"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/globals.css"
                        >
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {foregroundTokens.map((t) => (
                                    <ColorSwatch
                                        key={t.cssVar}
                                        name={t.name}
                                        cssVar={t.cssVar}
                                        value={overrides[t.cssVar] ?? t.value}
                                        isEdited={!!overrides[t.cssVar]}
                                        onChange={setToken}
                                        onReset={resetToken}
                                    />
                                ))}
                            </div>
                        </Section>

                        <Section title="Color palette" tag="colors">
                            {palette.map((group) => (
                                <div key={group.label} className="mb-6">
                                    <p className="text-foreground-tertiary mb-2 text-xs">
                                        {group.label}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {group.colors.map((c) => (
                                            <Tooltip key={c.name}>
                                                <TooltipTrigger>
                                                    <div
                                                        className="h-8 w-8 cursor-default rounded"
                                                        style={{ background: `hsl(${c.value})` }}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="font-mono text-xs">
                                                        {c.name} — {hslToHex(c.value)}
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── TYPOGRAPHY ──────────────────────────────────────── */}
                    <div id="typography">
                        <Section
                            title="App type scale"
                            tag="typography"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/globals.css"
                            editedCount={typoEditedCount}
                            controls={
                                <p className="text-foreground-tertiary text-xs">
                                    Click a row to edit
                                </p>
                            }
                        >
                            <div className="border-border overflow-hidden rounded-xl border">
                                {TYPOGRAPHY_ROWS.map((row) => {
                                    const isExpanded = expandedRow === row.label;
                                    const isEdited = typoVars(row.label).some((k) => overrides[k]);
                                    const currentSize = overrides[`--font-size-${row.label}`]
                                        ? parseFloat(overrides[`--font-size-${row.label}`]!)
                                        : row.sizeDefault;
                                    const currentWeight =
                                        overrides[`--font-weight-${row.label}`] ??
                                        String(row.weightDefault);
                                    return (
                                        <div
                                            key={row.label}
                                            className={cn(
                                                'border-border border-b last:border-b-0',
                                                isEdited && 'border-l-2 border-l-amber-400/60',
                                            )}
                                        >
                                            <button
                                                onClick={() =>
                                                    setExpandedRow(isExpanded ? null : row.label)
                                                }
                                                className="hover:bg-foreground/4 group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
                                            >
                                                <span
                                                    className={cn(
                                                        'text-foreground flex-1',
                                                        row.className,
                                                    )}
                                                >
                                                    The quick brown fox
                                                </span>
                                                <div className="flex shrink-0 items-center gap-3">
                                                    <div className="text-right opacity-0 transition-opacity group-hover:opacity-100">
                                                        <span className="text-foreground-tertiary font-mono text-[10px]">
                                                            {currentSize}rem / {currentWeight}
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={cn(
                                                            'text-foreground-tertiary w-24 font-mono text-[10px]',
                                                            isEdited && 'text-amber-400',
                                                        )}
                                                    >
                                                        text-{row.label}
                                                    </span>
                                                    <Icons.ChevronDown
                                                        className={cn(
                                                            'text-foreground-tertiary h-3 w-3 transition-transform',
                                                            isExpanded && 'rotate-180',
                                                        )}
                                                    />
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <TypographyEditor
                                                    row={row}
                                                    overrides={overrides}
                                                    onChange={setToken}
                                                    onResetRow={resetTypoRow}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>

                        <Section title="Website / marketing scale" tag="typography">
                            <div className="border-border divide-border divide-y overflow-hidden rounded-xl border">
                                {websiteTypography.map((row) => (
                                    <div
                                        key={row.label}
                                        className="hover:bg-foreground/4 group flex items-baseline justify-between gap-4 px-4 py-3 transition-colors"
                                    >
                                        <span
                                            className={cn(
                                                'text-foreground flex-1 truncate',
                                                row.className,
                                            )}
                                        >
                                            Design visually
                                        </span>
                                        <div className="flex shrink-0 items-center gap-4 text-right">
                                            <span className="text-foreground-tertiary font-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                                                {row.size} / {row.note}
                                            </span>
                                            <span className="text-foreground-tertiary w-32 font-mono text-[10px]">
                                                {row.label}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title="Font weights" tag="typography">
                            <div className="flex flex-wrap gap-6">
                                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                                    <div key={w}>
                                        <p
                                            className="text-foreground text-base"
                                            style={{ fontWeight: w }}
                                        >
                                            Weblab
                                        </p>
                                        <p className="text-foreground-tertiary mt-0.5 font-mono text-[10px]">
                                            {w}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── RADIUS ──────────────────────────────────────────── */}
                    <div id="radius">
                        <Section
                            title="Radius scale"
                            tag="radius"
                            controls={
                                <div className="flex items-center gap-2">
                                    {RADIUS_PRESETS.map((p) => (
                                        <button
                                            key={p.label}
                                            onClick={() => setRadiusScale(p.value)}
                                            className={cn(
                                                'rounded px-2 py-1 text-xs transition-colors',
                                                Math.abs(radiusScale - p.value) < 0.05
                                                    ? 'text-foreground bg-foreground/10'
                                                    : 'text-foreground-tertiary hover:text-foreground',
                                            )}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                    <input
                                        type="range"
                                        min={0.05}
                                        max={3}
                                        step={0.05}
                                        value={radiusScale}
                                        onChange={(e) => setRadiusScale(parseFloat(e.target.value))}
                                        className="w-20 accent-white"
                                    />
                                    <span className="text-foreground-tertiary w-8 text-right font-mono text-xs">
                                        {radiusScale.toFixed(2)}×
                                    </span>
                                </div>
                            }
                        >
                            <div className="flex flex-wrap items-end gap-4">
                                {radiiData.map((r) => (
                                    <div key={r.name} className="flex flex-col items-center gap-2">
                                        <div
                                            className="bg-foreground/10 border-border h-12 w-12 border"
                                            style={{
                                                borderRadius:
                                                    r.name === 'full'
                                                        ? '9999px'
                                                        : `calc(${r.value} * ${radiusScale})`,
                                            }}
                                        />
                                        <p className="text-foreground-tertiary font-mono text-[10px]">
                                            {r.name}
                                        </p>
                                        <p className="text-foreground-tertiary font-mono text-[10px] opacity-60">
                                            {r.tailwind}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            {/* Live preview with current scale */}
                            <div className="mt-6 flex flex-wrap gap-3">
                                <Button>Default button</Button>
                                <Button variant="outline">Outline</Button>
                                <Input className="w-48" placeholder="Input field…" />
                                <Badge>Badge</Badge>
                                <Card className="w-40 p-3">
                                    <p className="text-foreground text-xs">Card</p>
                                </Card>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── SPACING ─────────────────────────────────────────── */}
                    <div id="spacing">
                        <Section title="Spacing scale" tag="spacing">
                            <div className="flex flex-wrap items-end gap-2">
                                {spacingData.map((n) => (
                                    <div key={n} className="flex flex-col items-center gap-1">
                                        <div
                                            className="bg-foreground/20 rounded-sm"
                                            style={{ width: `${n * 4}px`, height: `${n * 4}px` }}
                                        />
                                        <p className="text-foreground-tertiary font-mono text-[10px]">
                                            {n}
                                        </p>
                                        <p className="text-foreground-tertiary font-mono text-[10px] opacity-60">
                                            {n * 4}px
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── BUTTONS ─────────────────────────────────────────── */}
                    <div id="buttons">
                        <Section
                            title="Variants"
                            tag="buttons"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/button.tsx"
                        >
                            <div className="flex flex-wrap items-center gap-3">
                                <Button variant="default">Default</Button>
                                <Button variant="secondary">Secondary</Button>
                                <Button variant="outline">Outline</Button>
                                <Button variant="ghost">Ghost</Button>
                                <Button variant="destructive">Destructive</Button>
                                <Button variant="link">Link</Button>
                                <Button disabled>Disabled</Button>
                            </div>
                        </Section>

                        <Section title="Sizes" tag="buttons">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button size="lg">Large</Button>
                                <Button size="default">Default</Button>
                                <Button size="sm">Small</Button>
                                <Button size="icon">
                                    <Icons.Plus className="h-4 w-4" />
                                </Button>
                                <Button size="toolbar">
                                    <Icons.MagnifyingGlass className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </Section>

                        <Section title="With icons" tag="buttons">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button>
                                    <Icons.Plus className="h-4 w-4" /> Create project
                                </Button>
                                <Button variant="outline">
                                    <Icons.Download className="h-4 w-4" /> Export
                                </Button>
                                <Button variant="secondary">
                                    <Icons.GitHubLogo className="h-4 w-4" /> Connect GitHub
                                </Button>
                                <Button variant="ghost">
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />{' '}
                                    Loading
                                </Button>
                                <Button variant="destructive">
                                    <Icons.Trash className="h-4 w-4" /> Delete
                                </Button>
                            </div>
                        </Section>

                        <Section title="Toggle" tag="buttons">
                            <div className="flex flex-wrap items-center gap-3">
                                <Toggle aria-label="Align left">
                                    <Icons.TextAlignLeft className="h-4 w-4" />
                                </Toggle>
                                <Toggle aria-label="Align center" defaultPressed>
                                    <Icons.TextAlignCenter className="h-4 w-4" />
                                </Toggle>
                                <Toggle aria-label="Align right" variant="outline">
                                    <Icons.TextAlignRight className="h-4 w-4" />
                                </Toggle>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── BADGES ──────────────────────────────────────────── */}
                    <div id="badges">
                        <Section
                            title="Badge variants"
                            tag="badges"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/badge.tsx"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge>Default</Badge>
                                <Badge variant="secondary">Secondary</Badge>
                                <Badge variant="outline">Outline</Badge>
                                <Badge variant="destructive">Destructive</Badge>
                                <Badge>
                                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                                    Active
                                </Badge>
                                <Badge variant="outline">
                                    <Icons.Bookmark className="mr-1 h-3 w-3" />
                                    Featured
                                </Badge>
                                <Badge variant="secondary">New</Badge>
                                <Badge variant="secondary">Beta</Badge>
                                <Badge>Pro</Badge>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── AVATARS ─────────────────────────────────────────── */}
                    <div id="avatars">
                        <Section
                            title="Avatar"
                            tag="avatars"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/avatar.tsx"
                        >
                            <div className="flex items-end gap-4">
                                {[
                                    { size: 'h-12 w-12', label: 'lg' },
                                    { size: 'h-9 w-9', label: 'md' },
                                    { size: 'h-7 w-7', label: 'sm' },
                                    { size: 'h-5 w-5', label: 'xs' },
                                ].map(({ size, label }) => (
                                    <div key={label} className="flex flex-col items-center gap-1.5">
                                        <Avatar className={size}>
                                            <AvatarImage
                                                src="https://github.com/shadcn.png"
                                                alt="User"
                                            />
                                            <AvatarFallback className="text-xs">LH</AvatarFallback>
                                        </Avatar>
                                        <p className="text-foreground-tertiary font-mono text-[10px]">
                                            {label}
                                        </p>
                                    </div>
                                ))}
                                <div className="flex flex-col items-center gap-1.5">
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback>WB</AvatarFallback>
                                    </Avatar>
                                    <p className="text-foreground-tertiary font-mono text-[10px]">
                                        fallback
                                    </p>
                                </div>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── INPUTS ──────────────────────────────────────────── */}
                    <div id="inputs">
                        <Section
                            title="Form inputs"
                            tag="inputs"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/input.tsx"
                        >
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="ds-i1">Text</Label>
                                    <Input id="ds-i1" placeholder="Enter value…" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ds-i2">Disabled</Label>
                                    <Input id="ds-i2" placeholder="Disabled" disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ds-i3">With icon</Label>
                                    <div className="relative">
                                        <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                        <Input id="ds-i3" placeholder="Search…" className="pl-9" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ds-ta">Textarea</Label>
                                    <Textarea id="ds-ta" placeholder="Write something…" rows={3} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ds-sel">Select</Label>
                                    <Select>
                                        <SelectTrigger id="ds-sel">
                                            <SelectValue placeholder="Choose…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="a">Option A</SelectItem>
                                            <SelectItem value="b">Option B</SelectItem>
                                            <SelectItem value="c">Option C</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── CONTROLS ────────────────────────────────────────── */}
                    <div id="controls">
                        <Section
                            title="Checkbox"
                            tag="controls"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/checkbox.tsx"
                        >
                            <div className="flex flex-wrap gap-6">
                                {[
                                    { id: 'c1', label: 'Unchecked', checked: false },
                                    { id: 'c2', label: 'Checked', checked: true },
                                    { id: 'c3', label: 'Disabled', disabled: true },
                                    {
                                        id: 'c4',
                                        label: 'Disabled checked',
                                        checked: true,
                                        disabled: true,
                                    },
                                ].map(({ id, label, checked, disabled }) => (
                                    <div key={id} className="flex items-center gap-2">
                                        <Checkbox
                                            id={id}
                                            defaultChecked={checked}
                                            disabled={disabled}
                                        />
                                        <Label
                                            htmlFor={id}
                                            className={disabled ? 'opacity-50' : ''}
                                        >
                                            {label}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title="Radio" tag="controls">
                            <RadioGroup defaultValue="r1" className="flex gap-6">
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="r1" id="dr1" />
                                    <Label htmlFor="dr1">Option 1</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="r2" id="dr2" />
                                    <Label htmlFor="dr2">Option 2</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="r3" id="dr3" disabled />
                                    <Label htmlFor="dr3" className="opacity-50">
                                        Disabled
                                    </Label>
                                </div>
                            </RadioGroup>
                        </Section>

                        <Section title="Switch" tag="controls">
                            <div className="flex flex-wrap gap-6">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="dsw1"
                                        checked={switchOn}
                                        onCheckedChange={setSwitchOn}
                                    />
                                    <Label htmlFor="dsw1">{switchOn ? 'On' : 'Off'}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch id="dsw2" disabled />
                                    <Label htmlFor="dsw2" className="opacity-50">
                                        Disabled
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch id="dsw3" defaultChecked disabled />
                                    <Label htmlFor="dsw3" className="opacity-50">
                                        Disabled on
                                    </Label>
                                </div>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── PROGRESS ────────────────────────────────────────── */}
                    <div id="progress">
                        <Section
                            title="Progress"
                            tag="progress"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/progress.tsx"
                        >
                            <div className="w-full max-w-md space-y-4">
                                <Progress value={20} />
                                <Progress value={50} />
                                <Progress value={progress} />
                                <Progress value={100} />
                            </div>
                        </Section>

                        <Section
                            title="Slider"
                            tag="progress"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/slider.tsx"
                        >
                            <div className="w-full max-w-md space-y-6">
                                <div className="space-y-2">
                                    <Label>Value: {sliderVal[0]}</Label>
                                    <Slider
                                        value={sliderVal}
                                        onValueChange={setSliderVal}
                                        min={0}
                                        max={100}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Disabled</Label>
                                    <Slider defaultValue={[30]} disabled />
                                </div>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── FEEDBACK ────────────────────────────────────────── */}
                    <div id="feedback">
                        <Section
                            title="Alert"
                            tag="feedback"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/alert.tsx"
                        >
                            <div className="w-full max-w-xl space-y-3">
                                <Alert>
                                    <Icons.InfoCircled className="h-4 w-4" />
                                    <AlertTitle>Info</AlertTitle>
                                    <AlertDescription>
                                        This is an informational message.
                                    </AlertDescription>
                                </Alert>
                                <Alert variant="destructive">
                                    <Icons.ExclamationTriangle className="h-4 w-4" />
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription>
                                        Something went wrong. Please try again.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        </Section>

                        <Section title="Tooltip" tag="feedback">
                            <div className="flex flex-wrap items-center gap-4">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon">
                                            <Icons.InfoCircled className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Tooltip content</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm">
                                            Top
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Top side</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm">
                                            Right
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">Right side</TooltipContent>
                                </Tooltip>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── CARDS ───────────────────────────────────────────── */}
                    <div id="cards">
                        <Section
                            title="Card"
                            tag="cards"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/card.tsx"
                        >
                            <div className="flex flex-wrap gap-4">
                                <Card className="w-64">
                                    <CardHeader>
                                        <CardTitle>Project name</CardTitle>
                                        <CardDescription>Last updated 2 hours ago</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-foreground-secondary text-sm">
                                            Card body content.
                                        </p>
                                    </CardContent>
                                    <CardFooter className="gap-2">
                                        <Button size="sm">Open</Button>
                                        <Button size="sm" variant="ghost">
                                            Settings
                                        </Button>
                                    </CardFooter>
                                </Card>

                                <Card className="w-64">
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle>Usage</CardTitle>
                                            <Badge variant="secondary">Pro</Badge>
                                        </div>
                                        <CardDescription>Current billing period</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-foreground-secondary">
                                                    AI requests
                                                </span>
                                                <span>450 / 1000</span>
                                            </div>
                                            <Progress value={45} />
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="border-border bg-background-secondary w-64 rounded-xl border p-4">
                                    <p className="text-foreground text-sm font-medium">
                                        Minimal card
                                    </p>
                                    <p className="text-foreground-tertiary mt-1 text-xs">
                                        No Card component — just background-secondary + border
                                        tokens.
                                    </p>
                                </div>

                                <div className="bg-foreground/5 w-64 rounded-xl p-4">
                                    <p className="text-foreground text-sm font-medium">
                                        Ghost card
                                    </p>
                                    <p className="text-foreground-tertiary mt-1 text-xs">
                                        No border, subtle bg. Good for inline info panels.
                                    </p>
                                </div>
                            </div>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── TABS ────────────────────────────────────────────── */}
                    <div id="tabs">
                        <Section
                            title="Tabs"
                            tag="tabs"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/tabs.tsx"
                        >
                            <Tabs defaultValue="overview" className="w-full max-w-lg">
                                <TabsList>
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="settings">Settings</TabsTrigger>
                                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                                    <TabsTrigger value="disabled" disabled>
                                        Disabled
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent
                                    value="overview"
                                    className="text-foreground-secondary mt-4 text-sm"
                                >
                                    Overview tab — summary, recent activity, quick actions.
                                </TabsContent>
                                <TabsContent
                                    value="settings"
                                    className="text-foreground-secondary mt-4 text-sm"
                                >
                                    Settings tab — configure project name, domain, and access.
                                </TabsContent>
                                <TabsContent
                                    value="analytics"
                                    className="text-foreground-secondary mt-4 text-sm"
                                >
                                    Analytics tab — view traffic, conversions, and engagement.
                                </TabsContent>
                            </Tabs>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── ACCORDIONS ──────────────────────────────────────── */}
                    <div id="accordions">
                        <Section
                            title="Accordion"
                            tag="accordions"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/accordion.tsx"
                        >
                            <Accordion type="single" collapsible className="w-full max-w-lg">
                                <AccordionItem value="q1">
                                    <AccordionTrigger>What is {APP_NAME}?</AccordionTrigger>
                                    <AccordionContent>
                                        {APP_NAME} is an AI-powered visual editor. Connect your
                                        codebase, design visually, and ship PRs.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="q2">
                                    <AccordionTrigger>How does it work?</AccordionTrigger>
                                    <AccordionContent>
                                        Connect your repo, open a file in the visual canvas, make
                                        changes, and commit back to your branch.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="q3">
                                    <AccordionTrigger>
                                        What frameworks are supported?
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        React, Next.js, Vue, Angular, Svelte, and more. Works with
                                        Tailwind, CSS Modules, and styled-components.
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── OVERLAYS ────────────────────────────────────────── */}
                    <div id="overlays">
                        <Section title="Dialog" tag="overlays">
                            <div className="flex flex-wrap items-center gap-3">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline">Open dialog</Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Create project</DialogTitle>
                                            <DialogDescription>
                                                Give your project a name and choose how you want to
                                                get started.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-3 py-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="dg-name">Project name</Label>
                                                <Input
                                                    id="dg-name"
                                                    placeholder="My awesome project"
                                                />
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline">Cancel</Button>
                                            <Button>Create</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive">Delete project</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. All project data will
                                                be permanently deleted.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </Section>

                        <Section title="Dropdown menu" tag="overlays">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline">
                                        Actions <Icons.ChevronDown className="ml-1 h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuLabel>Project</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                        <Icons.Pencil className="mr-2 h-4 w-4" /> Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        <Icons.Copy className="mr-2 h-4 w-4" /> Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        <Icons.ExternalLink className="mr-2 h-4 w-4" /> Open in
                                        browser
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive">
                                        <Icons.Trash className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── MOTION ──────────────────────────────────────────── */}
                    <div id="motion">
                        <Section
                            title="Transitions"
                            tag="motion"
                            controls={
                                <div className="flex items-center gap-2">
                                    <span className="text-foreground-tertiary text-xs">speed</span>
                                    <input
                                        type="range"
                                        min={0.1}
                                        max={5}
                                        step={0.1}
                                        value={transitionSpeed}
                                        onChange={(e) =>
                                            setTransitionSpeed(parseFloat(e.target.value))
                                        }
                                        className="w-20 accent-white"
                                    />
                                    <span className="text-foreground-tertiary w-8 text-right font-mono text-xs">
                                        {transitionSpeed.toFixed(1)}×
                                    </span>
                                    {transitionSpeed !== 1 && (
                                        <button
                                            onClick={() => setTransitionSpeed(1)}
                                            className="text-foreground-tertiary hover:text-foreground text-[10px] transition-colors"
                                        >
                                            reset
                                        </button>
                                    )}
                                </div>
                            }
                        >
                            <div className="flex flex-wrap gap-4">
                                {[
                                    {
                                        label: 'color',
                                        from: 'bg-background-secondary',
                                        to: 'hover:bg-foreground/10',
                                        prop: 'background-color',
                                    },
                                    {
                                        label: 'scale',
                                        from: 'bg-background-secondary',
                                        to: 'hover:scale-105',
                                        prop: 'transform',
                                    },
                                    {
                                        label: 'opacity',
                                        from: 'bg-background-secondary',
                                        to: 'hover:opacity-30',
                                        prop: 'opacity',
                                    },
                                ].map(({ label, from, to, prop }) => (
                                    <div
                                        key={label}
                                        className={cn(
                                            'border-border text-foreground-tertiary flex h-20 w-36 cursor-default items-center justify-center rounded-xl border text-xs',
                                            from,
                                            to,
                                        )}
                                        style={{
                                            transitionDuration: `var(--ds-anim-duration, 200ms)`,
                                            transitionProperty: prop,
                                        }}
                                    >
                                        {label}
                                    </div>
                                ))}
                                <div className="border-border bg-background-secondary flex h-20 w-36 items-center justify-center gap-2 rounded-xl border">
                                    <Icons.LoadingSpinner
                                        className="text-foreground-tertiary h-5 w-5 animate-spin"
                                        style={
                                            {
                                                animationDuration: `var(--ds-anim-duration, 200ms)`,
                                            } as React.CSSProperties
                                        }
                                    />
                                    <span className="text-foreground-tertiary text-xs">
                                        spinner
                                    </span>
                                </div>
                            </div>
                            <p className="text-foreground-tertiary mt-3 text-xs">
                                Duration:{' '}
                                <span className="font-mono">
                                    {Math.round(transitionSpeed * 200)}ms
                                </span>
                            </p>
                        </Section>
                    </div>

                    <Separator className="mb-12" />

                    {/* ── SKELETON ────────────────────────────────────────── */}
                    <div id="skeleton">
                        <Section
                            title="Skeleton"
                            tag="skeleton"
                            filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/skeleton.tsx"
                        >
                            <div className="flex flex-wrap gap-8">
                                <div className="flex flex-col gap-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-4 w-64" />
                                    <Skeleton className="h-4 w-40" />
                                </div>
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="flex flex-col gap-2">
                                        <Skeleton className="h-3 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Skeleton className="h-32 w-48 rounded-xl" />
                                    <Skeleton className="h-3 w-32" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                        </Section>
                    </div>

                    {/* ── SEPARATOR ───────────────────────────────────────── */}
                    <Section title="Separator" tag="layout">
                        <div className="w-full max-w-md space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="text-foreground-secondary text-xs">Section A</span>
                                <Separator className="flex-1" />
                                <span className="text-foreground-secondary text-xs">Section B</span>
                            </div>
                            <Separator />
                            <div className="flex h-8 items-stretch gap-3">
                                <span className="text-foreground-secondary text-xs">Left</span>
                                <Separator orientation="vertical" />
                                <span className="text-foreground-secondary text-xs">Right</span>
                            </div>
                        </div>
                    </Section>

                    {/* ── BRAND ───────────────────────────────────────────── */}
                    <Separator className="mb-12" />
                    <Section
                        title="Brand"
                        tag="brand"
                        filePath="/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/packages/ui/src/components/brand.tsx"
                    >
                        <div className="flex flex-wrap items-center gap-8">
                            <div className="flex flex-col gap-2">
                                <BrandLogo className="h-4" />
                                <p className="text-foreground-tertiary text-[10px]">
                                    BrandLogo (symbol + wordmark)
                                </p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <BrandWordmark className="h-4" />
                                <p className="text-foreground-tertiary text-[10px]">
                                    BrandWordmark (text only)
                                </p>
                            </div>
                            {['h-8', 'h-5', 'h-4'].map((h) => (
                                <div key={h} className="flex flex-col items-center gap-2">
                                    <BrandLogo className={h} />
                                    <p className="text-foreground-tertiary text-[10px]">{h}</p>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <div className="pb-24" />
                </div>

                {/* ── Floating save bar ─────────────────────────────────── */}
                {isDirty && (
                    <div className="fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-xl border border-white/10 bg-black/90 px-4 py-2.5 shadow-xl backdrop-blur-md">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                        <span className="text-foreground-secondary text-xs">Unsaved changes</span>
                        <button
                            onClick={handleDiscard}
                            className="text-foreground-tertiary hover:text-foreground text-xs transition-colors"
                        >
                            discard
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                            Save
                        </button>
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
