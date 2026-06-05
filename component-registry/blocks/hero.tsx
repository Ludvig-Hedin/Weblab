import { Button } from '@/components/ui/button';

/**
 * Hero — asymmetric, flat, token-only exemplar. NOT the centered eyebrow-pill +
 * italic-serif-headline + two-pill-buttons slop pattern. Left-aligned, one ink
 * primary action, one quiet text link. Edit copy + tokens, keep the structure.
 */
export function Hero() {
    return (
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-[1.1fr_0.9fr] md:items-center md:gap-16">
            <div className="flex flex-col items-start gap-6">
                <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-6xl">
                    Plan, build, and ship your site in one place
                </h1>
                <p className="max-w-prose text-pretty text-lg leading-relaxed text-muted-foreground">
                    A focused workspace for the work that actually moves a launch forward — no
                    busywork, no clutter.
                </p>
                <div className="flex items-center gap-4 pt-2">
                    <Button size="lg">Start building</Button>
                    <a
                        href="#features"
                        className="rounded-md px-1 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        See how it works
                    </a>
                </div>
            </div>
            <div className="aspect-[4/3] w-full rounded-xl border border-border bg-muted/40" aria-hidden />
        </section>
    );
}
