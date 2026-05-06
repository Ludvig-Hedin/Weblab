export const AI_CHAT_INPUT_SURFACE_CLASS =
    'bg-background-primary flex w-full cursor-text flex-col rounded-xl border transition-colors duration-200';

export const AI_CHAT_INPUT_DRAG_CLASS = '[&[data-dragging-image=true]]:bg-blue-500/40';

export const AI_CHAT_TEXTAREA_CLASS =
    'text-small min-h-[60px] resize-none overflow-auto rounded-none !border-0 px-3 py-2 caret-[#109BFF] !shadow-none ' +
    'text-foreground-primary selection:bg-[#109BFF]/30 selection:text-[#109BFF] ' +
    'placeholder:text-foreground-primary/50 cursor-text bg-transparent transition-[height] duration-300 ease-in-out outline-none dark:bg-transparent ' +
    'focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

export const AI_CHAT_TEXTAREA_STYLE = {
    borderWidth: 0,
    outline: 'none',
    resize: 'none',
} as const;
