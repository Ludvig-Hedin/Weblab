import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { getValidUrl } from '@weblab/utility';

export const UrlSection = ({ url, isCopyable }: { url: string; isCopyable: boolean }) => {
    const [isCopied, setIsCopied] = useState(false);
    const validUrl = getValidUrl(url);

    const copyUrl = () => {
        navigator.clipboard.writeText(validUrl);
        toast.success('Copied to clipboard');
        setIsCopied(true);
        setTimeout(() => {
            setIsCopied(false);
        }, 2000);
    };

    return (
        <div className="flex flex-row items-center justify-between gap-2">
            <Input className="bg-background-secondary text-mini w-full" value={url} readOnly />
            {isCopyable ? (
                <Button onClick={copyUrl} variant="outline" size="icon">
                    {isCopied ? (
                        <Icons.Check className="h-4 w-4" />
                    ) : (
                        <Icons.Copy className="h-4 w-4" />
                    )}
                </Button>
            ) : (
                <Link href={validUrl} target="_blank" className="text-small">
                    <Button variant="outline" size="icon">
                        <Icons.ExternalLink className="h-4 w-4" />
                    </Button>
                </Link>
            )}
        </div>
    );
};
