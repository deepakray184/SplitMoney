-- Run this script in Supabase SQL Editor for the SplitMoney project.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Friend',
  created_at timestamptz not null default now()
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 50),
  emoji text not null default '✈️',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 60),
  amount_cents integer not null check (amount_cents > 0),
  payer_id uuid not null references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  cents integer not null check (cents >= 0),
  primary key (expense_id, user_id)
);
create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);

create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists splitmoney_auth_user_created on auth.users;
create trigger splitmoney_auth_user_created after insert on auth.users
for each row execute procedure public.on_auth_user_created();
-- Also create profiles for accounts that existed before this schema was installed.
insert into public.profiles(id, display_name)
select id, coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(email, '@', 1))
from auth.users on conflict (id) do nothing;

create or replace function public.create_trip_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.groups(name, created_by) values (trim(group_name), auth.uid()) returning id into new_group;
  insert into public.group_members(group_id, user_id, display_name)
  select new_group, p.id, p.display_name from public.profiles p where p.id = auth.uid();
  return new_group;
end; $$;

create or replace function public.create_group_invite(target_group uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare token text;
begin
  if not exists (select 1 from public.group_members where group_id = target_group and user_id = auth.uid()) then
    raise exception 'Only group members can create an invite';
  end if;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.group_invites(group_id, token_hash, created_by)
  values (target_group, encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex'), auth.uid());
  return token;
end; $$;

create or replace function public.join_group_with_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare target_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select group_id into target_group from public.group_invites
  where token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex')
    and expires_at > now();
  if target_group is null then raise exception 'This invite link is invalid or expired'; end if;
  insert into public.group_members(group_id, user_id, display_name)
  select target_group, p.id, p.display_name from public.profiles p where p.id = auth.uid()
  on conflict (group_id, user_id) do nothing;
  return target_group;
end; $$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.group_invites enable row level security;

-- Security-definer membership check avoids recursive RLS policies on group_members.
create or replace function public.is_group_member(target_group uuid, target_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members gm where gm.group_id = target_group and gm.user_id = target_user);
$$;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;

drop policy if exists "Profiles visible to signed-in users" on public.profiles;
create policy "Profiles visible to signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Members read groups" on public.groups;
create policy "Members read groups" on public.groups for select to authenticated using (public.is_group_member(id));
drop policy if exists "Members read memberships" on public.group_members;
create policy "Members read memberships" on public.group_members for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "Members read expenses" on public.expenses;
create policy "Members read expenses" on public.expenses for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "Members create expenses" on public.expenses;
create policy "Members create expenses" on public.expenses for insert to authenticated with check (created_by = auth.uid() and public.is_group_member(group_id) and public.is_group_member(group_id, payer_id));
drop policy if exists "Creators delete own expenses" on public.expenses;
create policy "Creators delete own expenses" on public.expenses for delete to authenticated using (created_by = auth.uid());
drop policy if exists "Members read splits" on public.expense_splits;
create policy "Members read splits" on public.expense_splits for select to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));
drop policy if exists "Members add splits" on public.expense_splits;
create policy "Members add splits" on public.expense_splits for insert to authenticated with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id, user_id)));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.groups, public.group_members to authenticated;
grant select, insert, delete on public.expenses to authenticated;
grant select, insert on public.expense_splits to authenticated;
grant execute on function public.create_trip_group(text) to authenticated;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.join_group_with_invite(text) to authenticated;
