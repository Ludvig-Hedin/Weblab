'use client';

import { useTranslations } from 'next-intl';

import type {
    ActionStep,
    ActionStepKind,
    ActionStepPayload,
    BgColorStep,
    EasingNamed,
    EasingSpec,
    MoveStep,
    NumericValue,
    OpacityStep,
    RotateStep,
    ScaleStep,
    SizeStep,
} from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons/index';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { NumberInput } from '@weblab/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import { transKeys } from '@/i18n/keys';
import { formatNumeric, parseNumeric } from '../value-helpers';

interface ActionRowProps {
    step: ActionStep;
    onChange: (next: ActionStep) => void;
    onRemove: () => void;
}

const EASING_OPTIONS: EasingNamed[] = [
    'linear',
    'ease',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'out-quad',
    'out-cubic',
    'in-out-cubic',
    'out-back',
];

function actionKindLabelKey(kind: ActionStepKind) {
    switch (kind) {
        case 'move':
            return transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.move;
        case 'scale':
            return transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.scale;
        case 'rotate':
            return transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.rotate;
        case 'opacity':
            return transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.opacity;
        case 'size':
            return transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.size;
        case 'bg-color':
            return transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes
                .backgroundColor;
    }
}

export function ActionRow({ step, onChange, onRemove }: ActionRowProps) {
    const t = useTranslations();

    const updatePayload = (payload: ActionStepPayload) => {
        onChange({ ...step, payload });
    };

    const updateEasing = (name: EasingNamed) => {
        const easing: EasingSpec = { kind: 'named', name };
        onChange({ ...step, easing });
    };

    const easingName: EasingNamed = step.easing.kind === 'named' ? step.easing.name : 'ease';

    return (
        <div className="border-border/30 flex flex-col gap-2 border-t px-3 py-2.5 first:border-t-0">
            <div className="flex items-center gap-2">
                <span className="text-foreground-primary text-mini flex-1 font-medium">
                    {t(actionKindLabelKey(step.payload.kind))}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    aria-label="Remove action"
                    className="text-foreground-tertiary hover:text-foreground-primary h-6 w-6"
                >
                    <Icons.CrossS className="h-3 w-3" />
                </Button>
            </div>

            {renderPayloadControls(step.payload, updatePayload)}

            <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                    <Label className="text-foreground-tertiary text-mini">Duration</Label>
                    <NumberInput
                        value={`${step.duration}ms`}
                        defaultUnit="ms"
                        units={['ms', 's']}
                        allowKeywords={false}
                        onCommit={(v) => {
                            const parsed = /^([0-9.]+)(ms|s)?/.exec(v.trim());
                            if (!parsed) return;
                            const n = Number.parseFloat(parsed[1] ?? '0');
                            const unit = parsed[2];
                            const ms = unit === 's' ? n * 1000 : n;
                            onChange({ ...step, duration: Math.max(0, Math.round(ms)) });
                        }}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <Label className="text-foreground-tertiary text-mini">Delay</Label>
                    <NumberInput
                        value={`${step.delay}ms`}
                        defaultUnit="ms"
                        units={['ms', 's']}
                        allowKeywords={false}
                        onCommit={(v) => {
                            const parsed = /^([0-9.]+)(ms|s)?/.exec(v.trim());
                            if (!parsed) return;
                            const n = Number.parseFloat(parsed[1] ?? '0');
                            const unit = parsed[2];
                            const ms = unit === 's' ? n * 1000 : n;
                            onChange({ ...step, delay: Math.max(0, Math.round(ms)) });
                        }}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <Label className="text-foreground-tertiary text-mini">Easing</Label>
                    <Select
                        value={easingName}
                        onValueChange={(v) => updateEasing(v as EasingNamed)}
                    >
                        <SelectTrigger className="text-mini h-7">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {EASING_OPTIONS.map((e) => (
                                <SelectItem key={e} value={e}>
                                    {e}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Label className="text-foreground-secondary text-mini flex cursor-pointer items-center gap-1.5">
                <Checkbox
                    checked={step.isInitial}
                    onCheckedChange={(v) => onChange({ ...step, isInitial: Boolean(v) })}
                />
                Set as initial state
            </Label>
        </div>
    );
}

function renderPayloadControls(payload: ActionStepPayload, update: (p: ActionStepPayload) => void) {
    switch (payload.kind) {
        case 'move':
            return <MoveControls payload={payload} update={update} />;
        case 'scale':
            return <ScaleControls payload={payload} update={update} />;
        case 'rotate':
            return <RotateControls payload={payload} update={update} />;
        case 'opacity':
            return <OpacityControls payload={payload} update={update} />;
        case 'size':
            return <SizeControls payload={payload} update={update} />;
        case 'bg-color':
            return <BgColorControls payload={payload} update={update} />;
    }
}

interface PayloadControlProps<P extends ActionStepPayload> {
    payload: P;
    update: (p: ActionStepPayload) => void;
}

function NumericField({
    label,
    value,
    onChange,
    defaultUnit = 'px',
}: {
    label: string;
    value: NumericValue | undefined;
    onChange: (v: NumericValue | undefined) => void;
    defaultUnit?: NumericValue['unit'];
}) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-foreground-tertiary text-mini">{label}</Label>
            <NumberInput
                value={formatNumeric(value, defaultUnit)}
                defaultUnit={defaultUnit}
                onCommit={(v) => onChange(parseNumeric(v, defaultUnit))}
            />
        </div>
    );
}

function MoveControls({ payload, update }: PayloadControlProps<MoveStep>) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <NumericField
                label="X"
                value={payload.x}
                onChange={(v) => update({ ...payload, x: v })}
            />
            <NumericField
                label="Y"
                value={payload.y}
                onChange={(v) => update({ ...payload, y: v })}
            />
        </div>
    );
}

