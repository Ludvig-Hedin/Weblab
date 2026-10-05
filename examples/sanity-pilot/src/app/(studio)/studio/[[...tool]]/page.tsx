import copy from '../../../../lib/copy.json';
import { studioConnectionFromEnvironment } from '../../../../lib/studio-config';
import { EmbeddedStudio } from '../../../../components/embedded-studio';

export { metadata, viewport } from 'next-sanity/studio';
export const dynamic = 'force-dynamic';

export default function StudioPage() {
    const connection = studioConnectionFromEnvironment(process.env);
    if (!connection) {
        return (
            <main>
                <h1>{copy.studioMissingConfig}</h1>
                <p>{copy.studioMissingConfigHint}</p>
            </main>
        );
    }
    return <EmbeddedStudio {...connection} />;
}
