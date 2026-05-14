import { observer } from 'mobx-react-lite';

import { DomainSection } from './domain';
import { NoCustomDomain } from './no-domain';
import { CustomDomainProvider, useCustomDomainContext } from './provider';

export const CustomDomainSection = observer(() => {
    return (
        <CustomDomainProvider>
            <Section />
        </CustomDomainProvider>
    );
});

export const Section = () => {
    const { customDomain, isPro } = useCustomDomainContext();

    if (customDomain?.url && isPro) {
        return (
            <div className="flex flex-col items-center gap-2 p-3">
                <DomainSection />
            </div>
        );
    }

    return <NoCustomDomain />;
};
