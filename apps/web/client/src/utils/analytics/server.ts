import type { EventMessage } from 'posthog-node';
import { PostHog } from 'posthog-node';

import { env } from '@/env';

class PostHogSingleton {
    private static instance: PostHog | null = null;
    private static hasWarnedMissingKey = false;

    public static getInstance(): PostHog | null {
        if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
            if (env.NODE_ENV !== 'development' && !PostHogSingleton.hasWarnedMissingKey) {
                console.warn('PostHog key not found');
                PostHogSingleton.hasWarnedMissingKey = true;
            }
            return null;
        }
        PostHogSingleton.instance ??= new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
            host: env.NEXT_PUBLIC_POSTHOG_HOST,
            flushAt: 1,
            flushInterval: 0,
        });
        return PostHogSingleton.instance;
    }
}

const client = PostHogSingleton.getInstance();

export const trackEvent = (props: EventMessage) => {
    try {
        client?.capture(props);
    } catch (error) {
        console.error('Error tracking event:', error);
    }
};
