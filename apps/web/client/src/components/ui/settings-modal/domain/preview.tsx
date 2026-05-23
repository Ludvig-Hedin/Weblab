import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { getValidUrl, timeAgo } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

export const PreviewDomain = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;
    const domains = useQuery(api.domains.getAll, { projectId });
    const preview = domains?.preview;

    if (!preview) {
        return <div>No preview domain found</div>;
    }

    const lastUpdated = preview.publishedAt ? timeAgo(new Date(preview.publishedAt)) : null;
    const baseUrl = preview.url;
    const validUrl = getValidUrl(baseUrl);

    return (
        <div className="flex flex-col space-y-4">
            <h2 className="text-lg">Base Domain</h2>
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="w-1/3">
                        <p className="text-regularPlus text-muted-foreground">URL</p>
                        <p className="text-small text-muted-foreground">
                            {lastUpdated ? `Updated ${lastUpdated} ago` : 'Not published'}
                        </p>
                    </div>
                    <div className="flex flex-1 gap-2">
                        <Input value={baseUrl} disabled className="bg-muted" />
                        <Link href={validUrl} target="_blank" className="text-sm">
                            <Button variant="ghost" size="icon">
                                <Icons.ExternalLink className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
});
