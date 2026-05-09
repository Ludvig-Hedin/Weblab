import { type NextRequest } from 'next/server';

import { updateSession } from '@/utils/supabase/middleware';

export async function proxy(request: NextRequest) {
    // update user's auth session
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Match every dynamic request except static assets and image files.
        // Wide matcher ensures session refresh runs everywhere a user can land.
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
