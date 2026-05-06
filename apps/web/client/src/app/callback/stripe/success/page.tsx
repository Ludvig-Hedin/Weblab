'use client';

import { Icons } from '@weblab/ui/icons';

import MessageScreen from '../message-screen';

export default function Success() {
    return (
        <MessageScreen
            title="Subscription Activated!"
            message="Your subscription to Weblab has been activated. You can now close this page."
            icon={<Icons.CheckCircled className="size-10 text-green-500" />}
        />
    );
}
