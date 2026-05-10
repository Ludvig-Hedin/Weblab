export const AI_CHAT_INPUT_SURFACE_CLASS =
    'bg-[#1F1F1F] border-white/5 flex w-full cursor-text flex-col rounded-xl border transition-colors duration-200';

export const AI_CHAT_INPUT_DRAG_CLASS =
    '[&[data-weblab-dragging-image=true]]:bg-foreground-brand/30';

export const AI_CHAT_TEXTAREA_CLASS =
    'text-small min-h-[44px] max-h-[100px] w-fullresize-none overflow-auto rounded-none !border-0 px-1 py-0.5 caret-foreground-brand !shadow-none ' +
    'text-foreground-primary selection:bg-foreground-brand/30 selection:text-foreground-brand ' +
    'placeholder:text-foreground-primary/50 cursor-text bg-transparent transition-[height] duration-300 ease-in-out outline-none dark:bg-transparent ' +
    'focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

export const AI_CHAT_TEXTAREA_STYLE = {
    borderWidth: 0,
    outline: 'none',
    resize: 'none',
} as const;
