import { z } from 'zod';

import { env } from '@/env';

export async function POST(request: Request) {
    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { name, email, utm_source, utm_medium, utm_campaign, utm_term, utm_content } =
            body as Record<string, unknown>;

        // Create Zod schema for validation
        const emailCaptureSchema = z.object({
            name: z.string().trim().min(1, 'Name is required'),
            email: z.string().trim().email('Invalid email format'),
            utm_source: z.string().optional(),
            utm_medium: z.string().optional(),
            utm_campaign: z.string().optional(),
            utm_term: z.string().optional(),
            utm_content: z.string().optional(),
        });

        // Validate input data with Zod
        const validationResult = emailCaptureSchema.safeParse({
            name,
            email,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            utm_content,
        });

        if (!validationResult.success) {
            const firstError = validationResult.error.issues[0];
            return new Response(JSON.stringify({ error: firstError?.message }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const validatedData = validationResult.data;

        const headerName = env.N8N_LANDING_FORM_HEADER_NAME;
        const headerValue = env.N8N_LANDING_FORM_HEADER_VALUE;
        const landingFormUrl = env.N8N_LANDING_FORM_URL;

        // Bug fix #48: Falls back to no-op when N8N_LANDING_FORM_URL is not configured.
        // Previously this 500'd and broke the marketing landing form for any environment
        // (preview, local, etc.) that didn't have the n8n integration set up. Log the
        // capture server-side and return a soft-success so the UX stays unbroken; ops
        // can monitor the log line if they care about a missing integration.
        if (!landingFormUrl) {
            console.info(
                '[email-capture] N8N_LANDING_FORM_URL not configured — captured locally only',
                {
                    utm_source: validatedData.utm_source,
                    utm_medium: validatedData.utm_medium,
                    utm_campaign: validatedData.utm_campaign,
                },
            );
            return new Response(JSON.stringify({ success: true, stored: false }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const url = new URL(landingFormUrl);
        url.searchParams.append('name', validatedData.name);
        url.searchParams.append('email', validatedData.email);

        if (validatedData.utm_source)
            url.searchParams.append('utm_source', validatedData.utm_source);
        if (validatedData.utm_medium)
            url.searchParams.append('utm_medium', validatedData.utm_medium);
        if (validatedData.utm_campaign)
            url.searchParams.append('utm_campaign', validatedData.utm_campaign);
        if (validatedData.utm_term) url.searchParams.append('utm_term', validatedData.utm_term);
        if (validatedData.utm_content)
            url.searchParams.append('utm_content', validatedData.utm_content);

        // Build auth headers: use custom header if provided
        const authHeaders: Record<string, string> = {};
        if (headerName && headerValue) {
            authHeaders[headerName] = headerValue;
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: authHeaders,
        });

        if (!response.ok) {
            throw new Error(`Webhook failed with status: ${response.status}`);
        }

        return new Response(JSON.stringify({ success: true, stored: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Email capture webhook failed:', error);
        return new Response(JSON.stringify({ error: 'Failed to submit form' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
