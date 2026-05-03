import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

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

interface Cta38Props extends CtaSimpleProps {}
type Props = Partial<Cta38Props>;

const defaultProps: Cta38Props = {
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

const Cta38 = (props: Props) => {
  const { heading, description, buttons, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto">
        <div className="mx-auto max-w-5xl rounded-xl bg-slate-950 p-8 text-white md:p-12 lg:p-16 dark:bg-slate-50 dark:text-slate-950">
          <div className="flex flex-col items-center gap-4 text-center lg:gap-6">
            <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">
              {heading}
            </h2>
            <p className="max-w-2xl text-white/70 lg:text-lg dark:text-slate-950/70">
              {description}
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              {buttons?.primary && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="bg-white text-slate-950 hover:bg-white/90 dark:bg-slate-950 dark:text-slate-50 dark:hover:bg-slate-950/90"
                  asChild
                >
                  <a href={buttons.primary.url}>{buttons.primary.text}</a>
                </Button>
              )}
              {buttons?.secondary && (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 hover:text-white dark:border-slate-950/30 dark:text-slate-950 dark:hover:bg-slate-950/10 dark:hover:text-slate-950"
                  asChild
                >
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

export { Cta38 };
