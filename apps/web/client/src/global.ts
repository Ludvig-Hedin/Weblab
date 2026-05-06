import type { Language } from '@weblab/constants';

import type messages from '../messages/en.json';

declare module 'next-intl' {
    interface AppConfig {
        Locale: Language;
        Messages: typeof messages;
    }
}
