-- Private progression data, exposed only to its authenticated owner.
create table public.user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  space text not null check (space in ('school', 'practice', 'training', 'history', 'imports')),
  payload text not null check (octet_length(payload) <= 8388608),
  revision integer not null default 1 check (revision > 0),
  primary key (user_id, space)
);

alter table public.user_progress enable row level security;
revoke all on public.user_progress from public, anon, authenticated;
grant select, insert, update, delete on public.user_progress to authenticated;

create policy owner_select on public.user_progress for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false);
create policy owner_insert on public.user_progress for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false);
create policy owner_update on public.user_progress for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false)
  with check ((select auth.uid()) = user_id and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false);
create policy owner_delete on public.user_progress for delete to authenticated
  using ((select auth.uid()) = user_id and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false);
