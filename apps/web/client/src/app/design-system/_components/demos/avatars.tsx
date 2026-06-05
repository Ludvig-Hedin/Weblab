'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';

import { Section } from '../section';

export function AvatarsDemo() {
    return (
        <div id="avatars">
            <Section
                title="Sizes"
                tag="avatars"
                inspectId="avatar"
                filePath="packages/ui/src/components/avatar.tsx"
            >
                <div className="flex items-end gap-4">
                    {[
                        { size: 'h-14 w-14', label: 'xl' },
                        { size: 'h-12 w-12', label: 'lg' },
                        { size: 'h-9 w-9', label: 'md' },
                        { size: 'h-7 w-7', label: 'sm' },
                        { size: 'h-5 w-5', label: 'xs' },
                    ].map(({ size, label }) => (
                        <div key={label} className="flex flex-col items-center gap-1.5">
                            <Avatar className={size}>
                                <AvatarImage src="https://github.com/shadcn.png" alt="User" />
                                <AvatarFallback className="text-xs">LH</AvatarFallback>
                            </Avatar>
                            <p className="text-foreground-tertiary font-mono text-tiny">
                                {label}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Fallbacks" tag="avatars" inspectId="avatar">
                <div className="flex items-end gap-4">
                    <div className="flex flex-col items-center gap-1.5">
                        <Avatar className="h-10 w-10">
                            <AvatarFallback>LH</AvatarFallback>
                        </Avatar>
                        <p className="text-foreground-tertiary font-mono text-tiny">initials</p>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src="https://invalid-image.example/notfound.png" alt="?" />
                            <AvatarFallback>?</AvatarFallback>
                        </Avatar>
                        <p className="text-foreground-tertiary font-mono text-tiny">
                            image error
                        </p>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                        <Avatar className="bg-background-brand h-10 w-10">
                            <AvatarFallback className="text-foreground-primary">WB</AvatarFallback>
                        </Avatar>
                        <p className="text-foreground-tertiary font-mono text-tiny">tinted</p>
                    </div>
                </div>
            </Section>

            <Section title="With status indicator" tag="avatars" inspectId="avatar">
                <div className="flex flex-wrap items-end gap-4">
                    {[
                        { dot: 'bg-green-400', label: 'online' },
                        { dot: 'bg-amber-400', label: 'away' },
                        { dot: 'bg-red-400', label: 'busy' },
                        { dot: 'bg-foreground-tertiary', label: 'offline' },
                    ].map(({ dot, label }) => (
                        <div key={label} className="flex flex-col items-center gap-1.5">
                            <div className="relative">
                                <Avatar className="h-10 w-10">
                                    <AvatarFallback>LH</AvatarFallback>
                                </Avatar>
                                <span
                                    className={`border-background absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 ${dot}`}
                                />
                            </div>
                            <p className="text-foreground-tertiary font-mono text-tiny">
                                {label}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Stacked group" tag="avatars" inspectId="avatar">
                <div className="flex items-center">
                    {['LH', 'WB', 'AB', 'JK', '+5'].map((s, i) => (
                        <Avatar
                            key={s}
                            className={`bg-background-secondary border-background h-8 w-8 border-2 ${
                                i > 0 ? '-ml-2' : ''
                            }`}
                        >
                            <AvatarFallback>{s}</AvatarFallback>
                        </Avatar>
                    ))}
                </div>
            </Section>
        </div>
    );
}
