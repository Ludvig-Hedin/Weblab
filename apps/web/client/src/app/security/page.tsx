import {
    SecurityCompare,
    SecurityComplianceFeatures,
    SecurityContact,
    SecurityDataFeatures,
    SecurityHero,
    SecuritySubprocessors,
} from '../_components/security';
import { WebsiteLayout } from '../_components/website-layout';

export default function SecurityPage() {
    return (
        <WebsiteLayout showFooter={true}>
            <main className="flex-1 pt-16">
                <SecurityHero />
                <SecurityDataFeatures />
                <SecurityComplianceFeatures />
                <SecurityCompare />
                <SecuritySubprocessors />
                <SecurityContact />
            </main>
        </WebsiteLayout>
    );
}
