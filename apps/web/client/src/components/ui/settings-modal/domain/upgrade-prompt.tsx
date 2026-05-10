import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

export const UpgradePrompt = ({ onClick }: { onClick: () => void }) => {
    return (
        <div className="border-warning bg-background-warning text-foreground-warning rounded-md border p-4">
            <p className="text-regular flex items-center gap-2">
                You must be on {APP_NAME} Pro to use a custom Domain.
                <Button
                    variant="link"
                    className="text-foreground-warning hover:text-foreground-warning/80 h-auto p-0 px-2 font-medium"
                    onClick={onClick}
                >
                    Upgrade today!
                </Button>
            </p>
        </div>
    );
};
