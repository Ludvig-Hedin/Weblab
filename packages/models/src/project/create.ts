export enum CreateRequestContextType {
    PROMPT = 'prompt',
    IMAGE = 'image',
    WEBSITE_URL = 'website_url',
    WEBSITE_SCRAPE = 'website_scrape',
}

export enum CloneOutputFramework {
    NEXTJS = 'nextjs',
    STATIC_HTML = 'static-html',
}

export enum ProjectCreateRequestStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

type BaseCreateRequestContext = {
    type: CreateRequestContextType;
    content: string;
};

export type ImageCreateRequestContext = BaseCreateRequestContext & {
    type: CreateRequestContextType.IMAGE;
    mimeType: string;
};

export type PromptCreateRequestContext = BaseCreateRequestContext & {
    type: CreateRequestContextType.PROMPT;
};

export type WebsiteUrlCreateRequestContext = BaseCreateRequestContext & {
    type: CreateRequestContextType.WEBSITE_URL;
    framework: CloneOutputFramework;
};

export type WebsiteScrapeCreateRequestContext = BaseCreateRequestContext & {
    type: CreateRequestContextType.WEBSITE_SCRAPE;
};

export type CreateRequestContext =
    | ImageCreateRequestContext
    | PromptCreateRequestContext
    | WebsiteUrlCreateRequestContext
    | WebsiteScrapeCreateRequestContext;
