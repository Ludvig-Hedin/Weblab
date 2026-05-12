import { Button } from '@weblab/ui/button';

import { useCustomDomainContext } from './provider';

export const NoCustomDomain = () => {
    const { openCustomDomain } = useCustomDomainContext();

    return (
        <>
            <div className="flex w-full items-center">
                <h3 className="">Custom Domain</h3>
                <span className="bg-foreground/10 text-foreground-secondary text-micro ml-auto rounded-full px-1.5 py-0.5 font-medium tracking-wide uppercase">
                    PRO
                </span>
            </div>

            <Button onClick={openCustomDomain} variant="default" size="lg" className="w-full">
                Link a Custom Domain
            </Button>
        </>
    );
};
