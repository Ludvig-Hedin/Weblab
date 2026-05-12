import { ReactNode } from 'react';

interface EditButtonProps {
    href: string;
    className?: string;
    children: ReactNode;
}

export function EditButton({ href, className, children }: EditButtonProps) {
    return (
        <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
            {children}
        </a>
    );
} 
