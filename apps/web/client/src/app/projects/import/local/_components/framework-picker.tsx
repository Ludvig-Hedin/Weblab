'use client';

import type { FrameworkId } from '@weblab/framework';
import { isFrameworkReady, listFrameworkAdapters } from '@weblab/framework';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import { useProjectCreation } from '../_context';

/**
 * Framework picker for the import-local flow. Renders a dropdown of all
 * registered framework adapters; updating the selection re-runs validation
 * via the chosen adapter's rules.
 *
 * Hidden when `NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED` is false so the import
 * flow continues to behave as Next.js-only by default. Adapters whose
 * CodeSandbox template id is still a placeholder are listed but disabled —
 * they exist in code but can't be created end-to-end yet.
 */
export function FrameworkPicker() {
    const { framework, setFramework, isMultiFrameworkEnabled } = useProjectCreation();

    if (!isMultiFrameworkEnabled) {
        return null;
    }

    const adapters = listFrameworkAdapters();

    return (
        <div className="flex flex-col gap-1.5">
            <label
                htmlFor="framework-picker"
                className="text-foreground-secondary text-xs font-medium"
            >
                Framework
            </label>
            <Select value={framework} onValueChange={(value) => setFramework(value as FrameworkId)}>
                <SelectTrigger id="framework-picker" className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {adapters.map((adapter) => {
                        const ready = isFrameworkReady(adapter);
                        return (
                            <SelectItem key={adapter.id} value={adapter.id} disabled={!ready}>
                                {adapter.displayName}
                                {!ready ? ' (coming soon)' : ''}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>
        </div>
    );
}
