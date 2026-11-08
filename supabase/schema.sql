create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  education text,
  plan text not null default 'free' check (plan in ('free','pro')),
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due_date date,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.homework_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  daily_sequence integer,
  watermark boolean not null default false,
  question_count integer,
  generated_answers jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists saved_items_user_idx on public.saved_items(user_id);
create index if not exists study_tasks_user_idx on public.study_tasks(user_id);
create index if not exists homework_jobs_user_date_idx on public.homework_jobs(user_id,created_at);

-- Automatically create a profile for every newly registered user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id,full_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Student'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.saved_items enable row level security;
alter table public.study_tasks enable row level security;
alter table public.homework_jobs enable row level security;

create policy "Read own profile" on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy "Update own profile" on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

create policy "Read own saved items" on public.saved_items for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own saved items" on public.saved_items for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Delete own saved items" on public.saved_items for delete to authenticated using ((select auth.uid())=user_id);

create policy "Read own tasks" on public.study_tasks for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own tasks" on public.study_tasks for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own tasks" on public.study_tasks for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Delete own tasks" on public.study_tasks for delete to authenticated using ((select auth.uid())=user_id);

create policy "Read own homework jobs" on public.homework_jobs for select to authenticated using ((select auth.uid())=user_id);
create policy "Update own homework jobs" on public.homework_jobs for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Reserve a generation before calling the AI. A failed generation is marked failed
-- and does not count toward the daily completed-PDF quota.
create or replace function public.reserve_homework_generation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_count integer;
  v_limit integer;
  v_job uuid;
  v_watermark boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select plan into v_plan from public.profiles where id=v_uid;
  if v_plan is null then v_plan := 'free'; end if;

  select count(*) into v_count
  from public.homework_jobs
  where user_id=v_uid
    and status in ('processing','completed')
    and (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date;

  v_limit := case when v_plan='pro' then 50 else 2 end;
  if v_count >= v_limit then
    raise exception 'Daily homework PDF limit reached';
  end if;

  v_watermark := (v_plan='free' and v_count=1);
  insert into public.homework_jobs(user_id,status,daily_sequence,watermark)
  values(v_uid,'processing',v_count+1,v_watermark)
  returning id into v_job;

  return jsonb_build_object('job_id',v_job,'sequence',v_count+1,'watermark',v_watermark,'plan',v_plan);
end;
$$;

revoke all on function public.reserve_homework_generation() from public;
grant execute on function public.reserve_homework_generation() to authenticated;

-- The browser cannot set its own plan or role. Admins must change these through
-- the Supabase SQL editor or a separately protected admin backend.
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,education,updated_at) on public.profiles to authenticated;

grant select,insert,delete on public.saved_items to authenticated;
grant select,insert,update,delete on public.study_tasks to authenticated;
grant select,update on public.homework_jobs to authenticated;

-- Private file bucket. The current starter app processes files in the browser;
-- this bucket is ready for a future private upload workflow.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('student-files','student-files',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "Users upload to own private folder" on storage.objects
for insert to authenticated
with check (bucket_id='student-files' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy "Users read own private files" on storage.objects
for select to authenticated
using (bucket_id='student-files' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy "Users delete own private files" on storage.objects
for delete to authenticated
using (bucket_id='student-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
