-- SECURITY: tighten preview_images bucket policies. The original policies
-- allowed any anon caller to INSERT arbitrary files (HTML, JS, SVG with
-- inline scripts) to attacker-chosen paths, including paths colliding with
-- legitimate project preview thumbnails. Restrict INSERT/UPDATE/DELETE to
-- project members and bind the storage path's first segment to the
-- caller's project membership. Public SELECT remains so the marketing/
-- preview pages can render thumbnails for shared projects.

drop policy if exists "preview_images_select_policy" on storage.objects;
drop policy if exists "preview_images_insert_policy" on storage.objects;
drop policy if exists "preview_images_update_policy" on storage.objects;
drop policy if exists "preview_images_delete_policy" on storage.objects;

-- Helper: returns true when the caller is a member of the project whose id
-- is the first path segment of `object_name`. The array_length guard prevents
-- a panic/bypass for root-level files (foldername returns an empty array for
-- objects with no folder prefix).
create or replace function public.is_preview_image_owner(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, storage, pg_temp
as $$
begin
    return (
        array_length(storage.foldername(object_name), 1) >= 1
        and exists (
            select 1
            from public.user_projects up
            where up.user_id = auth.uid()
              and up.project_id::text = (storage.foldername(object_name))[1]
        )
    );
end;
$$;

-- SELECT: keep public so existing share/preview surfaces continue to work.
create policy "preview_images_select_policy"
on storage.objects for select to public using (
    bucket_id = 'preview_images'
);

-- INSERT: must be authenticated, path must start with a project_id the
-- user belongs to: `<projectId>/<...>`.
create policy "preview_images_insert_policy"
on storage.objects for insert to authenticated with check (
    bucket_id = 'preview_images'
    and public.is_preview_image_owner(name)
);

-- UPDATE: same scoping as INSERT.
create policy "preview_images_update_policy"
on storage.objects for update to authenticated
using    (bucket_id = 'preview_images' and public.is_preview_image_owner(name))
with check (bucket_id = 'preview_images' and public.is_preview_image_owner(name));

-- DELETE: same scoping. Lets owners clean up their own previews.
create policy "preview_images_delete_policy"
on storage.objects for delete to authenticated using (
    bucket_id = 'preview_images'
    and public.is_preview_image_owner(name)
);
