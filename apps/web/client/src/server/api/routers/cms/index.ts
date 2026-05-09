import { createTRPCRouter } from '@/server/api/trpc';
import { cmsBindingRouter } from './binding';
import { cmsCollectionRouter } from './collection';
import { cmsCollectionPageRouter } from './collection-page';
import { cmsFieldRouter } from './field';
import { cmsItemRouter } from './item';
import { cmsSourceRouter } from './source';

export const cmsRouter = createTRPCRouter({
    source: cmsSourceRouter,
    collection: cmsCollectionRouter,
    collectionPage: cmsCollectionPageRouter,
    field: cmsFieldRouter,
    item: cmsItemRouter,
    binding: cmsBindingRouter,
});
