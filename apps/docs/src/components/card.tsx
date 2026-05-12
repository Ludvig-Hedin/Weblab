import Link from 'next/link';
import type { ReactNode } from 'react';

interface CardProps {
    title: string;
    href: string;
    children?: ReactNode;
    className?: string;
}

export function Card({ title, href, children, className }: CardProps) {
    return (
        <Link
            href={href}
            className={
                className ??
                'group rounded-2xl border border-fd-foreground/10 bg-fd-background/80 p-4 shadow-sm transition-colors hover:border-fd-primary/40 hover:bg-fd-secondary/30'
            }
        >
            <div className="space-y-2">
                <h3 className="text-base font-medium text-fd-foreground group-hover:text-fd-primary">
                    {title}
                </h3>
                {children ? <div className="text-sm text-fd-muted-foreground">{children}</div> : null}
            </div>
        </Link>
    );
}

interface CardHeaderProps {
    children: ReactNode;
    className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
    return <div className={className ?? 'space-y-1'}>{children}</div>;
}

interface CardTitleProps {
    children: ReactNode;
    className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
    return <h3 className={className ?? 'text-base font-semibold tracking-tight'}>{children}</h3>;
}

interface CardDescriptionProps {
    children: ReactNode;
    className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
    return <p className={className ?? 'text-sm text-fd-muted-foreground'}>{children}</p>;
}

interface CardContentProps {
    children: ReactNode;
    className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
    return <div className={className ?? 'pt-2'}>{children}</div>;
}
