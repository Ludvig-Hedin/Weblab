import { useCallback, useEffect, useState } from 'react';

// Pre-calculated approximate widths for each group type
const GROUP_WIDTHS: Record<string, number> = {
    // Div groups
    dimensions: 160, // Width + Height
    base: 180, // Color + Image + Border + Radius
    layout: 180, // Display + Padding + Margin
    font: 320, // Font Family + Weight + Size
    typography: 320, // Font Family + Weight + Size
    'text-color': 40, // Text Color
    opacity: 80, // Opacity
    image: 90, // ImgFit

    // Text groups (wider due to more components)
    'text-font': 320, // Font Family + Weight + Size
    'text-typography': 360, // Font Family + Weight + Size + Color + Align + Advanced
    'text-dimensions': 160, // Width + Height
    'text-regular': 180, // Color + Border + Radius
    'text-layout': 180, // Display + Padding + Margin
    'text-opacity': 80, // Opacity

    // Frame groups
    device: 150, // DeviceSelector
    rotate: 80, // RotateGroup
    'window-actions': 120, // WindowActionsGroup
    theme: 90, // ThemeGroup
};

// Conservative estimate for groups not in the table above. Erring wide only
// moves a group into the "…" overflow menu earlier; the old behavior (break
// out of the loop on a missing key) clipped the group AND left it out of the
// overflow menu entirely.
const DEFAULT_GROUP_WIDTH = 180;

export const useMeasureGroup = ({
    availableWidth = 0,
    count = 0,
    groupKeys,
}: {
    availableWidth?: number;
    count?: number;
    /**
     * Keys of the groups actually rendered, in render order. The budget is
     * computed from THESE groups' widths — without them the hook falls back
     * to iterating the static table, whose keys/order rarely match the
     * caller's toolbar and previously made tail groups unreachable.
     */
    groupKeys?: string[];
}) => {
    const [visibleCount, setVisibleCount] = useState(count);
    // Update visible count based on available width
    const updateVisibleCount = useCallback(() => {
        if (!availableWidth) return;

        const OVERFLOW_BUTTON_WIDTH = 32;
        const SEPARATOR_WIDTH = 8;
        const BUFFER_WIDTH = 10;
        let used = 0;
        let count = 0;

        // Budget against the groups the caller actually renders; fall back to
        // the static table's keys for callers that don't pass theirs.
        const keys = groupKeys ?? Object.keys(GROUP_WIDTHS);

        for (const key of keys) {
            const width = GROUP_WIDTHS[key] ?? DEFAULT_GROUP_WIDTH;

            // Add separator width if this isn't the first group
            const totalWidth = width + (count > 0 ? SEPARATOR_WIDTH : 0);

            if (used + totalWidth <= availableWidth - OVERFLOW_BUTTON_WIDTH - BUFFER_WIDTH) {
                used += totalWidth;
                count++;
            } else {
                break;
            }
        }

        setVisibleCount(count);
    }, [availableWidth, groupKeys]);

    // Update visible count when available width changes
    useEffect(() => {
        updateVisibleCount();
    }, [updateVisibleCount]);

    return {
        visibleCount,
    };
};
