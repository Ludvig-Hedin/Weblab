import type { NavLink } from './_ui';
import { LogoMark } from './_ui';

export interface FooterColumn {
    title: string;
    links: NavLink[];
}

export interface Footer1Content {
    logoText: string;
    tagline?: string;
    columns: FooterColumn[];
    note: string;
}

export default function Footer1({ content }: { content: Footer1Content }) {
    return (
        <footer className="border-border bg-background border-t">
            <div className="mx-auto max-w-6xl px-6 py-14">
                <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
                    <div className="flex flex-col gap-3">
                        <LogoMark label={content.logoText} />
                        {content.tagline ? (
                            <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
                                {content.tagline}
                            </p>
                        ) : null}
                    </div>
                    {content.columns.map((column, i) => (
                        <div key={i} className="flex flex-col gap-3">
                            <p className="text-foreground text-sm font-medium">{column.title}</p>
                            <ul className="flex flex-col gap-2">
                                {column.links.map((link, j) => (
                                    <li key={j}>
                                        <a
                                            href={link.href}
                                            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="border-border mt-12 border-t pt-6">
                    <p className="text-muted-foreground text-sm">{content.note}</p>
                </div>
            </div>
        </footer>
    );
}
