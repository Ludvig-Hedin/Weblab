import { Button } from '@weblab/ui/button';

import { cn } from '@/lib/utils';

interface CtaButton {
    text: string;
    url: string;
    icon?: React.ReactNode;
}
interface Buttons {
    primary?: CtaButton;
    secondary?: CtaButton;
}

interface CtaSimpleProps {
    heading: string;
    description: string;
    buttons?: Buttons;
    className?: string;
}

interface Cta37Props extends CtaSimpleProps {}
type Props = Partial<Cta37Props>;

const defaultProps: Cta37Props = {
    heading: 'Call to Action',
    description: 'Get access to our collection of pre-built blocks and components today.',
    buttons: {
        primary: {
            text: 'Get Access',
            url: 'https://shadcnblocks.com',
        },
        secondary: {
            text: 'Schedule a Demo',
            url: 'https://shadcnblocks.com',
        },
    },
};

const Cta37 = (props: Props) => {
    const { heading, description, buttons, className } = {
        ...defaultProps,
        ...props,
    };

    return (
        <section className={cn('py-32', className)}>
            <div className="container mx-auto">
                <div className="mx-auto grid max-w-5xl items-center gap-8 rounded-lg border border-slate-200 p-8 md:p-12 lg:grid-cols-3 lg:gap-16 lg:p-16 dark:border-slate-800">
                    <div className="flex flex-col gap-4 lg:col-span-2">
                        <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
                            {heading}
                        </h2>
                        <p className="max-w-xl text-slate-500 lg:text-lg dark:text-slate-400">
                            {description}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        {buttons?.primary && (
                            <Button size="pill" className="w-full" asChild>
                                <a href={buttons.primary.url}>{buttons.primary.text}</a>
                            </Button>
                        )}
                        {buttons?.secondary && (
                            <Button variant="outline" size="pill" className="w-full" asChild>
                                <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export { Cta37 };
