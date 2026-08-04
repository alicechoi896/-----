-- Private bucket for uploaded PDF/DOCX/TXT/Markdown source files. Objects are
-- stored as "{organization_id}/{uuid}-{filename}"; RLS checks the first path
-- segment against the caller's organization memberships, mirroring the
-- pattern used for every other organization-scoped table.

insert into storage.buckets (id, name, public, file_size_limit)
values ('data-source-files', 'data-source-files', false, 10485760)
on conflict (id) do nothing;

create policy data_source_files_select on storage.objects
  for select using (
    bucket_id = 'data-source-files'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy data_source_files_insert on storage.objects
  for insert with check (
    bucket_id = 'data-source-files'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy data_source_files_delete on storage.objects
  for delete using (
    bucket_id = 'data-source-files'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );
