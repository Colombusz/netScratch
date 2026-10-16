begin;

create table public.projects (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (length(btrim(name)) between 1 and 1000),
  document jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint project_document_shape check ((
    jsonb_typeof(document) = 'object'
    and document ?& array['id', 'name', 'schemaVersion']
    and document->>'id' = id
    and document->>'name' = name
    and document->'schemaVersion' = '1'::jsonb
    and octet_length(document::text) <= 20971520
  ) is true)
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
alter table public.projects enable row level security;
alter table public.projects force row level security;
revoke all on public.projects from anon, authenticated;
grant select, delete on public.projects to authenticated;
grant insert (owner_id, id, name, document) on public.projects to authenticated;
grant update (name, document) on public.projects to authenticated;

create policy projects_select on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy projects_insert on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy projects_update on public.projects for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy projects_delete on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);

create function public.advance_project_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.advance_project_revision() from public, anon, authenticated;
create trigger projects_revision before update on public.projects
for each row execute function public.advance_project_revision();

commit;
