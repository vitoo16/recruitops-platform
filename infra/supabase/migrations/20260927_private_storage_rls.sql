-- RecruitOps private storage access model.
-- Object keys MUST use the authenticated RecruitOps user ID as the first path segment:
--   <user-uuid>/candidates/<candidate-or-application-id>/<filename>
-- OWNER/ADMIN may access any object in the recruitops-private bucket.
-- Other authenticated roles may access only objects whose first path segment matches auth.uid().

create policy "recruitops_private_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'recruitops-private'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'recruitops_role'), 'VIEWER') in ('OWNER', 'ADMIN')
  )
);

create policy "recruitops_private_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recruitops-private'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'recruitops_role'), 'VIEWER') in ('OWNER', 'ADMIN')
  )
);

create policy "recruitops_private_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'recruitops-private'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'recruitops_role'), 'VIEWER') in ('OWNER', 'ADMIN')
  )
)
with check (
  bucket_id = 'recruitops-private'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'recruitops_role'), 'VIEWER') in ('OWNER', 'ADMIN')
  )
);

create policy "recruitops_private_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'recruitops-private'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'recruitops_role'), 'VIEWER') in ('OWNER', 'ADMIN')
  )
);
