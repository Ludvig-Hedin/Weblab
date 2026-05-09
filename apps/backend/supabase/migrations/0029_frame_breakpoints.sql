-- Add breakpoint-group metadata to frames so the canvas can render
-- Desktop / Tablet / Phone siblings per branch (Framer-style breakpoints).
--
-- Columns are nullable so existing rows are safe; the backfill below
-- gives every existing frame its own group with breakpoint='desktop'.
-- Client-side migration (use-start-project) synthesizes Tablet+Phone
-- siblings on first open so users see all three breakpoints immediately.

ALTER TABLE "frames"
ADD COLUMN IF NOT EXISTS "group_id" text,
ADD COLUMN IF NOT EXISTS "breakpoint_id" text,
ADD COLUMN IF NOT EXISTS "breakpoint_name" text,
ADD COLUMN IF NOT EXISTS "breakpoint_order" numeric;

UPDATE "frames"
SET
    "group_id" = COALESCE("group_id", "id"::text),
    "breakpoint_id" = COALESCE("breakpoint_id", 'desktop'),
    "breakpoint_name" = COALESCE("breakpoint_name", 'Desktop'),
    "breakpoint_order" = COALESCE("breakpoint_order", 0)
WHERE
    "group_id" IS NULL
    OR "breakpoint_id" IS NULL
    OR "breakpoint_name" IS NULL
    OR "breakpoint_order" IS NULL;

CREATE INDEX IF NOT EXISTS "frames_group_id_idx" ON "frames" USING btree ("group_id");
