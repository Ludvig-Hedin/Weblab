import { capitalizeFirstLetter } from '@weblab/utility';

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
    static readonly INSERT_DIV_F = new Hotkey('f', 'Insert Div');
    static readonly INSERT_DIV_D = new Hotkey('d', 'Insert Div');
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
    static readonly WRAP_IN_DIV = new Hotkey('mod+alt+g', 'Wrap in Div');
    static readonly UNGROUP = new Hotkey('mod+shift+g', 'Unwrap parent');
    static readonly OPEN_DEV_TOOL = new Hotkey('mod+shift+i', 'Open Devtool');
    static readonly ADD_AI_CHAT = new Hotkey('mod+shift+l', 'Add to AI chat');
    static readonly NEW_AI_CHAT = new Hotkey('mod+l', 'New AI Chat');
    static readonly CHAT_MODE_TOGGLE = new Hotkey('mod+period', 'Toggle Preview');
    static readonly MOVE_LAYER_UP = new Hotkey('shift+arrowup', 'Move Layer Up');
    static readonly MOVE_LAYER_DOWN = new Hotkey('shift+arrowdown', 'Move Layer Down');
    static readonly SHOW_HOTKEYS = new Hotkey('mod+shift+slash', 'Show Shortcuts');
    static readonly OPEN_ELEMENT_PALETTE = new Hotkey('mod+k', 'Add element');
    static readonly SEARCH = new Hotkey('mod+f', 'Search');

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
        const isMac =
            typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
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
    const isMac =
        typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
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
