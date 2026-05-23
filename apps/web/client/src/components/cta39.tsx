import { Button } from '@weblab/ui/button';

import { cn } from '@/lib/utils';

interface Button {
    text: string;
    url: string;
    icon?: React.ReactNode;
}
interface Buttons {
    primary?: Button;
    secondary?: Button;
}

interface CtaSimpleProps {
    heading: string;
    description: string;
    buttons?: Buttons;
    className?: string;
}

interface Cta39Props extends CtaSimpleProps {}
type Props = Partial<Cta39Props>;

const defaultProps: Cta39Props = {
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

const Cta39 = (props: Props) => {
    const { heading, description, buttons, className } = {
        ...defaultProps,
        ...props,
    };

    return (
        <section className={cn('py-32', className)}>
            <div className="container mx-auto">
                <div className="mx-auto max-w-5xl rounded-xl border border-dashed border-slate-200 p-8 md:p-12 lg:p-16 dark:border-slate-800">
                    <div className="flex flex-col items-center gap-4 text-center lg:gap-6">
                        <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
                            {heading}
                        </h2>
                        <p className="max-w-2xl text-slate-500 lg:text-lg dark:text-slate-400">
                            {description}
                        </p>
                        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                            {buttons?.primary && (
                                <Button size="pill" asChild>
                                    <a href={buttons.primary.url}>{buttons.primary.text}</a>
                                </Button>
                            )}
                            {buttons?.secondary && (
                                <Button variant="outline" size="pill" asChild>
                                    <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export { Cta39 };
