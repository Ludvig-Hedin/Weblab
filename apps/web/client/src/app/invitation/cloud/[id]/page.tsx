import { CloudInvitationClaim } from './claim';

export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    return <CloudInvitationClaim invitationId={(await params).id} />;
}
