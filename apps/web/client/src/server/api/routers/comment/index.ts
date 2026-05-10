import { createTRPCRouter } from '../../trpc';
import { commentCrudRouter } from './comment';
import { replyRouter } from './reply';

export const commentRouter = createTRPCRouter({
    comment: commentCrudRouter,
    reply: replyRouter,
});
