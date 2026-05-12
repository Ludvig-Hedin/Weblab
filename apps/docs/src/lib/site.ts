const DEFAULT_APP_NAME = 'Weblab';
const DEFAULT_APP_DOMAIN = 'docs.weblab.build';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? DEFAULT_APP_NAME;
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? DEFAULT_APP_DOMAIN;
