-- SECURITY: tighten the Realtime broadcast policy so only project members
-- can subscribe to a project's topic. The previous policy used `USING (TRUE)`,
-- letting any authenticated user subscribe to `topic:<project_id>` and
-- receive every chat message and conversation event for projects they have
-- no access to. Bind subscription to membership in `public.user_projects`.

DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON "realtime"."messages";

CREATE POLICY "Project members can receive broadcasts"
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.user_projects up
        WHERE up.user_id = auth.uid()
          AND ('topic:' || up.project_id::text) = realtime.topic()
    )
);
