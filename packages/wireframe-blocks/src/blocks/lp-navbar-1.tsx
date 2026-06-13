import type { NavLink } from './_ui';
import { Button } from '../vendor/ui/button';
import { LogoMark } from './_ui';

export interface LpNavbar1Content {
    logoText: string;
    links: NavLink[];
    ctaLabel: string;
}

export default function LpNavbar1({ content }: { content: LpNavbar1Content }) {
    return (
        <header className="border-border bg-background w-full border-b">
            <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
                <LogoMark label={content.logoText} />
                <ul className="hidden items-center gap-8 md:flex">
                    {content.links.map((link, i) => (
                        <li key={i}>
                            <a
                                href={link.href}
                                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
                            >
                                {link.label}
                            </a>
                        </li>
                    ))}
                </ul>
                <Button asChild>
                    <a href="#">{content.ctaLabel}</a>
                </Button>
            </nav>
        </header>
    );
}
