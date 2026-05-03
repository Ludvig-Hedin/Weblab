'use client';
import { observer } from 'mobx-react-lite';

export const ComponentsTab = observer(() => {
    return (
        <div className="text-active flex h-full w-full flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-foreground-primary text-sm font-medium">Components</span>
            </div>
            <div className="flex-1 overflow-auto px-3 pb-4">
                {/* Sections added in later tasks */}
            </div>
        </div>
    );
});
