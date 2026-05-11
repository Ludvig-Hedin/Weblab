'use client';

import { useState } from 'react';

import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { Label } from '@weblab/ui/label';
import { RadioGroup, RadioGroupItem } from '@weblab/ui/radio-group';
import { Slider } from '@weblab/ui/slider';
import { Switch } from '@weblab/ui/switch';
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
                        { id: 'c4', label: 'Disabled checked', checked: true, disabled: true },
                    ].map(({ id, label, checked, disabled }) => (
                        <div key={id} className="flex items-center gap-2">
                            <Checkbox id={id} defaultChecked={checked} disabled={disabled} />
                            <Label htmlFor={id} className={disabled ? 'opacity-50' : ''}>
                                {label}
                            </Label>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Radio" tag="controls" inspectId="radio">
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
                    <div className="space-y-2">
                        <Label>Disabled</Label>
                        <Slider defaultValue={[30]} disabled />
                    </div>
                </div>
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
