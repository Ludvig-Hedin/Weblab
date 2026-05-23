'use client';

import { useState } from 'react';

import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { Label } from '@weblab/ui/label';
import { RadioGroup, RadioGroupItem } from '@weblab/ui/radio-group';
import { Slider } from '@weblab/ui/slider';
import { Switch } from '@weblab/ui/switch';
import { Toggle } from '@weblab/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';

import { Section } from '../section';

export function ControlsDemo() {
    const [switchOn, setSwitchOn] = useState(true);
    const [sliderVal, setSliderVal] = useState([40]);

    return (
        <div id="controls">
            <Section
                title="Checkbox"
                tag="controls"
                inspectId="checkbox"
                filePath="packages/ui/src/components/checkbox.tsx"
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
                            <Checkbox id={id} defaultChecked={checked} disabled={disabled} />
                            <Label htmlFor={id} className={disabled ? 'opacity-50' : ''}>
                                {label}
                            </Label>
                        </div>
                    ))}
                    <div className="flex items-center gap-2">
                        <div
                            aria-hidden
                            className="border-input bg-primary text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs"
                            title="Indeterminate (mock — Phase B will render minus icon)"
                        >
                            <Icons.Minus className="size-3" />
                        </div>
                        <Label>Indeterminate</Label>
                    </div>
                </div>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Indeterminate state shown as mock — Checkbox primitive renders CheckIcon for
                    both checked + indeterminate today. Phase B: branch on
                    <code className="mx-1">data-state="indeterminate"</code> to render minus.
                </p>
            </Section>

            <Section title="Radio" tag="controls" inspectId="radio">
                <div className="grid gap-8 sm:grid-cols-2">
                    <div className="space-y-3">
                        <Label className="text-foreground-tertiary text-xs">Horizontal</Label>
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
                    </div>
                    <div className="space-y-3">
                        <Label className="text-foreground-tertiary text-xs">Vertical</Label>
                        <RadioGroup defaultValue="rv1" className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <RadioGroupItem value="rv1" id="drv1" />
                                <Label htmlFor="drv1">Light</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <RadioGroupItem value="rv2" id="drv2" />
                                <Label htmlFor="drv2">Dark</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <RadioGroupItem value="rv3" id="drv3" />
                                <Label htmlFor="drv3">System</Label>
                            </div>
                        </RadioGroup>
                    </div>
                </div>
            </Section>

            <Section title="Switch" tag="controls" inspectId="switch">
                <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                        <Switch id="dsw1" checked={switchOn} onCheckedChange={setSwitchOn} />
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

            <Section
                title="Slider"
                tag="controls"
                inspectId="slider"
                filePath="packages/ui/src/components/slider.tsx"
            >
                <div className="w-full max-w-md space-y-6">
                    <div className="space-y-2">
                        <Label>Value: {sliderVal[0]}</Label>
                        <Slider value={sliderVal} onValueChange={setSliderVal} min={0} max={100} />
                    </div>
                    <div className="space-y-2">
                        <Label>Range</Label>
                        <Slider defaultValue={[20, 80]} />
                    </div>
                    <div className="space-y-3">
                        <Label>Stepped (step = 25)</Label>
                        <Slider defaultValue={[50]} min={0} max={100} step={25} />
                        <div className="text-foreground-tertiary flex justify-between font-mono text-[10px]">
                            <span>0</span>
                            <span>25</span>
                            <span>50</span>
                            <span>75</span>
                            <span>100</span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Disabled</Label>
                        <Slider defaultValue={[30]} disabled />
                    </div>
                </div>
            </Section>

            <Section
                title="Toggle"
                tag="controls"
                inspectId="toggle"
                filePath="packages/ui/src/components/toggle.tsx"
            >
                <div className="grid gap-6">
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">
                            default variant · sizes
                        </Label>
                        <div className="flex items-center gap-3">
                            <Toggle size="sm" aria-label="Underline small">
                                <Icons.TextUnderline className="h-3.5 w-3.5" />
                            </Toggle>
                            <Toggle aria-label="Underline default">
                                <Icons.TextUnderline className="h-4 w-4" />
                            </Toggle>
                            <Toggle size="lg" aria-label="Underline large">
                                <Icons.TextUnderline className="h-4 w-4" />
                            </Toggle>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">outline variant</Label>
                        <div className="flex items-center gap-3">
                            <Toggle variant="outline" size="sm" aria-label="Strike sm">
                                <Icons.TextStrikeThrough className="h-3.5 w-3.5" />
                            </Toggle>
                            <Toggle variant="outline" aria-label="Strike default">
                                <Icons.TextStrikeThrough className="h-4 w-4" />
                            </Toggle>
                            <Toggle variant="outline" size="lg" aria-label="Strike lg">
                                <Icons.TextStrikeThrough className="h-4 w-4" />
                            </Toggle>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">states</Label>
                        <div className="flex items-center gap-3">
                            <Toggle aria-label="Off">
                                <Icons.TextOverline className="h-4 w-4" />
                            </Toggle>
                            <Toggle defaultPressed aria-label="On">
                                <Icons.TextOverline className="h-4 w-4" />
                            </Toggle>
                            <Toggle disabled aria-label="Disabled">
                                <Icons.TextOverline className="h-4 w-4" />
                            </Toggle>
                            <Toggle defaultPressed disabled aria-label="Disabled on">
                                <Icons.TextOverline className="h-4 w-4" />
                            </Toggle>
                        </div>
                    </div>
                </div>
                <p className="text-foreground-tertiary mt-3 text-xs">
                    Use for single binary controls (bold, italic, lock). 4 hand-rolled
                    <code className="mx-1">aria-pressed</code> buttons across the app today should
                    migrate to this.
                </p>
            </Section>

            <Section
                title="Toggle group"
                tag="controls"
                inspectId="toggle-group"
                filePath="packages/ui/src/components/toggle-group.tsx"
            >
                <div className="flex flex-col gap-4">
                    <ToggleGroup type="single" defaultValue="center">
                        <ToggleGroupItem value="left" aria-label="Align left">
                            <Icons.TextAlignLeft className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="center" aria-label="Align center">
                            <Icons.TextAlignCenter className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="right" aria-label="Align right">
                            <Icons.TextAlignRight className="h-4 w-4" />
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <ToggleGroup type="multiple" defaultValue={['left']}>
                        <ToggleGroupItem value="left" aria-label="Align left">
                            <Icons.AlignLeft className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="center" aria-label="Align center">
                            <Icons.AlignCenterHorizontally className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="right" aria-label="Align right">
                            <Icons.AlignRight className="h-4 w-4" />
                        </ToggleGroupItem>
                    </ToggleGroup>
                </div>
            </Section>
        </div>
    );
}
