import { LogoMark } from './_ui';

export interface Logos1Content {
    heading: string;
    /** Brand/customer names rendered as neutral logo marks. */
    logos: string[];
}

export default function Logos1({ content }: { content: Logos1Content }) {
    return (
        <section className="bg-background py-12 lg:py-16" aria-label="Trusted by">
            <div className="mx-auto max-w-6xl px-6">
                <p className="text-muted-foreground text-center text-sm font-medium">
                    {content.heading}
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-70">
                    {content.logos.map((logo, i) => (
                        <LogoMark key={i} label={logo} />
                    ))}
                </div>
            </div>
        </section>
    );
}
