import { type NextRequest } from 'next/server';

import { getImage } from '@weblab/ai';

import { createClient } from '@/utils/supabase/server';

/**
 * Serves an AI-generated image from the in-memory image cache populated by
 * the `generate_image` / `edit_image` tools. The cache id is opaque (UUID)
 * and entries TTL out after 30 minutes.
 *
 * Per-user isolation: returns 404 unless the request is authenticated AND
 * the cached entry's owning userId matches the requesting user. We 404
 * instead of 403 so the existence of an id is not leaked to other users.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
        return new Response('Bad request', { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const entry = getImage(id, user.id);
    if (!entry) {
        return new Response('Not found', { status: 404 });
    }
    const buffer = Buffer.from(entry.b64, 'base64');
    return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': entry.mimeType,
            'Cache-Control': 'private, max-age=1800',
        },
    });
}
