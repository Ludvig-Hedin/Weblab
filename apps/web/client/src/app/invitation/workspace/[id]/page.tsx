import { WorkspaceInvitationMain } from './_components/main';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ token?: string | string[] }>;
}

export default async function WorkspaceInvitationPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { token: tokenParam } = await searchParams;
    const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

    return <WorkspaceInvitationMain id={id} token={token ?? null} />;
}
