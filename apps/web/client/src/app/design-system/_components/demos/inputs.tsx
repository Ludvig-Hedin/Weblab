'use client';

import { useState } from 'react';

import { Button } from '@weblab/ui/button';
import { DraftableInput } from '@weblab/ui/draftable-input';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { InputGroup } from '@weblab/ui/input-group';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@weblab/ui/input-otp';
import { Kbd } from '@weblab/ui/kbd';
import { Label } from '@weblab/ui/label';
import { NumberInput } from '@weblab/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Textarea } from '@weblab/ui/textarea';

import { Section } from '../section';

export function InputsDemo() {
    const [otp, setOtp] = useState('');
    const [num, setNum] = useState('16');
    const [pwd, setPwd] = useState('hunter2');
    const [showPwd, setShowPwd] = useState(false);
    const [search, setSearch] = useState('weblab');
    const [clearable, setClearable] = useState('Click X to clear');
    const [inline, setInline] = useState('inline-edit');
    return (
        <div id="inputs">
            <Section
                title="Input variants"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <p className="text-foreground-tertiary mb-4 max-w-2xl text-xs">
                    Two surface styles. Use{' '}
                    <code className="font-mono">variant=&quot;primary&quot;</code> (default) for
                    standard form fields — solid fill, clearly visible in dark mode. Use{' '}
                    <code className="font-mono">variant=&quot;ghost&quot;</code> for search and
                    filter fields — transparent bg, border only.
                </p>
                <div className="grid max-w-xl grid-cols-[6rem_1fr] items-center gap-x-4 gap-y-3">
                    <span className="text-foreground-tertiary font-mono text-tiny">primary</span>
                    <Input variant="primary" placeholder="Enter value…" />
                    <span className="text-foreground-tertiary font-mono text-tiny">ghost</span>
                    <div className="relative">
                        <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input variant="ghost" placeholder="Search…" className="pl-9" />
                    </div>
                </div>
            </Section>

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
                    <div className="space-y-2">
                        <Label htmlFor="ds-i4">Email (with value)</Label>
                        <Input id="ds-i4" type="email" defaultValue="hello@weblab.build" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-i5">Read-only</Label>
                        <Input id="ds-i5" defaultValue="readonly-value" readOnly />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-i6">Required</Label>
                        <Input id="ds-i6" placeholder="Required field" required />
                    </div>
                </div>
            </Section>

            <Section title="Validation states" tag="inputs" inspectId="input">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="ds-iv-ok">Valid</Label>
                        <div className="relative">
                            <Input
                                id="ds-iv-ok"
                                defaultValue="hello@weblab.build"
                                className="border-success/60 pr-9"
                            />
                            <Icons.CheckCircled className="text-foreground-success absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                        </div>
                        <p className="text-foreground-success text-xs">Looks good.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iv-warn">Warning</Label>
                        <Input
                            id="ds-iv-warn"
                            defaultValue="weak-password"
                            className="border-warning/60"
                        />
                        <p className="text-foreground-warning text-xs">
                            Use at least 12 characters.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iv-err">Error</Label>
                        <Input
                            id="ds-iv-err"
                            defaultValue="invalid-email"
                            className="border-destructive"
                        />
                        <p className="text-destructive text-xs">Enter a valid email.</p>
                    </div>
                </div>
            </Section>

            <Section title="Password with reveal" tag="inputs" inspectId="input">
                <div className="max-w-sm space-y-2">
                    <Label htmlFor="ds-pwd">Password</Label>
                    <div className="relative">
                        <Input
                            id="ds-pwd"
                            type={showPwd ? 'text' : 'password'}
                            value={pwd}
                            onChange={(e) => setPwd(e.target.value)}
                            className="pr-9"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPwd((v) => !v)}
                            className="text-foreground-tertiary hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 p-1"
                            aria-label={showPwd ? 'Hide password' : 'Show password'}
                        >
                            {showPwd ? (
                                <Icons.EyeClosed className="h-4 w-4" />
                            ) : (
                                <Icons.EyeOpen className="h-4 w-4" />
                            )}
                        </button>
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
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">Default</Label>
                        <Textarea placeholder="Write something…" rows={3} />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">Prefilled</Label>
                        <Textarea
                            defaultValue="Pre-filled value with several lines of content."
                            rows={3}
                        />
                    </div>
                </div>
                <div className="mt-6 grid w-full max-w-xl gap-5">
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">Small · min-h-12</Label>
                        <Textarea placeholder="Short note…" className="min-h-12" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">Large · min-h-24</Label>
                        <Textarea placeholder="Long-form description…" className="min-h-24" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">
                            Resizable · drag bottom-right
                        </Label>
                        <Textarea
                            defaultValue="Drag the bottom-right corner to resize."
                            className="resize-y"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">
                            With character counter
                        </Label>
                        <div className="grid gap-1">
                            <Textarea
                                defaultValue="Hello world."
                                maxLength={280}
                                className="min-h-20"
                            />
                            <div className="text-foreground-tertiary text-right text-tiny tabular-nums">
                                12 / 280
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground-tertiary text-xs">
                            Invalid · aria-invalid
                        </Label>
                        <Textarea defaultValue="Required field" aria-invalid />
                    </div>
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
                    <div className="space-y-1.5">
                        <Label>Compact · h-7</Label>
                        <NumberInput
                            value="12"
                            onCommit={() => undefined}
                            defaultUnit="px"
                            className="min-w-[6rem]"
                        />
                    </div>
                </div>

                <div className="mt-6 grid w-full max-w-2xl gap-5">
                    <div className="space-y-1.5">
                        <Label className="text-foreground-tertiary text-xs">
                            Step buttons · flanking − / +
                        </Label>
                        <div className="flex items-stretch gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Decrement"
                            >
                                <Icons.Minus className="h-3.5 w-3.5" />
                            </Button>
                            <NumberInput
                                value={num}
                                onCommit={(v) => setNum(v)}
                                defaultUnit="px"
                                className="min-w-[6rem]"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Increment"
                            >
                                <Icons.Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <p className="text-foreground-tertiary text-xs">
                            Today: 9 places hand-roll <code>+</code>/<code>−</code> around a raw
                            <code className="mx-1">{'<input type="number">'}</code>. Bake this into
                            <code className="mx-1">NumberInput</code> as
                            <code className="ml-1">showStepButtons</code>.
                        </p>
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

            <Section
                title="Sizes"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <div className="grid max-w-2xl grid-cols-[5rem_1fr] items-center gap-x-4 gap-y-3">
                    <Label className="text-foreground-tertiary text-xs">xs · h-7</Label>
                    <Input size="xs" placeholder="xs input" />
                    <Label className="text-foreground-tertiary text-xs">sm · h-8</Label>
                    <Input size="sm" placeholder="sm input" />
                    <Label className="text-foreground-tertiary text-xs">default · h-9</Label>
                    <Input placeholder="default input" />
                    <Label className="text-foreground-tertiary text-xs">lg · h-10</Label>
                    <Input size="lg" placeholder="lg input" />
                </div>
                <p className="text-foreground-tertiary mt-3 text-xs">
                    Four sizes ship via <code>size</code> prop. Match <code>SelectTrigger</code>{' '}
                    heights so Input + Select align in any form row.
                </p>
            </Section>

            <Section
                title="Alignment with Select"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <p className="text-foreground-tertiary mb-4 max-w-prose text-xs">
                    Input and SelectTrigger share heights, radius, border, and padding. Drop them
                    side-by-side in any form row — they line up.
                </p>
                <div className="grid max-w-3xl grid-cols-[5rem_1fr_1fr] items-center gap-x-4 gap-y-3">
                    <Label className="text-foreground-tertiary text-xs">xs</Label>
                    <Input size="xs" placeholder="Input xs" />
                    <Select>
                        <SelectTrigger size="xs" className="w-full">
                            <SelectValue placeholder="Select xs" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="a">Option A</SelectItem>
                            <SelectItem value="b">Option B</SelectItem>
                        </SelectContent>
                    </Select>

                    <Label className="text-foreground-tertiary text-xs">sm</Label>
                    <Input size="sm" placeholder="Input sm" />
                    <Select>
                        <SelectTrigger size="sm" className="w-full">
                            <SelectValue placeholder="Select sm" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="a">Option A</SelectItem>
                            <SelectItem value="b">Option B</SelectItem>
                        </SelectContent>
                    </Select>

                    <Label className="text-foreground-tertiary text-xs">default</Label>
                    <Input placeholder="Input default" />
                    <Select>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="a">Option A</SelectItem>
                            <SelectItem value="b">Option B</SelectItem>
                        </SelectContent>
                    </Select>

                    <Label className="text-foreground-tertiary text-xs">lg</Label>
                    <Input size="lg" placeholder="Input lg" />
                    <Select>
                        <SelectTrigger size="lg" className="w-full">
                            <SelectValue placeholder="Select lg" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="a">Option A</SelectItem>
                            <SelectItem value="b">Option B</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Section>

            <Section
                title="With addons"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="ds-iadd-1">Leading icon</Label>
                        <div className="relative">
                            <Icons.EnvelopeClosed className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                            <Input
                                id="ds-iadd-1"
                                placeholder="hello@weblab.build"
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iadd-2">Trailing icon</Label>
                        <div className="relative">
                            <Input id="ds-iadd-2" placeholder="Select option" className="pr-9" />
                            <Icons.ChevronDown className="text-foreground-tertiary pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iadd-3">Leading icon + trailing chip</Label>
                        <div className="relative">
                            <Icons.LockClosed className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                            <Input id="ds-iadd-3" defaultValue="hunter2" className="pr-16 pl-9" />
                            <span className="bg-muted text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 py-0.5 text-tiny font-medium">
                                12+
                            </span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iadd-4">Trailing button (paste)</Label>
                        <div className="relative">
                            <Input id="ds-iadd-4" placeholder="Paste link" className="pr-16" />
                            <Button
                                size="compact"
                                variant="ghost"
                                className="absolute top-1/2 right-1 -translate-y-1/2"
                            >
                                Paste
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iadd-5">Prefix text</Label>
                        <div className="border-input bg-background flex items-center overflow-hidden rounded-full border">
                            <span className="text-foreground-tertiary border-input border-r px-3 text-sm">
                                https://
                            </span>
                            <Input
                                id="ds-iadd-5"
                                defaultValue="weblab.build"
                                className="border-0 shadow-none focus-visible:ring-0"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-iadd-6">Suffix text</Label>
                        <div className="border-input bg-background flex items-center overflow-hidden rounded-full border">
                            <Input
                                id="ds-iadd-6"
                                defaultValue="my-project"
                                className="border-0 shadow-none focus-visible:ring-0"
                            />
                            <span className="text-foreground-tertiary border-input border-l px-3 text-sm">
                                .com
                            </span>
                        </div>
                    </div>
                </div>
            </Section>

            <Section
                title="Clearable"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <div className="max-w-sm space-y-2">
                    <Label htmlFor="ds-iclr">Project name</Label>
                    <div className="relative">
                        <Input
                            id="ds-iclr"
                            value={clearable}
                            onChange={(e) => setClearable(e.target.value)}
                            className="pr-9"
                        />
                        {clearable.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setClearable('')}
                                aria-label="Clear input"
                                className="text-foreground-tertiary hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 transition-colors"
                            >
                                <Icons.CrossCircled className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
            </Section>

            <Section
                title="Search input"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="ds-isearch-1">Search (with kbd hint)</Label>
                        <div className="relative">
                            <Icons.MagnifyingGlass className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                            <Input
                                id="ds-isearch-1"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search projects…"
                                className="pr-20 pl-9"
                            />
                            <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                                {search.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        aria-label="Clear search"
                                        className="text-foreground-tertiary hover:text-foreground rounded-full p-1"
                                    >
                                        <Icons.CrossCircled className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <Kbd>⌘K</Kbd>
                            </span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-isearch-2">Loading</Label>
                        <div className="relative">
                            <Icons.MagnifyingGlass className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                            <Input
                                id="ds-isearch-2"
                                defaultValue="searching…"
                                className="pr-9 pl-9"
                            />
                            <Icons.LoadingSpinner className="text-foreground-tertiary absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin" />
                        </div>
                    </div>
                </div>
            </Section>

            <Section
                title="Inline / borderless"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <div className="max-w-sm space-y-2">
                    <Label htmlFor="ds-iinline">Filename</Label>
                    <Input
                        id="ds-iinline"
                        value={inline}
                        onChange={(e) => setInline(e.target.value)}
                        className="hover:border-input focus:border-input border-transparent bg-transparent px-2 shadow-none focus-visible:ring-0"
                    />
                </div>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Borderless until hover / focus. Used by inline filename and dropdown filter
                    inputs.
                </p>
            </Section>

            <Section
                title="Inspector / compact numeric"
                tag="inputs"
                inspectId="number-input"
                filePath="packages/ui/src/components/number-input.tsx"
            >
                <div className="grid max-w-md grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Width</Label>
                        <NumberInput value={num} onCommit={(v) => setNum(v)} defaultUnit="px" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Height</Label>
                        <NumberInput value="auto" onCommit={() => undefined} defaultUnit="px" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">X</Label>
                        <NumberInput value="0" onCommit={() => undefined} defaultUnit="px" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Y</Label>
                        <NumberInput value="0" onCommit={() => undefined} defaultUnit="px" />
                    </div>
                </div>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Tight 2-column grid for the inspector / style tab — matches{' '}
                    <code>right-panel/style-tab-v2/controls/*</code>.
                </p>
            </Section>

            <Section
                title="States grid"
                tag="inputs"
                inspectId="input"
                filePath="packages/ui/src/components/input.tsx"
            >
                <div className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Default</Label>
                        <Input placeholder="placeholder" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">With value</Label>
                        <Input defaultValue="hello@weblab.build" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Disabled</Label>
                        <Input defaultValue="disabled" disabled />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Read-only</Label>
                        <Input defaultValue="read-only" readOnly />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Invalid</Label>
                        <Input defaultValue="bad value" aria-invalid />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Success</Label>
                        <div className="relative">
                            <Input
                                defaultValue="hello@weblab.build"
                                className="border-success/60 pr-9"
                            />
                            <Icons.CheckCircled className="text-foreground-success absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                        </div>
                    </div>
                </div>
            </Section>
        </div>
    );
}
