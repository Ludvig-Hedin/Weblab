'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';

import { Section } from '../section';

export function AvatarsDemo() {
    return (
        <div id="avatars">
            <Section
                title="Avatar"
                tag="avatars"
                inspectId="avatar"
                filePath="packages/ui/src/components/avatar.tsx"
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
                                <AvatarImage src="https://github.com/shadcn.png" alt="User" />
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
                        <p className="text-foreground-tertiary font-mono text-[10px]">fallback</p>
                    </div>
                    <div className="flex items-center">
                        {['LH', 'WB', 'AB', '+3'].map((s, i) => (
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
                </div>
            </Section>
        </div>
    );
}
