import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — merge conditional class names and resolve Tailwind conflicts.
 * Every component in this registry imports this from `@/lib/utils`. When the
 * shadcn CLI installs a component into a user project it creates this file
 * automatically; this copy is the canonical reference.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
