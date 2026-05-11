export type TokenKind = 'color' | 'radius' | 'spacing' | 'shadow' | 'number' | 'text';

export interface ComponentTokenSpec {
    cssVar: string;
    kind: TokenKind;
    label: string;
    defaultValue: string;
    hint?: string;
}

export interface ComponentSpec {
    id: string;
    label: string;
    tag: string;
    sourcePath?: string;
    tokens: ComponentTokenSpec[];
    variants?: Record<string, string[]>;
}

const radiusVar: ComponentTokenSpec = {
    cssVar: '--radius',
    kind: 'radius',
    label: 'Corner radius',
    defaultValue: '1rem',
    hint: 'Global. Applies to every component that uses rounded-* tokens.',
};

const ringVar: ComponentTokenSpec = {
    cssVar: '--ring',
    kind: 'color',
    label: 'Focus ring',
    defaultValue: '24 5.7% 82.9%',
};

export const COMPONENT_TOKENS: Record<string, ComponentSpec> = {
    button: {
        id: 'button',
        label: 'Button',
        tag: 'buttons',
        sourcePath: 'packages/ui/src/components/button.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Background (default)',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--primary-foreground',
                kind: 'color',
                label: 'Text (default)',
                defaultValue: '24 9.8% 10%',
            },
            {
                cssVar: '--secondary',
                kind: 'color',
                label: 'Background (secondary)',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--secondary-foreground',
                kind: 'color',
                label: 'Text (secondary)',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--destructive',
                kind: 'color',
                label: 'Background (destructive)',
                defaultValue: '0 72% 51%',
            },
            {
                cssVar: '--border',
                kind: 'color',
                label: 'Border (outline)',
                defaultValue: '0 0% 12%',
            },
            ringVar,
            radiusVar,
        ],
        variants: {
            variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
            size: ['default', 'sm', 'lg', 'icon'],
        },
    },
    badge: {
        id: 'badge',
        label: 'Badge',
        tag: 'badges',
        sourcePath: 'packages/ui/src/components/badge.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Background (default)',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--primary-foreground',
                kind: 'color',
                label: 'Text (default)',
                defaultValue: '24 9.8% 10%',
            },
            {
                cssVar: '--secondary',
                kind: 'color',
                label: 'Background (secondary)',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--destructive',
                kind: 'color',
                label: 'Background (destructive)',
                defaultValue: '0 72% 51%',
            },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
        variants: { variant: ['default', 'secondary', 'destructive', 'outline'] },
    },
    input: {
        id: 'input',
        label: 'Input',
        tag: 'inputs',
        sourcePath: 'packages/ui/src/components/input.tsx',
        tokens: [
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Background',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Placeholder',
                defaultValue: '24 5.4% 63.9%',
            },
            ringVar,
            radiusVar,
        ],
    },
    textarea: {
        id: 'textarea',
        label: 'Textarea',
        tag: 'inputs',
        sourcePath: 'packages/ui/src/components/textarea.tsx',
        tokens: [
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Background',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            ringVar,
            radiusVar,
        ],
    },
    card: {
        id: 'card',
        label: 'Card',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/card.tsx',
        tokens: [
            { cssVar: '--card', kind: 'color', label: 'Background', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--card-foreground',
                kind: 'color',
                label: 'Text',
                defaultValue: '60 9.1% 97.8%',
            },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    checkbox: {
        id: 'checkbox',
        label: 'Checkbox',
        tag: 'controls',
        sourcePath: 'packages/ui/src/components/checkbox.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Checked fill',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--primary-foreground',
                kind: 'color',
                label: 'Check icon',
                defaultValue: '24 9.8% 10%',
            },
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            ringVar,
        ],
    },
    radio: {
        id: 'radio',
        label: 'Radio',
        tag: 'controls',
        sourcePath: 'packages/ui/src/components/radio-group.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Selected dot',
                defaultValue: '60 9.1% 97.8%',
            },
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            ringVar,
        ],
    },
    switch: {
        id: 'switch',
        label: 'Switch',
        tag: 'controls',
        sourcePath: 'packages/ui/src/components/switch.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'On track',
                defaultValue: '60 9.1% 97.8%',
            },
            { cssVar: '--input', kind: 'color', label: 'Off track', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Thumb',
                defaultValue: '20 14.3% 4.1%',
            },
            ringVar,
        ],
    },
    slider: {
        id: 'slider',
        label: 'Slider',
        tag: 'controls',
        sourcePath: 'packages/ui/src/components/slider.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Active track',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--secondary',
                kind: 'color',
                label: 'Inactive track',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Thumb',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--border', kind: 'color', label: 'Thumb border', defaultValue: '0 0% 12%' },
            ringVar,
        ],
    },
    toggle: {
        id: 'toggle',
        label: 'Toggle',
        tag: 'controls',
        sourcePath: 'packages/ui/src/components/toggle.tsx',
        tokens: [
            { cssVar: '--accent', kind: 'color', label: 'Hover bg', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--accent-foreground',
                kind: 'color',
                label: 'Hover text',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--muted',
                kind: 'color',
                label: 'Pressed bg',
                defaultValue: '12 6.5% 15.1%',
            },
            ringVar,
            radiusVar,
        ],
    },
    select: {
        id: 'select',
        label: 'Select',
        tag: 'selection',
        sourcePath: 'packages/ui/src/components/select.tsx',
        tokens: [
            { cssVar: '--popover', kind: 'color', label: 'Menu bg', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--popover-foreground',
                kind: 'color',
                label: 'Menu text',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Highlighted bg',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--input',
                kind: 'color',
                label: 'Trigger border',
                defaultValue: '12 6.5% 15.1%',
            },
            ringVar,
            radiusVar,
        ],
    },
    dialog: {
        id: 'dialog',
        label: 'Dialog',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/dialog.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Description',
                defaultValue: '24 5.4% 63.9%',
            },
            radiusVar,
        ],
    },
    'alert-dialog': {
        id: 'alert-dialog',
        label: 'Alert Dialog',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/alert-dialog.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            {
                cssVar: '--destructive',
                kind: 'color',
                label: 'Destructive action',
                defaultValue: '0 72% 51%',
            },
            radiusVar,
        ],
    },
    sheet: {
        id: 'sheet',
        label: 'Sheet',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/sheet.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
        ],
    },
    drawer: {
        id: 'drawer',
        label: 'Drawer',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/drawer.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            {
                cssVar: '--muted',
                kind: 'color',
                label: 'Grab handle',
                defaultValue: '12 6.5% 15.1%',
            },
            radiusVar,
        ],
    },
    popover: {
        id: 'popover',
        label: 'Popover',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/popover.tsx',
        tokens: [
            { cssVar: '--popover', kind: 'color', label: 'Surface', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--popover-foreground',
                kind: 'color',
                label: 'Text',
                defaultValue: '60 9.1% 97.8%',
            },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    'hover-card': {
        id: 'hover-card',
        label: 'Hover Card',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/hover-card.tsx',
        tokens: [
            { cssVar: '--popover', kind: 'color', label: 'Surface', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--popover-foreground',
                kind: 'color',
                label: 'Text',
                defaultValue: '60 9.1% 97.8%',
            },
            radiusVar,
        ],
    },
    tooltip: {
        id: 'tooltip',
        label: 'Tooltip',
        tag: 'overlays',
        sourcePath: 'packages/ui/src/components/tooltip.tsx',
        tokens: [
            { cssVar: '--primary', kind: 'color', label: 'Surface', defaultValue: '60 9.1% 97.8%' },
            {
                cssVar: '--primary-foreground',
                kind: 'color',
                label: 'Text',
                defaultValue: '24 9.8% 10%',
            },
            radiusVar,
        ],
    },
    'dropdown-menu': {
        id: 'dropdown-menu',
        label: 'Dropdown Menu',
        tag: 'menus',
        sourcePath: 'packages/ui/src/components/dropdown-menu.tsx',
        tokens: [
            { cssVar: '--popover', kind: 'color', label: 'Menu bg', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--popover-foreground',
                kind: 'color',
                label: 'Menu text',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Highlighted item bg',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--accent-foreground',
                kind: 'color',
                label: 'Highlighted item text',
                defaultValue: '60 9.1% 97.8%',
            },
            radiusVar,
        ],
    },
    'context-menu': {
        id: 'context-menu',
        label: 'Context Menu',
        tag: 'menus',
        sourcePath: 'packages/ui/src/components/context-menu.tsx',
        tokens: [
            { cssVar: '--popover', kind: 'color', label: 'Menu bg', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--popover-foreground',
                kind: 'color',
                label: 'Menu text',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Highlighted bg',
                defaultValue: '12 6.5% 15.1%',
            },
            radiusVar,
        ],
    },
    menubar: {
        id: 'menubar',
        label: 'Menubar',
        tag: 'menus',
        sourcePath: 'packages/ui/src/components/menubar.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Bar bg',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--popover', kind: 'color', label: 'Menu bg', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Highlighted bg',
                defaultValue: '12 6.5% 15.1%',
            },
            radiusVar,
        ],
    },
    'navigation-menu': {
        id: 'navigation-menu',
        label: 'Navigation Menu',
        tag: 'menus',
        sourcePath: 'packages/ui/src/components/navigation-menu.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Bar bg',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--accent', kind: 'color', label: 'Hover bg', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--accent-foreground',
                kind: 'color',
                label: 'Hover text',
                defaultValue: '60 9.1% 97.8%',
            },
            radiusVar,
        ],
    },
    command: {
        id: 'command',
        label: 'Command',
        tag: 'selection',
        sourcePath: 'packages/ui/src/components/command.tsx',
        tokens: [
            { cssVar: '--popover', kind: 'color', label: 'Surface', defaultValue: '20 14.3% 4.1%' },
            {
                cssVar: '--popover-foreground',
                kind: 'color',
                label: 'Text',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Highlighted bg',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Group label',
                defaultValue: '24 5.4% 63.9%',
            },
            radiusVar,
        ],
    },
    tabs: {
        id: 'tabs',
        label: 'Tabs',
        tag: 'tabs',
        sourcePath: 'packages/ui/src/components/tabs.tsx',
        tokens: [
            { cssVar: '--muted', kind: 'color', label: 'List bg', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Active bg',
                defaultValue: '20 14.3% 4.1%',
            },
            {
                cssVar: '--foreground',
                kind: 'color',
                label: 'Active text',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Inactive text',
                defaultValue: '24 5.4% 63.9%',
            },
            radiusVar,
        ],
    },
    accordion: {
        id: 'accordion',
        label: 'Accordion',
        tag: 'accordions',
        sourcePath: 'packages/ui/src/components/accordion.tsx',
        tokens: [
            { cssVar: '--border', kind: 'color', label: 'Item border', defaultValue: '0 0% 12%' },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
        ],
    },
    alert: {
        id: 'alert',
        label: 'Alert',
        tag: 'feedback',
        sourcePath: 'packages/ui/src/components/alert.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            {
                cssVar: '--destructive',
                kind: 'color',
                label: 'Destructive border + text',
                defaultValue: '0 72% 51%',
            },
            radiusVar,
        ],
    },
    progress: {
        id: 'progress',
        label: 'Progress',
        tag: 'progress',
        sourcePath: 'packages/ui/src/components/progress.tsx',
        tokens: [
            { cssVar: '--primary', kind: 'color', label: 'Bar', defaultValue: '60 9.1% 97.8%' },
            { cssVar: '--secondary', kind: 'color', label: 'Track', defaultValue: '12 6.5% 15.1%' },
            radiusVar,
        ],
    },
    skeleton: {
        id: 'skeleton',
        label: 'Skeleton',
        tag: 'skeleton',
        sourcePath: 'packages/ui/src/components/skeleton.tsx',
        tokens: [
            {
                cssVar: '--muted',
                kind: 'color',
                label: 'Background',
                defaultValue: '12 6.5% 15.1%',
            },
            radiusVar,
        ],
    },
    avatar: {
        id: 'avatar',
        label: 'Avatar',
        tag: 'avatars',
        sourcePath: 'packages/ui/src/components/avatar.tsx',
        tokens: [
            {
                cssVar: '--muted',
                kind: 'color',
                label: 'Fallback bg',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Fallback text',
                defaultValue: '24 5.4% 63.9%',
            },
        ],
    },
    separator: {
        id: 'separator',
        label: 'Separator',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/separator.tsx',
        tokens: [{ cssVar: '--border', kind: 'color', label: 'Color', defaultValue: '0 0% 12%' }],
    },
    table: {
        id: 'table',
        label: 'Table',
        tag: 'data',
        sourcePath: 'packages/ui/src/components/table.tsx',
        tokens: [
            { cssVar: '--border', kind: 'color', label: 'Row border', defaultValue: '0 0% 12%' },
            { cssVar: '--muted', kind: 'color', label: 'Hover bg', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Header text',
                defaultValue: '24 5.4% 63.9%',
            },
        ],
    },
    pagination: {
        id: 'pagination',
        label: 'Pagination',
        tag: 'data',
        sourcePath: 'packages/ui/src/components/pagination.tsx',
        tokens: [
            { cssVar: '--accent', kind: 'color', label: 'Hover bg', defaultValue: '12 6.5% 15.1%' },
            { cssVar: '--border', kind: 'color', label: 'Active border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    breadcrumb: {
        id: 'breadcrumb',
        label: 'Breadcrumb',
        tag: 'data',
        sourcePath: 'packages/ui/src/components/breadcrumb.tsx',
        tokens: [
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Inactive crumb',
                defaultValue: '24 5.4% 63.9%',
            },
            {
                cssVar: '--foreground',
                kind: 'color',
                label: 'Active crumb',
                defaultValue: '60 9.1% 97.8%',
            },
        ],
    },
    calendar: {
        id: 'calendar',
        label: 'Calendar',
        tag: 'data',
        sourcePath: 'packages/ui/src/components/calendar.tsx',
        tokens: [
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Selected day bg',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--primary-foreground',
                kind: 'color',
                label: 'Selected day text',
                defaultValue: '24 9.8% 10%',
            },
            { cssVar: '--accent', kind: 'color', label: 'Today bg', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--muted-foreground',
                kind: 'color',
                label: 'Outside-month days',
                defaultValue: '24 5.4% 63.9%',
            },
            radiusVar,
        ],
    },
    'scroll-area': {
        id: 'scroll-area',
        label: 'Scroll Area',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/scroll-area.tsx',
        tokens: [{ cssVar: '--border', kind: 'color', label: 'Thumb', defaultValue: '0 0% 12%' }],
    },
    'aspect-ratio': {
        id: 'aspect-ratio',
        label: 'Aspect Ratio',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/aspect-ratio.tsx',
        tokens: [],
    },
    collapsible: {
        id: 'collapsible',
        label: 'Collapsible',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/collapsible.tsx',
        tokens: [
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    resizable: {
        id: 'resizable',
        label: 'Resizable',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/resizable.tsx',
        tokens: [{ cssVar: '--border', kind: 'color', label: 'Handle', defaultValue: '0 0% 12%' }],
    },
    sidebar: {
        id: 'sidebar',
        label: 'Sidebar',
        tag: 'layout',
        sourcePath: 'packages/ui/src/components/sidebar.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Active item bg',
                defaultValue: '12 6.5% 15.1%',
            },
            radiusVar,
        ],
    },
    'toggle-group': {
        id: 'toggle-group',
        label: 'Toggle Group',
        tag: 'controls',
        sourcePath: 'packages/ui/src/components/toggle-group.tsx',
        tokens: [
            {
                cssVar: '--accent',
                kind: 'color',
                label: 'Pressed bg',
                defaultValue: '12 6.5% 15.1%',
            },
            {
                cssVar: '--accent-foreground',
                kind: 'color',
                label: 'Pressed text',
                defaultValue: '60 9.1% 97.8%',
            },
            radiusVar,
        ],
    },
    'input-otp': {
        id: 'input-otp',
        label: 'Input OTP',
        tag: 'inputs',
        sourcePath: 'packages/ui/src/components/input-otp.tsx',
        tokens: [
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Background',
                defaultValue: '20 14.3% 4.1%',
            },
            ringVar,
            radiusVar,
        ],
    },
    'number-input': {
        id: 'number-input',
        label: 'Number Input',
        tag: 'inputs',
        sourcePath: 'packages/ui/src/components/number-input.tsx',
        tokens: [
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Background',
                defaultValue: '20 14.3% 4.1%',
            },
            ringVar,
            radiusVar,
        ],
    },
    'draftable-input': {
        id: 'draftable-input',
        label: 'Draftable Input',
        tag: 'inputs',
        sourcePath: 'packages/ui/src/components/draftable-input.tsx',
        tokens: [
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Background',
                defaultValue: '20 14.3% 4.1%',
            },
            {
                cssVar: '--foreground-warning',
                kind: 'color',
                label: 'Draft indicator',
                defaultValue: '206 100% 66%',
            },
            radiusVar,
        ],
    },
    'input-group': {
        id: 'input-group',
        label: 'Input Group',
        tag: 'inputs',
        sourcePath: 'packages/ui/src/components/input-group.tsx',
        tokens: [
            { cssVar: '--input', kind: 'color', label: 'Border', defaultValue: '12 6.5% 15.1%' },
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Background',
                defaultValue: '20 14.3% 4.1%',
            },
            radiusVar,
        ],
    },
    chart: {
        id: 'chart',
        label: 'Chart',
        tag: 'data',
        sourcePath: 'packages/ui/src/components/chart.tsx',
        tokens: [
            {
                cssVar: '--foreground',
                kind: 'color',
                label: 'Axis text',
                defaultValue: '60 9.1% 97.8%',
            },
            { cssVar: '--border', kind: 'color', label: 'Grid', defaultValue: '0 0% 12%' },
            {
                cssVar: '--primary',
                kind: 'color',
                label: 'Series 1',
                defaultValue: '60 9.1% 97.8%',
            },
            {
                cssVar: '--background-brand',
                kind: 'color',
                label: 'Series 2',
                defaultValue: '206 100% 28%',
            },
        ],
    },
    toast: {
        id: 'toast',
        label: 'Toast (Sonner)',
        tag: 'feedback',
        sourcePath: 'packages/ui/src/components/sonner.tsx',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    'motion-card': {
        id: 'motion-card',
        label: 'Motion Card',
        tag: 'motion',
        sourcePath: 'packages/ui/src/components/motion-card.tsx',
        tokens: [
            { cssVar: '--card', kind: 'color', label: 'Background', defaultValue: '20 14.3% 4.1%' },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    'shine-border': {
        id: 'shine-border',
        label: 'Shine Border',
        tag: 'motion',
        sourcePath: 'packages/ui/src/components/shine-border.tsx',
        tokens: [
            {
                cssVar: '--foreground',
                kind: 'color',
                label: 'Shine color',
                defaultValue: '60 9.1% 97.8%',
            },
            radiusVar,
        ],
    },
    kbd: {
        id: 'kbd',
        label: 'Kbd',
        tag: 'keyboard',
        sourcePath: 'packages/ui/src/components/kbd.tsx',
        tokens: [
            {
                cssVar: '--muted',
                kind: 'color',
                label: 'Background',
                defaultValue: '12 6.5% 15.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
        ],
    },
    hotkey: {
        id: 'hotkey',
        label: 'Hotkey Label',
        tag: 'keyboard',
        sourcePath: 'packages/ui/src/components/hotkey-label.tsx',
        tokens: [
            {
                cssVar: '--muted',
                kind: 'color',
                label: 'Background',
                defaultValue: '12 6.5% 15.1%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
        ],
    },
    'color-picker': {
        id: 'color-picker',
        label: 'Color Picker',
        tag: 'color-picker',
        sourcePath: 'packages/ui/src/components/color-picker',
        tokens: [
            {
                cssVar: '--background',
                kind: 'color',
                label: 'Surface',
                defaultValue: '20 14.3% 4.1%',
            },
            { cssVar: '--border', kind: 'color', label: 'Border', defaultValue: '0 0% 12%' },
            radiusVar,
        ],
    },
    'ai-elements': {
        id: 'ai-elements',
        label: 'AI Elements',
        tag: 'ai-elements',
        sourcePath: 'packages/ui/src/components/ai-elements',
        tokens: [
            {
                cssVar: '--background-secondary',
                kind: 'color',
                label: 'Bubble bg',
                defaultValue: '0 0% 12%',
            },
            { cssVar: '--foreground', kind: 'color', label: 'Text', defaultValue: '60 9.1% 97.8%' },
            {
                cssVar: '--foreground-brand',
                kind: 'color',
                label: 'Accent',
                defaultValue: '205 100% 53%',
            },
            radiusVar,
        ],
    },
};

export const COMPONENT_IDS = Object.keys(COMPONENT_TOKENS);
