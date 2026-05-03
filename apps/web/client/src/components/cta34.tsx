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

interface Cta34Props extends CtaSimpleProps {}
type Props = Partial<Cta34Props>;

const defaultProps: Cta34Props = {
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

const Cta34 = (props: Props) => {
  const { heading, description, buttons, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto">
        <div className="border-t pt-12">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
            <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
              {heading}
            </h2>
            <p className="max-w-2xl text-slate-500 lg:text-lg dark:text-slate-400">
              {description}
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              {buttons?.primary && (
                <Button size="lg" asChild>
                  <a href={buttons.primary.url}>{buttons.primary.text}</a>
                </Button>
              )}
              {buttons?.secondary && (
                <Button variant="outline" size="lg" asChild>
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

export { Cta34 };
