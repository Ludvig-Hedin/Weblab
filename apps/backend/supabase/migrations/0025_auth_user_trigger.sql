-- Automatically create a public.users row when a new auth.users row is inserted.
-- This prevents a race condition where a user authenticates successfully but the
-- app server crashes before creating the public.users row, leaving them stuck.
-- The callback route upsert still runs but becomes redundant insurance.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.users (id, email, first_name, last_name, avatar_url, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data ->> 'given_name',
            NEW.raw_user_meta_data ->> 'first_name',
            split_part(NEW.raw_user_meta_data ->> 'full_name', ' ', 1)
        ),
        COALESCE(
            NEW.raw_user_meta_data ->> 'family_name',
            NEW.raw_user_meta_data ->> 'last_name',
            NULLIF(regexp_replace(NEW.raw_user_meta_data ->> 'full_name', '^[^ ]+ ?', ''), '')
        ),
        NEW.raw_user_meta_data ->> 'avatar_url',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();
