'use client';

import type { FrameworkId } from '@weblab/framework';
import { listReadyFrameworkAdapters } from '@weblab/framework';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import { useProjectCreation } from '../_context';

/**
 * Framework picker for the import-local flow. Renders a dropdown of
 * production-ready framework adapters; updating the selection re-runs
 * validation via the chosen adapter's rules.
 *
 * Hides itself when:
 *   - the multi-framework flag is off (preserves Next.js-only behavior), OR
 *   - fewer than two adapters have a real CodeSandbox template id (showing a
 *     dropdown with one option is dead UI; "(coming soon)" entries leak
 *     roadmap and create dead clicks).
 *
 * Adapters whose `template.codesandboxId` is still a `TODO_*` placeholder are
 * filtered out entirely rather than rendered as disabled — once a real
 * template id lands they'll appear automatically via `listReadyFrameworkAdapters`.
 */
export function FrameworkPicker() {
    const { framework, setFramework, isMultiFrameworkEnabled } = useProjectCreation();

    if (!isMultiFrameworkEnabled) {
        return null;
    }

    const adapters = listReadyFrameworkAdapters();
    if (adapters.length < 2) {
        // Nothing meaningful to pick — hide the dropdown rather than showing a
        // single-option select.
        return null;
    }

    return (
        <div className="flex flex-col gap-1.5">
            <label
                htmlFor="framework-picker"
                className="text-foreground-secondary text-xs font-medium"
            >
                What are you building?
            </label>
            <Select value={framework} onValueChange={(value) => setFramework(value as FrameworkId)}>
                <SelectTrigger id="framework-picker" className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {adapters.map((adapter) => (
                        <SelectItem key={adapter.id} value={adapter.id}>
                            {adapter.displayName}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
