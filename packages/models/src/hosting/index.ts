export enum DeploymentType {
    PREVIEW = 'preview',
    CUSTOM = 'custom',
    UNPUBLISH_PREVIEW = 'unpublish_preview',
    UNPUBLISH_CUSTOM = 'unpublish_custom',
}

export enum DeploymentStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

export interface DeploymentState {
    status: DeploymentStatus;
    message: string | null;
    buildLog: string | null;
    error: string | null;
    progress: number | null;
}

export interface CustomDomain {
    id: string;
    user_id: string;
    domain: string;
    subdomains: string[];
    created_at: string;
    updated_at: string;
}

export interface CreateDomainVerificationResponse {
    success: boolean;
    message?: string;
    verificationCode?: string;
}

export interface VerifyDomainResponse {
    success: boolean;
    message?: string;
}

export interface PublishResponse {
    success: boolean;
    message: string;
}

export enum HostingProvider {
    /** Weblab-managed hosting (default). No user credentials required. */
    FREESTYLE = 'freestyle',
    /** User-connected external providers — deploy with the user's own account. */
    VERCEL = 'vercel',
    NETLIFY = 'netlify',
    CLOUDFLARE = 'cloudflare',
    RAILWAY = 'railway',
    RENDER = 'render',
}

/** Providers that require a user-connected account/token (everything except Weblab's own). */
export const EXTERNAL_HOSTING_PROVIDERS: HostingProvider[] = [
    HostingProvider.VERCEL,
    HostingProvider.NETLIFY,
    HostingProvider.CLOUDFLARE,
    HostingProvider.RAILWAY,
    HostingProvider.RENDER,
];

/** Human-readable provider names for UI. */
export const HOSTING_PROVIDER_LABELS: Record<HostingProvider, string> = {
    [HostingProvider.FREESTYLE]: 'Weblab',
    [HostingProvider.VERCEL]: 'Vercel',
    [HostingProvider.NETLIFY]: 'Netlify',
    [HostingProvider.CLOUDFLARE]: 'Cloudflare Pages',
    [HostingProvider.RAILWAY]: 'Railway',
    [HostingProvider.RENDER]: 'Render',
};

export interface DeploymentFile {
    content: string;
    encoding?: 'utf-8' | 'base64';
}

export interface DeploymentConfig {
    domains: string[];
    entrypoint?: string;
    envVars?: Record<string, string>;
}

export interface DeploymentRequest {
    files: Record<string, DeploymentFile>;
    config: DeploymentConfig;
}

export interface DeploymentResponse {
    deploymentId: string;
    success: boolean;
    message?: string;
}

export interface TokenValidationResult {
    ok: boolean;
    /** Display name for the connected account (team / email / organization). */
    accountLabel?: string;
    /** Provider-side account or team id, if exposed by the API. */
    accountId?: string;
    /** Human-readable error message when `ok` is false. */
    message?: string;
}

export interface HostingProviderAdapter {
    deploy(request: DeploymentRequest): Promise<DeploymentResponse>;
    /**
     * Verify a user-supplied API token against the provider. Optional —
     * providers that need no user credentials (e.g. FREESTYLE) omit this.
     */
    validateToken?(token: string): Promise<TokenValidationResult>;
}
