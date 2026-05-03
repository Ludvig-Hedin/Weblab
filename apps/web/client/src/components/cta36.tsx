import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

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

interface Cta36Props extends CtaSimpleProps {}
type Props = Partial<Cta36Props>;

const defaultProps: Cta36Props = {
  heading: "Call to Action",
  description:
    "Get access to our collection of pre-built blocks and components today.",
  buttons: {
    primary: {
      text: "Get Access",
      url: "https://shadcnblocks.com",
    },
    secondary: {
      text: "Schedule a Demo",
      url: "https://shadcnblocks.com",
    },
  },
};

const Cta36 = (props: Props) => {
  const { heading, description, buttons, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 border-b pb-12 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
              {heading}
            </h2>
            <p className="max-w-xl text-slate-500 lg:text-lg dark:text-slate-400">
              {description}
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            {buttons?.secondary && (
              <Button variant="outline" size="lg" asChild>
                <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
              </Button>
            )}
            {buttons?.primary && (
              <Button size="lg" asChild>
                <a href={buttons.primary.url}>{buttons.primary.text}</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Cta36 };
