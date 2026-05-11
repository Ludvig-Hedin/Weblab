'use client';

import { useState } from 'react';

import { DraftableInput } from '@weblab/ui/draftable-input';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { InputGroup } from '@weblab/ui/input-group';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@weblab/ui/input-otp';
import { Label } from '@weblab/ui/label';
import { NumberInput } from '@weblab/ui/number-input';
import { Textarea } from '@weblab/ui/textarea';

import { Section } from '../section';

export function InputsDemo() {
    const [otp, setOtp] = useState('');
    const [num, setNum] = useState('16');
    return (
        <div id="inputs">
            <Section
                title="Form inputs"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
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
                </div>
            </Section>

            <Section
                title="Textarea"
                tag="inputs"
                inspectId="textarea"
                filePath="packages/ui/src/components/textarea.tsx"
            >
                <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
                    <Textarea placeholder="Write something…" rows={3} />
                    <Textarea
                        defaultValue="Pre-filled value with several lines of content."
                        rows={3}
                    />
                </div>
            </Section>

            <Section
                title="Number input"
                tag="inputs"
                inspectId="number-input"
                filePath="packages/ui/src/components/number-input.tsx"
            >
                <div className="flex flex-wrap items-center gap-4">
                    <div className="space-y-1.5">
                        <Label>Padding</Label>
                        <NumberInput value={num} onCommit={(v) => setNum(v)} defaultUnit="px" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Disabled</Label>
                        <NumberInput value="8" onCommit={() => undefined} disabled />
                    </div>
                </div>
            </Section>

            <Section
                title="Draftable input"
                tag="inputs"
                inspectId="draftable-input"
                filePath="packages/ui/src/components/draftable-input.tsx"
            >
                <div className="flex flex-wrap items-center gap-4">
                    <DraftableInput
                        value="my-project"
                        onChangeValue={() => undefined}
                        className="bg-background border-input text-foreground h-9 w-56 rounded-md border px-3 py-1 text-sm"
                    />
                </div>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Commits the value via <code>onChangeValue</code> on native change.
                </p>
            </Section>

            <Section
                title="Input group"
                tag="inputs"
                inspectId="input-group"
                filePath="packages/ui/src/components/input-group.tsx"
            >
                <div className="flex max-w-md flex-col gap-3">
                    <InputGroup>
                        <DraftableInput
                            value="example"
                            onChangeValue={() => undefined}
                            className="bg-background border-input text-foreground h-9 rounded-md border px-3 text-sm"
                        />
                        <DraftableInput
                            value=".com"
                            onChangeValue={() => undefined}
                            className="bg-background border-input text-foreground h-9 rounded-md border px-3 text-sm"
                        />
                    </InputGroup>
                </div>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Joins multiple <code>DraftableInput</code> children visually.
                </p>
            </Section>

            <Section
                title="OTP"
                tag="inputs"
                inspectId="input-otp"
                filePath="packages/ui/src/components/input-otp.tsx"
            >
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                    </InputOTPGroup>
                </InputOTP>
            </Section>
        </div>
    );
}
