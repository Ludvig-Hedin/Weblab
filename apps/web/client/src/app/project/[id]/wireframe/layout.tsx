import { OrdinaryProjectBoundary } from '../_components/ordinary-project-boundary';

export default function Layout(props: { children: React.ReactNode; params: Promise<{ id: string }> }) {
    return <OrdinaryProjectBoundary {...props} section="wireframe" />;
}
