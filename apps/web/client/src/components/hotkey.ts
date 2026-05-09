import { capitalizeFirstLetter } from '@weblab/utility';

// navigator.platform is deprecated. Prefer userAgentData when present
// and fall back to a userAgent sniff so platform detection still works
// on browsers that have already removed the legacy property.
function isMacPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    const navWithUA = navigator as Navigator & {
        userAgentData?: { platform?: string };
    };
    const platform =
        navWithUA.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? '';
    return platform.toUpperCase().includes('MAC');
}

export class Hotkey {
    // Modes
    static readonly SELECT = new Hotkey('v', 'Select');
    static readonly CODE = new Hotkey('e', 'Code');
    static readonly ESCAPE = new Hotkey('esc', 'Escape');
    static readonly PAN = new Hotkey('h', 'Pan');
    static readonly COMMENT = new Hotkey('c', 'Comment');
    static readonly TOGGLE_COMMENTS = new Hotkey('shift+c', 'Toggle Comments');
    static readonly PREVIEW = new Hotkey('p', 'Preview');
    static readonly INSERT_DIV = new Hotkey('r', 'Insert Div');
    static readonly INSERT_FLEX_DIV = new Hotkey('shift+f', 'Insert Flex Div');
    static readonly INSERT_BUTTON = new Hotkey('b', 'Insert Button');
    static readonly RELOAD_APP = new Hotkey('mod+r', 'Reload App');
    static readonly SIDEBAR_INSERT = new Hotkey('alt+a', 'Insert');
    static readonly SIDEBAR_LAYERS = new Hotkey('alt+1', 'Layers');
    static readonly SIDEBAR_BRAND = new Hotkey('alt+2', 'Brand');
    static readonly SIDEBAR_PAGES = new Hotkey('alt+3', 'Pages');
    static readonly SIDEBAR_IMAGES = new Hotkey('alt+4', 'Images');
    static readonly SIDEBAR_BRANCHES = new Hotkey('alt+5', 'Branches');
    static readonly SIDEBAR_SEARCH = new Hotkey('alt+6', 'Search');
    static readonly SIDEBAR_COMPONENTS = new Hotkey('alt+7', 'Components');

    // Mode switching
    static readonly MODE_DESIGN = new Hotkey('mod+1', 'Design Mode');
    static readonly MODE_CODE = new Hotkey('mod+2', 'Code Mode');
    static readonly MODE_PREVIEW = new Hotkey('mod+3', 'Preview Mode');

    // Toggles
    static readonly TOGGLE_TERMINAL = new Hotkey('mod+`', 'Toggle Terminal');
    static readonly OPEN_MODEL_PICKER = new Hotkey('mod+shift+m', 'Open Model Picker');

    // Zoom
    static readonly ZOOM_FIT = new Hotkey('mod+0', 'Zoom Fit');
    static readonly ZOOM_IN = new Hotkey('mod+equal', 'Zoom In');
    static readonly ZOOM_OUT = new Hotkey('mod+minus', 'Zoom Out');

