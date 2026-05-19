'use client';

import { useTranslations } from 'next-intl';

import type { TabContent, TerminalLine } from '@/components/ui/terminal-animation';
import { Reveal } from '@/components/motion/reveal';
import {
    TerminalAnimationBackgroundGradient,
    TerminalAnimationBlinkingCursor,
    TerminalAnimationCommandBar,
    TerminalAnimationContainer,
    TerminalAnimationContent,
    TerminalAnimationOutput,
    TerminalAnimationRoot,
    TerminalAnimationTabList,
    TerminalAnimationTabTrigger,
    TerminalAnimationTrailingPrompt,
    TerminalAnimationWindow,
} from '@/components/ui/terminal-animation';
import { cn } from '@/lib/utils';

// Brand-aligned color tokens for terminal lines.
// Stick to brand blue + neutral grays — no rainbow.
const C = {
    brand: 'text-[var(--foreground-brand)]',
    ok: 'text-[var(--foreground-brand)]',
    head: 'text-foreground-primary',
    mute: 'text-foreground-secondary',
    faint: 'text-foreground-tertiary',
} as const;

const tabs: TabContent[] = [
    {
        label: 'install',
        command: 'bun install',
        lines: [
            { text: '', delay: 80 },
            { text: 'added 1,247 packages in 12s', color: C.ok, delay: 400 },
            { text: '', delay: 80 },
            { text: '  +-----------------------+', color: C.brand, delay: 120 },
            { text: '  |        WEBLAB         |', color: C.brand, delay: 120 },
            { text: '  |   Design meets code   |', color: C.brand, delay: 120 },
            { text: '  +-----------------------+', color: C.brand, delay: 160 },
            { text: '', delay: 80 },
            { text: '  found 0 vulnerabilities', color: C.ok, delay: 250 },
        ],
    },
    {
        label: 'build',
        command: 'bun run build',
        lines: [
            { text: '', delay: 80 },
            { text: '  ▲ Next.js 16.1.6', color: C.head, delay: 300 },
            { text: '', delay: 80 },
            {
                text: '  Creating an optimized production build...',
                color: C.mute,
                delay: 250,
            },
            { text: '  ✓ Compiled successfully', color: C.ok, delay: 200 },
            {
                text: '  ✓ Linting and checking validity of types',
                color: C.ok,
                delay: 150,
            },
            { text: '  ✓ Generating static pages (12/12)', color: C.ok, delay: 150 },
            {
                text: '  Route (app)  /  142 kB  |  First Load JS 198 kB',
                color: C.faint,
                delay: 150,
            },
            {
                text: '  Route (app)  /blog 61 kB | First Load JS 57 kB',
                color: C.faint,
                delay: 150,
            },
            {
                text: '  Route (app)  /about 75 kB | First Load JS 92 kB',
                color: C.faint,
                delay: 150,
            },
            { text: '', delay: 80 },
            { text: '  ✓ Build completed in 4.2s', color: C.ok, delay: 300 },
        ],
    },
    {
        label: 'deploy',
        command: 'weblab deploy --prod',
        lines: [
            { text: '', delay: 80 },
            { text: '  Weblab CLI 1.6.0', color: C.mute, delay: 200 },
            { text: '', delay: 80 },
            { text: '  > Deploying to production...', color: C.brand, delay: 300 },
            { text: '', delay: 80 },
            { text: '  ✓ Building', color: C.ok, delay: 250 },
            { text: '  ✓ Uploading', color: C.ok, delay: 200 },
            { text: '  ✓ Finalizing', color: C.ok, delay: 200 },
            { text: '', delay: 80 },
            { text: '  Production: https://weblab.build', color: C.brand, delay: 400 },
            { text: '', delay: 80 },
            { text: '  ✓ Deployment complete', color: C.ok, delay: 250 },
        ],
    },
    {
        label: 'test',
        command: 'bun test',
        lines: [
            { text: '', delay: 80 },
            { text: '  PASS  src/components/Button.test.tsx', color: C.mute, delay: 200 },
            { text: '    ✓ renders correctly', color: C.ok, delay: 100 },
            { text: '    ✓ handles click events', color: C.ok, delay: 100 },
            { text: '  PASS  src/utils/format.test.ts', color: C.mute, delay: 150 },
            { text: '    ✓ formats currency', color: C.ok, delay: 100 },
            { text: '    ✓ formats dates', color: C.ok, delay: 100 },
            { text: '', delay: 80 },
            { text: '  Test Suites: 2 passed, 2 total', color: C.ok, delay: 200 },
            { text: '  Tests:       4 passed, 4 total', color: C.ok, delay: 150 },
            { text: '  Time:        1.234 s', color: C.faint, delay: 100 },
        ],
    },
];

