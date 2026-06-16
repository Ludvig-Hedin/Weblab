import { ProjectCreationLoader } from '@/components/project-creation-loader';

// Route-level suspense loader rendered during the RSC navigation into the
// editor (page.tsx awaits auth + the editor bootstrap query). Heading matches
// the hero create overlay + the editor Main loader so the create handoff reads
// as one continuous screen rather than three (creation AI-1).
export default function ProjectLoading() {
    return <ProjectCreationLoader heading="Getting your site ready" />;
}
