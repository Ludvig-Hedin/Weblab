import { Check } from 'lucide-react';

import { Icons } from '@weblab/ui/icons';

interface ModelOption {
    name: string;
    description: string;
    icon: React.ReactNode;
    selected?: boolean;
}

const MODELS: ModelOption[] = [
    {
        name: 'Auto',
        description: 'The most suitable model for the job',
        icon: <Icons.Sparkles className="h-4 w-4 text-zinc-700" />,
        selected: true,
    },
    {
        name: 'GPT-5.5',
        description: 'Flagship GPT model for complex tasks',
        icon: <BrandDot className="bg-emerald-600">G</BrandDot>,
    },
    {
        name: 'Claude Sonnet 4.6',
        description: 'Anthropic’s flagship, industry-leading for coding',
        icon: <BrandDot className="bg-orange-600">C</BrandDot>,
    },
    {
        name: 'Claude Opus 4.7',
        description: 'Most capable Claude for the hardest problems',
        icon: <BrandDot className="bg-orange-700">C</BrandDot>,
    },
    {
        name: 'Gemini 3.1 Pro',
        description: 'Google’s frontier multimodal model',
        icon: <Icons.GeminiLogo className="h-4 w-4" />,
    },
    {
        name: 'DeepSeek V4 Pro',
        description: 'Open-weight reasoning at frontier quality',
        icon: <BrandDot className="bg-blue-600">D</BrandDot>,
    },
];

function BrandDot({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <span
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white ${className ?? ''}`}
        >
            {children}
        </span>
    );
}

function ModelPicker() {
    return (
        <div className="rounded-2xl border border-white/40 bg-white/85 p-2 shadow-2xl backdrop-blur-xl">
            {MODELS.map((m, i) => (
                <div key={m.name}>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                            {m.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium text-zinc-900">
                                {m.name}
                            </div>
                            <div className="truncate text-[11px] text-zinc-500">
                                {m.description}
                            </div>
                        </div>
                        {m.selected && (
                            <Check className="h-4 w-4 shrink-0 text-zinc-900" />
                        )}
                    </div>
                    {i === 0 && (
                        <div className="mx-3 my-0.5 border-t border-zinc-200/80" />
                    )}
                </div>
            ))}
        </div>
    );
}

function Headline() {
    return (
        <div className="max-w-md">
            <div className="text-mini font-mono tracking-wider text-white/70 uppercase">
                Model agnostic
            </div>
            <h2 className="mt-3 text-2xl leading-[1.15] font-light text-balance text-white md:text-4xl">
                Only use the AI models that work best for you. With Weblab, you
                can choose and switch between leading models as you need.
            </h2>
        </div>
    );
}

export function ModelAgnosticSection() {
    return (
        <section
            className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32"
            id="model-agnostic"
        >
            <div className="border-foreground-primary/10 bg-background-weblab/40 relative overflow-hidden rounded-3xl border">
                {/* Background visual */}
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-700" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,210,160,0.18),transparent_55%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(120,140,255,0.18),transparent_55%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,0.45)_100%)]" />
                </div>

                {/* Mobile: stacked column */}
                <div className="relative flex flex-col gap-10 px-6 py-10 md:hidden">
                    <Headline />
                    <ModelPicker />
                </div>

                {/* Desktop: overlay layout */}
                <div className="relative hidden aspect-[16/7] w-full md:block">
                    <div className="absolute top-1/2 left-16 w-[22rem] max-w-[88%] -translate-y-1/2">
                        <ModelPicker />
                    </div>
                    <div className="absolute top-1/2 right-16 max-w-md -translate-y-1/2">
                        <Headline />
                    </div>
                </div>
            </div>
        </section>
    );
}
