import type { ComponentType } from 'react';

import Blog2 from './blocks/blog-2';
import Cta1 from './blocks/cta-1';
import Faq2 from './blocks/faq-2';
import Feature1 from './blocks/feature-1';
import FeatureGrid10 from './blocks/feature-grid-10';
import Footer1 from './blocks/footer-1';
import Hero1 from './blocks/hero-1';
import Hero6 from './blocks/hero-6';
import Logos1 from './blocks/logos-1';
import LpNavbar1 from './blocks/lp-navbar-1';
import Pricing2 from './blocks/pricing-2';
import Process13 from './blocks/process-13';
import Split2 from './blocks/split-2';
import Stats2 from './blocks/stats-2';
import Testimonials1 from './blocks/testimonials-1';

/**
 * A block renderer accepts the (already runtime-validated) content object. Each
 * concrete block declares a precise content prop; the registry erases that to
 * `unknown` because the caller validates with the block's schema before render.
 */
export type BlockComponent = ComponentType<{ content: unknown }>;

export const BLOCK_RENDERERS: Record<string, BlockComponent> = {
    'lp-navbar-1': LpNavbar1 as unknown as BlockComponent,
    'hero-1': Hero1 as unknown as BlockComponent,
    'hero-6': Hero6 as unknown as BlockComponent,
    'logos-1': Logos1 as unknown as BlockComponent,
    'feature-1': Feature1 as unknown as BlockComponent,
    'feature-grid-10': FeatureGrid10 as unknown as BlockComponent,
    'split-2': Split2 as unknown as BlockComponent,
    'process-13': Process13 as unknown as BlockComponent,
    'pricing-2': Pricing2 as unknown as BlockComponent,
    'testimonials-1': Testimonials1 as unknown as BlockComponent,
    'stats-2': Stats2 as unknown as BlockComponent,
    'faq-2': Faq2 as unknown as BlockComponent,
    'blog-2': Blog2 as unknown as BlockComponent,
    'cta-1': Cta1 as unknown as BlockComponent,
    'footer-1': Footer1 as unknown as BlockComponent,
};

export function getBlockRenderer(id: string): BlockComponent | undefined {
    return BLOCK_RENDERERS[id];
}
