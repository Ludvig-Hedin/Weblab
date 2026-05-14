import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useCustomDomainContext } from './provider';

export const NoCustomDomain = () => {
    const { openCustomDomain } = useCustomDomainContext();

    return (
        <Button
            variant="ghost"
            onClick={openCustomDomain}
            className="h-9 w-full justify-start gap-2 rounded-none px-3"
        >
            <Icons.Globe className="h-4 w-4" />
            Link a Custom Domain
            <span className="bg-foreground/10 text-foreground-secondary text-micro ml-auto rounded-full px-1.5 py-0.5 font-medium">
                PRO
            </span>
            <Icons.ChevronRight className="h-3 w-3" />
        </Button>
    );
};
