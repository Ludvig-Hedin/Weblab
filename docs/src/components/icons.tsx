import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function ArrowLeft({ className, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
            {...props}
        >
            <path d="M15 18l-6-6 6-6" />
            <path d="M9 12h12" />
        </svg>
    );
}

function WeblabLogo({ className, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={className}
            {...props}
        >
            <circle cx="12" cy="12" r="9" className="fill-current opacity-15" />
            <path
                d="M8.5 14.5l3.2-6 3.8 2.5-2.1 4.1-4.9-.6Z"
                className="fill-current"
            />
        </svg>
    );
}

function GitHubLogo({ className, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={className}
            {...props}
        >
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.68c-2.78.6-3.37-1.19-3.37-1.19-.45-1.14-1.11-1.45-1.11-1.45-.91-.62.07-.61.07-.61 1 .07 1.52 1.05 1.52 1.05.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.1.39-2 1.03-2.71-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.04a9.5 9.5 0 0 1 5 0c1.91-1.31 2.75-1.04 2.75-1.04.55 1.38.2 2.4.1 2.65.64.71 1.03 1.61 1.03 2.71 0 3.85-2.35 4.7-4.58 4.95.36.31.67.92.67 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
        </svg>
    );
}

function DiscordLogo({ className, ...props }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={className}
            {...props}
        >
            <path d="M19.54 5.34A16.9 16.9 0 0 0 15.2 4l-.22.45a15.9 15.9 0 0 1 3.1 1.55 14.7 14.7 0 0 0-4.1-1.29 14.8 14.8 0 0 0-3.96 0A14.7 14.7 0 0 0 5.94 5.99 15.9 15.9 0 0 1 9.04 4.44L8.82 4a16.9 16.9 0 0 0-4.34 1.34C2.5 8.13 1.89 10.8 2.02 13.43c1.18.89 2.31 1.43 3.42 1.79l.83-1.4c-.49-.19-.96-.43-1.43-.75l.36-.26c2.76 1.29 5.73 1.29 8.46 0l.36.26c-.47.32-.94.56-1.43.75l.83 1.4c1.11-.36 2.24-.9 3.42-1.79.17-3.1-.35-5.75-2.04-8.09ZM8.33 13.33c-.8 0-1.45-.74-1.45-1.65s.65-1.65 1.45-1.65 1.45.74 1.45 1.65-.65 1.65-1.45 1.65Zm7.34 0c-.8 0-1.45-.74-1.45-1.65s.65-1.65 1.45-1.65 1.45.74 1.45 1.65-.65 1.65-1.45 1.65Z" />
        </svg>
    );
}

export const Icons = {
    ArrowLeft,
    DiscordLogo,
    GitHubLogo,
    WeblabLogo,
};
