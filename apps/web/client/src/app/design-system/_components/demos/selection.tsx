'use client';

import { Icons } from '@weblab/ui/icons';
import { Label } from '@weblab/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@weblab/ui/select';

import { Section } from '../section';

export function SelectionDemo() {
    return (
        <div id="selection">
            <Section
                title="Select"
                tag="selection"
                inspectId="select"
                filePath="packages/ui/src/components/select.tsx"
            >
                <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="ds-sel-a">Default</Label>
                        <Select>
                            <SelectTrigger id="ds-sel-a">
                                <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="a">Option A</SelectItem>
                                <SelectItem value="b">Option B</SelectItem>
                                <SelectItem value="c">Option C</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-sel-b">Grouped</Label>
                        <Select>
                            <SelectTrigger id="ds-sel-b">
                                <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Owned</SelectLabel>
                                    <SelectItem value="p1">Project 1</SelectItem>
                                    <SelectItem value="p2">Project 2</SelectItem>
                                </SelectGroup>
                                <SelectSeparator />
                                <SelectGroup>
                                    <SelectLabel>Shared</SelectLabel>
                                    <SelectItem value="p3">Project 3</SelectItem>
                                    <SelectItem value="p4">Project 4</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-sel-c">With icon</Label>
                        <Select>
                            <SelectTrigger id="ds-sel-c">
                                <Icons.Globe className="mr-2 h-3.5 w-3.5" />
                                <SelectValue placeholder="Region" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="us">United States</SelectItem>
                                <SelectItem value="eu">Europe</SelectItem>
                                <SelectItem value="ap">Asia Pacific</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ds-sel-d">Disabled</Label>
                        <Select disabled>
                            <SelectTrigger id="ds-sel-d">
                                <SelectValue placeholder="Disabled" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="x">x</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Section>
        </div>
    );
}