    // Actions
    static readonly UNDO = new Hotkey('mod+z', 'Undo');
    static readonly REDO = new Hotkey('mod+shift+z', 'Redo');
    static readonly GROUP = new Hotkey('mod+g', 'Group');
    static readonly UNGROUP = new Hotkey('mod+shift+g', 'Unwrap parent');
    static readonly ADD_AI_CHAT = new Hotkey('mod+shift+l', 'Add to AI chat');
    static readonly NEW_AI_CHAT = new Hotkey('mod+l', 'New AI Chat');
    static readonly CHAT_MODE_TOGGLE = new Hotkey('mod+period', 'Toggle Preview');
    static readonly MOVE_LAYER_UP = new Hotkey('shift+arrowup', 'Move Layer Up');
    static readonly MOVE_LAYER_DOWN = new Hotkey('shift+arrowdown', 'Move Layer Down');
    static readonly BRING_FORWARD = new Hotkey('mod+]', 'Bring Forward');
    static readonly SEND_BACKWARD = new Hotkey('mod+[', 'Send Backward');
    static readonly SHOW_HOTKEYS = new Hotkey('mod+shift+slash', 'Show Shortcuts');
    static readonly OPEN_COMMAND_PALETTE = new Hotkey('mod+k', 'Open Command Palette');
    // Inline-edit on a selected canvas element. Was bound to `mod+k` and
    // collided with the command palette — moved to `mod+shift+k` to keep
    // both shortcuts working without one shadowing the other.
    static readonly INLINE_EDIT_FROM_CANVAS = new Hotkey(
        'mod+shift+k',
        'Inline edit selected element',
    );
    static readonly OPEN_ELEMENT_PALETTE = new Hotkey('mod+e', 'Add element');
    static readonly OPEN_FILE_FINDER = new Hotkey('mod+p', 'Quick Open File');
    static readonly OPEN_PROJECT_SEARCH = new Hotkey('mod+shift+f', 'Project Search');
    static readonly SEARCH = new Hotkey('mod+f', 'Search');
    static readonly OPEN_IN_IDE = new Hotkey('mod+shift+e', 'Open in IDE');
    static readonly ZOOM_TO_SELECTION = new Hotkey('mod+shift+0', 'Zoom to Selection');

    // Text
    static readonly INSERT_TEXT = new Hotkey('t', 'Insert Text');
    static readonly ENTER = new Hotkey('enter', 'Edit Text');

    // Copy
    static readonly COPY = new Hotkey('mod+c', 'Copy');
    static readonly PASTE = new Hotkey('mod+v', 'Paste');
    static readonly CUT = new Hotkey('mod+x', 'Cut');
    static readonly DUPLICATE = new Hotkey('mod+d', 'Duplicate');

    // Delete
    static readonly BACKSPACE = new Hotkey('backspace', 'Delete');
    static readonly DELETE = new Hotkey('delete', 'Delete');

    // Style panel
    static readonly RESET_STYLE = new Hotkey('alt+backspace', 'Reset focused style');

    // private to disallow creating other instances of this type
    private constructor(
        public readonly command: string,
        public readonly description: string,
    ) {}

    toString() {
        return this.command;
    }

    get readableCommand() {
        const isMac = isMacPlatform();
        return this.command
            .replace('mod', isMac ? '⌘' : 'Ctrl')
            .split('+')
            .map((value) => {
                if (value === 'shift') {
                    return '⇧';
                }
                if (value === 'alt') {
                    return isMac ? '⌥' : 'Alt';
                }
                if (value === 'ctrl') {
                    return isMac ? '⌃' : 'Ctrl';
                }
                if (value === 'equal') {
                    return '=';
                }
                if (value === 'minus') {
                    return '-';
                }
                if (value === 'plus') {
                    return '+';
                }
                if (value === 'period') {
                    return '.';
                }
                if (value === 'slash') {
                    return '/';
                }
                if (value === '`') {
                    return '`';
                }
                return capitalizeFirstLetter(value);
            })
            .join(' ');
    }
}

export type HotkeyKey = string;

/** All default hotkeys keyed by their static property name (e.g. 'UNDO', 'REDO') */
export const DEFAULT_HOTKEYS: Record<string, Hotkey> = Object.fromEntries(
    (Object.entries(Hotkey) as [string, unknown][]).filter(([, v]) => v instanceof Hotkey),
) as Record<string, Hotkey>;

/** Converts a command string like "mod+z" into a human-readable form like "⌘ Z" */
export function makeReadableCommand(command: string): string {
    const isMac = isMacPlatform();
    return command
        .replace('mod', isMac ? '⌘' : 'Ctrl')
        .split('+')
        .map((value) => {
            if (value === 'shift') return '⇧';
            if (value === 'alt') return isMac ? '⌥' : 'Alt';
            if (value === 'ctrl') return isMac ? '⌃' : 'Ctrl';
            if (value === 'equal') return '=';
            if (value === 'minus') return '-';
            if (value === 'plus') return '+';
            if (value === 'period') return '.';
            if (value === 'slash') return '/';
            if (value === '`') return '`';
            return capitalizeFirstLetter(value);
        })
        .join(' ');
}
