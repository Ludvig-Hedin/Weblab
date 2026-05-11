export enum Language {
    English = 'en',
    Swedish = 'sv',
    Spanish = 'es',
    Japanese = 'ja',
    Chinese = 'zh',
    Korean = 'ko',
}

export const LANGUAGE_DISPLAY_NAMES: Record<Language, string> = {
    [Language.English]: 'English',
    [Language.Swedish]: 'Svenska',
    [Language.Spanish]: 'Español',
    [Language.Japanese]: '日本語',
    [Language.Chinese]: '中文',
    [Language.Korean]: '한국어',
} as const;
