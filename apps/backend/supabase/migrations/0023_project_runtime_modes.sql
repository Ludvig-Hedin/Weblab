ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "storage_mode" varchar NOT NULL DEFAULT 'cloud',
ADD COLUMN IF NOT EXISTS "runtime_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "branches"
ADD COLUMN IF NOT EXISTS "runtime_type" varchar NOT NULL DEFAULT 'cloud',
ADD COLUMN IF NOT EXISTS "runtime_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "branches"
SET "runtime_metadata" = jsonb_build_object(
    'type', 'cloud',
    'cloud', jsonb_build_object(
        'provider', 'code_sandbox',
        'sandboxId', "sandbox_id"
    ),
    'sync', jsonb_build_object(
        'enabled', false,
        'status', 'disabled'
    )
)
WHERE "runtime_metadata" = '{}'::jsonb;
