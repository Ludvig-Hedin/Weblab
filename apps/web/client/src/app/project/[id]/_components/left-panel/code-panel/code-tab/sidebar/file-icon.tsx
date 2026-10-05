import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

// File-type tints reuse the code editor's syntax hues (peach, mint, lilac)
// so the tree, tabs and code read as one palette. Kept soft on purpose: the
// file name, not the icon, should carry the row.
const TINT = {
    code: 'text-[#a4520a] dark:text-[#ffc799]',
    style: 'text-[#6d3fd1] dark:text-[#cbb8ff]',
    data: 'text-[#0f7564] dark:text-[#99e6cf]',
    media: 'text-[#c2410c] dark:text-[#ffab85]',
    plain: 'text-foreground-tertiary',
} as const;

const getExtension = (path: string) => {
    const fileName = path.split('/').pop() || path;
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : '';
};

export const FileIcon = ({
    path,
    isDirectory,
    isOpen = false,
    className,
}: {
    path: string;
    isDirectory: boolean;
    isOpen?: boolean;
    className?: string;
}) => {
    const base = cn('h-4 w-4 flex-none', className);

    if (isDirectory) {
        const Folder = isOpen ? Icons.DirectoryOpen : Icons.Directory;
        return <Folder className={cn(base, 'text-foreground-tertiary')} />;
    }

    switch (getExtension(path)) {
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
        case 'ts':
        case 'tsx':
        case 'mts':
        case 'cts':
            return <Icons.Code className={cn(base, TINT.code)} />;
        case 'css':
        case 'scss':
        case 'sass':
            return <Icons.Box className={cn(base, TINT.style)} />;
        case 'html':
            return <Icons.Frame className={cn(base, TINT.code)} />;
        case 'json':
        case 'toml':
        case 'yml':
        case 'yaml':
            return <Icons.Code className={cn(base, TINT.data)} />;
        case 'md':
        case 'mdx':
            return <Icons.Text className={cn(base, TINT.plain)} />;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'svg':
        case 'webp':
        case 'avif':
        case 'ico':
            return <Icons.Image className={cn(base, TINT.media)} />;
        default:
            return <Icons.File className={cn(base, TINT.plain)} />;
    }
};
