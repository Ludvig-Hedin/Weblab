'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { cn } from '@weblab/ui/utils';
import { stringToParsedValue } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';

const POSITION_OPTIONS = ['static', 'relative', 'absolute', 'fixed', 'sticky'] as const;
const POSITION_FIELDS = [
    { key: 'top', label: 'Top' },
    { key: 'right', label: 'Right' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'left', label: 'Left' },
    { key: 'zIndex', label: 'Z' },
] as const;

type PositionFieldKey = (typeof POSITION_FIELDS)[number]['key'];

type PositionState = Record<PositionFieldKey, string>;

const DEFAULT_POSITION_STATE: PositionState = {
    top: '',
    right: '',
    bottom: '',
    left: '',
    zIndex: '',
};

const DRAGGABLE_POSITION_TYPES = new Set(['absolute', 'fixed']);

const normalizePositionValue = (key: PositionFieldKey, value: string) => {
    const trimmed = value.trim();
    if (trimmed === '') {
        return '';
    }
    if (key === 'zIndex') {
        return trimmed;
    }
    if (/^[-+]?[0-9]*\.?[0-9]+$/.test(trimmed)) {
        return `${trimmed}px`;
    }
    return trimmed;
};

export const PositionSection = observer(() => {
    const editorEngine = useEditorEngine();
    const selectedStyle = editorEngine.style.selectedStyle;
    const definedStyles = selectedStyle?.styles.defined;
    const computedStyles = selectedStyle?.styles.computed;

    const positionValue =
        definedStyles?.position?.toString() ?? computedStyles?.position?.toString() ?? 'static';

    const [positionState, setPositionState] = useState<PositionState>(DEFAULT_POSITION_STATE);

    useEffect(() => {
        const nextState = { ...DEFAULT_POSITION_STATE };

        for (const { key } of POSITION_FIELDS) {
            const rawValue =
                definedStyles?.[key]?.toString() ?? computedStyles?.[key]?.toString() ?? '';

            if (key === 'zIndex') {
                nextState[key] = rawValue === 'auto' ? '' : rawValue;
                continue;
            }

            if (rawValue === '' || rawValue === 'auto') {
                nextState[key] = '';
                continue;
            }

            const { num, unit } = stringToParsedValue(rawValue);
            nextState[key] = Number.isFinite(num) ? `${num}${unit}` : rawValue;
        }

        setPositionState(nextState);
    }, [computedStyles, definedStyles]);

    const canEditOffsets = useMemo(
        () => DRAGGABLE_POSITION_TYPES.has(positionValue),
        [positionValue],
    );

    const handlePositionTypeChange = (value: string) => {
        editorEngine.style.update('position', value);
    };

    const handleFieldDraftChange = (key: PositionFieldKey, value: string) => {
        setPositionState((current) => ({ ...current, [key]: value }));
    };

    const handleFieldCommit = (key: PositionFieldKey) => {
        editorEngine.style.update(key, normalizePositionValue(key, positionState[key]));
    };

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-foreground-tertiary text-mini">Type</span>
                    <Select value={positionValue} onValueChange={handlePositionTypeChange}>
                        <SelectTrigger className="border-border/60 bg-background-secondary text-small h-8 w-[148px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {POSITION_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option} className="capitalize">
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {POSITION_FIELDS.map(({ key, label }) => (
                    <label key={key} className="space-y-1.5">
                        <span className="text-foreground-tertiary text-[11px]">{label}</span>
                        <Input
                            value={positionState[key]}
                            onChange={(event) => handleFieldDraftChange(key, event.target.value)}
                            onBlur={() => handleFieldCommit(key)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    handleFieldCommit(key);
                                }
                            }}
                            disabled={key !== 'zIndex' && !canEditOffsets}
                            placeholder={key === 'zIndex' ? 'auto' : '0px'}
                            className={cn(
                                'border-border/60 bg-background-secondary text-small h-8',
                                key !== 'zIndex' && !canEditOffsets && 'opacity-60',
                            )}
                        />
                    </label>
                ))}
            </div>

            {!canEditOffsets && (
                <p className="text-foreground-tertiary text-mini">
                    Offset fields activate for `absolute` and `fixed` positioned elements.
                </p>
            )}
        </div>
    );
});
