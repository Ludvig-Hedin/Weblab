import { Cta } from '@/components/blocks/cta';
import { FeatureList } from '@/components/blocks/feature-list';
import { Hero } from '@/components/blocks/hero';

/**
 * Landing page template — composes the registry blocks into a full page. Copy
 * this into `app/page.tsx`, then adapt copy to the user's product. Uses only
 * design tokens; introduces no new colors, fonts, or layout primitives.
 */
export default function LandingPage() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <Hero />
            <FeatureList />
            <Cta />
        </main>
    );
}
