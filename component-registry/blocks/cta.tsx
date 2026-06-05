import { Button } from '@/components/ui/button';

/**
 * CTA — flat, single ink action, no gradient, no card-in-card. A hairline top
 * border separates it from the section above instead of a boxed card.
 */
export function Cta() {
    return (
        <section className="border-t border-border">
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-20 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2">
                    <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
                        Ready when you are
                    </h2>
                    <p className="text-pretty text-muted-foreground">
                        Start with a blank canvas and build from there.
                    </p>
                </div>
                <Button size="lg">Start building</Button>
            </div>
        </section>
    );
}
