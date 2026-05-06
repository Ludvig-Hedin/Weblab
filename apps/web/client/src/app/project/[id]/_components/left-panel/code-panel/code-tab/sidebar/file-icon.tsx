import { Icons } from '@weblab/ui/icons';

export const FileIcon = ({ path, isDirectory }: { path: string; isDirectory: boolean }) => {
    if (isDirectory) {
        return <Icons.Directory className="mr-2 h-4 w-4" />;
    }

    const fileName = path.split('/').pop() || path;
    const lastDotIndex = fileName.lastIndexOf('.');
    const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : '';

    switch (extension) {
        case 'js':
        case 'jsx':
        case 'ts':
        case 'tsx':
            return <Icons.Code className="mr-2 h-4 w-4" />;
        case 'css':
        case 'scss':
        case 'sass':
            return <Icons.Box className="mr-2 h-4 w-4" />;
        case 'html':
            return <Icons.Frame className="mr-2 h-4 w-4" />;
        case 'json':
            return <Icons.Code className="mr-2 h-4 w-4" />;
        case 'md':
        case 'mdx':
            return <Icons.Text className="mr-2 h-4 w-4" />;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'svg':
            return <Icons.Image className="mr-2 h-4 w-4" />;
        default:
            return <Icons.File className="mr-2 h-4 w-4" />;
    }
};
