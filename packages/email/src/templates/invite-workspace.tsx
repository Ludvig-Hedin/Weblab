import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Tailwind,
    Text,
} from '@react-email/components';

import { APP_NAME } from '@weblab/constants';

export interface InviteWorkspaceEmailProps {
    inviteeEmail: string;
    invitedByName?: string;
    invitedByEmail: string;
    workspaceName: string;
    inviteLink: string;
}

export const InviteWorkspaceEmail = ({
    inviteeEmail,
    invitedByName,
    invitedByEmail,
    workspaceName,
    inviteLink,
}: InviteWorkspaceEmailProps) => {
    const previewText = `Join ${workspaceName} on ${APP_NAME}`;

    return (
        <Html>
            <Head />
            <Tailwind>
                <Body className="mx-auto my-auto bg-white px-2 font-sans">
                    <Preview>{previewText}</Preview>
                    <Container className="mx-auto my-[40px] max-w-[465px] rounded border border-solid border-[#eaeaea] p-[20px]">
                        <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-black">
                            Join {workspaceName} on {APP_NAME}
                        </Heading>
                        <Text className="text-[14px] leading-[24px] text-black">Hello,</Text>
                        <Text className="text-[14px] leading-[24px] text-black">
                            <Link
                                href={`mailto:${invitedByEmail}`}
                                className="mr-1 text-blue-600 no-underline"
                            >
                                <strong>{invitedByName ?? invitedByEmail}</strong>
                            </Link>
                            has invited you to join the workspace{' '}
                            <strong>{workspaceName}</strong> on {APP_NAME}.
                        </Text>
                        <Text className="text-[14px] leading-[24px] text-black">
                            As a workspace member you will see projects shared with the workspace.
                            You will not see other workspaces.
                        </Text>
                        <Section className="mt-[32px] mb-[32px] text-center">
                            <Button
                                className="rounded bg-[#000000] px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
                                href={inviteLink}
                            >
                                Accept invitation
                            </Button>
                        </Section>
                        <Text className="text-[14px] leading-[24px] text-black">
                            Or copy and paste this URL into your browser:{' '}
                            <Link href={inviteLink} className="text-blue-600 no-underline">
                                {inviteLink}
                            </Link>
                        </Text>
                        <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
                        <Text className="text-[12px] leading-[24px] text-[#666666]">
                            This invitation was intended for{' '}
                            <span className="text-black">{inviteeEmail}</span>. If you were not
                            expecting it, you can ignore this email.
                        </Text>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default InviteWorkspaceEmail;
