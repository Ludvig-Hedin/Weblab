import { Icons } from '@/components/icons';

export function EditGitHub({ filePath }: { filePath: string }) {
    return (
        <a
            href={`https://github.com/Ludvig-Hedin/Weblab/blob/main/docs/content/docs/${filePath}`}
            target="_blank"
            rel="noreferrer noopener"
            className="w-fit border rounded-xl p-2 font-medium text-sm text-fd-secondary-foreground bg-fd-secondary-background hover:bg-fd-secondary-background/80 mt-8 inline-flex items-center gap-2"
        >
            <Icons.GitHubLogo className="w-4 h-4" />
            Edit on GitHub
        </a>
    );
} 
