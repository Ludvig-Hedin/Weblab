import type { Language } from '@weblab/constants';

import type messages from '../messages/en.json';
import type sanityBlogMessages from '../messages/sanity-blog/en.json';

declare module 'next-intl' {
    interface AppConfig {
        Locale: Language;
        Messages: typeof messages & typeof sanityBlogMessages;
    }
}
