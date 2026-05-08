import { PasswordGate } from './_components/password-gate';
import { isDesignUnlocked, isLocalhost } from './actions';

export default async function DesignSystemLayout({ children }: { children: React.ReactNode }) {
    const local = await isLocalhost();
    const unlocked = await isDesignUnlocked();

    if (!local && !unlocked) {
        return <PasswordGate />;
    }

    return <>{children}</>;
}