export function TerminalSection() {
    const t = useTranslations('landing.terminalSection');
    return (
        <section
            className="bg-background relative flex w-screen items-center justify-center overflow-hidden py-20 md:py-28"
            id="terminal"
        >
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-4 sm:px-6 md:flex-row md:gap-16 md:px-8">
                {/* Copy — left */}
                <Reveal className="w-full max-w-md text-left">
                    <h2 className="heading-style-h3 text-foreground-primary mb-4 tracking-tight text-balance">
                        {t('heading')}
                    </h2>
                    <p className="text-foreground-secondary max-w-sm text-base leading-relaxed font-light tracking-tight">
                        {t('body')}
                    </p>
                </Reveal>

                {/* Terminal — right */}
                <div className="w-full flex-1">
                    <TerminalAnimationRoot
                        alwaysDark={true}
                        className="relative flex w-full justify-center"
                        defaultActiveTab={0}
                        hideCursorOnComplete={false}
                        loopTabs={true}
                        tabs={tabs}
                    >
                        <TerminalAnimationBackgroundGradient />
                        <TerminalAnimationContainer className="max-w-[43rem] px-0">
                            <TerminalAnimationWindow className="border-foreground-primary/10 outline-foreground-primary/10 outline-1 outline-offset-[2px]">
                                <TerminalAnimationContent className="min-h-[24rem]">
                                    <div className="flex items-center gap-2 leading-relaxed">
                                        <span className="text-foreground-tertiary font-mono text-[10px] select-none md:text-sm">
                                            $
                                        </span>
                                        <TerminalAnimationCommandBar
                                            className="text-foreground-primary font-mono text-[10px] md:text-sm"
                                            cursor={<TerminalAnimationBlinkingCursor />}
                                        />
                                    </div>

                                    <TerminalAnimationOutput
                                        className="mt-1"
                                        renderLine={(
                                            line: TerminalLine,
                                            _i: number,
                                            visible: boolean,
                                        ) => {
                                            if (!visible) {
                                                return null;
                                            }
                                            return (
                                                <div className="leading-relaxed">
                                                    <span
                                                        className={cn(
                                                            'font-mono text-[10px] md:text-sm',
                                                            line.color ??
                                                                'text-foreground-secondary',
                                                        )}
                                                    >
                                                        {line.text || ' '}
                                                    </span>
                                                </div>
                                            );
                                        }}
                                    />
                                    <TerminalAnimationTrailingPrompt className="mt-1 flex items-center gap-2 leading-relaxed">
                                        <span className="text-foreground-tertiary font-mono text-sm select-none">
                                            $
                                        </span>
                                        <TerminalAnimationBlinkingCursor />
                                    </TerminalAnimationTrailingPrompt>
                                </TerminalAnimationContent>

                                <div className="flex justify-center pb-6">
                                    <TerminalAnimationTabList className="border-foreground-primary/10 bg-foreground-primary/5 inline-flex items-center gap-0 rounded-lg border px-1 py-1">
                                        {tabs.map((tab, i) => (
                                            <TerminalAnimationTabTrigger
                                                className={cn(
                                                    'cursor-pointer rounded-md px-3.5 py-1 font-mono text-xs transition-all duration-150 md:text-sm',
                                                    'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-medium',
                                                    'data-[state=inactive]:text-foreground-secondary data-[state=inactive]:hover:text-foreground-primary',
                                                )}
                                                index={i}
                                                key={tab.label}
                                            >
                                                {tab.label}
                                            </TerminalAnimationTabTrigger>
                                        ))}
                                    </TerminalAnimationTabList>
                                </div>
                            </TerminalAnimationWindow>
                        </TerminalAnimationContainer>
                    </TerminalAnimationRoot>
                </div>
            </div>
        </section>
    );
}