function ScaleControls({ payload, update }: PayloadControlProps<ScaleStep>) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
                <Label className="text-foreground-tertiary text-mini">X</Label>
                <Input
                    className="text-mini h-7"
                    type="number"
                    step="0.05"
                    value={payload.x ?? 1}
                    onChange={(e) =>
                        update({ ...payload, x: Number.parseFloat(e.target.value) || 0 })
                    }
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-foreground-tertiary text-mini">Y</Label>
                <Input
                    className="text-mini h-7"
                    type="number"
                    step="0.05"
                    value={payload.y ?? 1}
                    onChange={(e) =>
                        update({ ...payload, y: Number.parseFloat(e.target.value) || 0 })
                    }
                />
            </div>
        </div>
    );
}

function RotateControls({ payload, update }: PayloadControlProps<RotateStep>) {
    return (
        <div className="grid grid-cols-1 gap-2">
            <NumericField
                label="Z (deg)"
                defaultUnit="deg"
                value={payload.z}
                onChange={(v) => update({ ...payload, z: v ?? { value: 0, unit: 'deg' } })}
            />
        </div>
    );
}

function OpacityControls({ payload, update }: PayloadControlProps<OpacityStep>) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-foreground-tertiary text-mini">Opacity</Label>
            <Input
                className="text-mini h-7"
                type="number"
                min={0}
                max={1}
                step="0.05"
                value={payload.value}
                onChange={(e) =>
                    update({
                        ...payload,
                        value: Math.max(0, Math.min(1, Number.parseFloat(e.target.value) || 0)),
                    })
                }
            />
        </div>
    );
}

function SizeControls({ payload, update }: PayloadControlProps<SizeStep>) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <NumericField
                label="Width"
                value={payload.width}
                onChange={(v) => update({ ...payload, width: v })}
            />
            <NumericField
                label="Height"
                value={payload.height}
                onChange={(v) => update({ ...payload, height: v })}
            />
        </div>
    );
}

function BgColorControls({ payload, update }: PayloadControlProps<BgColorStep>) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-foreground-tertiary text-mini">Color</Label>
            <Input
                className="text-mini h-7"
                placeholder="#ffffff or rgba(...)"
                value={payload.color}
                onChange={(e) => update({ ...payload, color: e.target.value })}
            />
        </div>
    );
}
