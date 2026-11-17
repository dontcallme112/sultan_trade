-- Apply to a development Supabase project first. No existing shop tables altered.
begin;
create table public.ti_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','analyst','viewer'))
);
create table public.ti_tenders (
  id text primary key,
  payload jsonb not null,
  first_seen timestamptz not null default now()
);
create table public.ti_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id text not null references public.ti_tenders(id) on delete cascade,
  favorite boolean not null default false,
  workflow text not null default 'new' check (workflow in ('new','analysis','interesting','preparing','participating','won','lost','rejected')),
  unique(user_id,tender_id)
);
create table public.ti_runs (
  id uuid primary key default gen_random_uuid(), source text not null,
  started_at timestamptz not null, finished_at timestamptz,
  actor uuid references auth.users(id), status text not null check(status in ('success','error')),
  error text, changed integer not null default 0
);
create table public.ti_history (
  id uuid primary key default gen_random_uuid(), tender_id text not null,
  user_id uuid references auth.users(id), before jsonb, after jsonb,
  created_at timestamptz not null default now()
);
create index ti_preferences_user on public.ti_preferences(user_id);
create index ti_history_tender on public.ti_history(tender_id,created_at);
create index ti_deadline on public.ti_tenders((payload->>'deadline'));

-- Future modules get isolated tables; no AI results or supplier offers are fabricated.
create table public.ti_customers(id uuid primary key default gen_random_uuid(), bin text, name text not null);
create table public.ti_lots(id uuid primary key default gen_random_uuid(), tender_id text references public.ti_tenders(id), payload jsonb not null);
create table public.ti_documents(id uuid primary key default gen_random_uuid(), tender_id text references public.ti_tenders(id), storage_path text not null, extracted_text text);
create table public.ti_suppliers(id uuid primary key default gen_random_uuid(), name text not null, source_url text);
create table public.ti_offers(id uuid primary key default gen_random_uuid(), supplier_id uuid references public.ti_suppliers(id), tender_id text references public.ti_tenders(id), payload jsonb not null, observed_at timestamptz not null);
create table public.ti_calculations(id uuid primary key default gen_random_uuid(), tender_id text references public.ti_tenders(id), user_id uuid references auth.users(id), inputs jsonb not null, results jsonb not null);
create table public.ti_assessments(id uuid primary key default gen_random_uuid(), tender_id text references public.ti_tenders(id), payload jsonb not null, created_at timestamptz default now());
create table public.ti_notifications(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), tender_id text references public.ti_tenders(id), message text not null, read_at timestamptz);

-- All writes via server service role, including membership management.
-- RLS intentionally denies client writes and future-module access by default.
do $$ declare tbl text; begin
  foreach tbl in array array['members','tenders','preferences','runs','history','customers','lots','documents','suppliers','offers','calculations','assessments','notifications'] loop
    execute format('alter table public.ti_%I enable row level security', tbl);
    execute format('revoke all on public.ti_%I from anon, authenticated', tbl);
    execute format('grant all on public.ti_%I to service_role', tbl);
  end loop;
end $$;

create function public.ti_sync(incoming jsonb, sync_run jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare item jsonb; old_row public.ti_tenders; changes integer := 0;
begin
  perform pg_advisory_xact_lock(917341);
  for item in select value from jsonb_array_elements(incoming) loop
    select * into old_row from ti_tenders where id=item->>'id';
    if old_row.id is null or old_row.payload is distinct from item then
      insert into ti_history(tender_id,before,after) values(item->>'id',old_row.payload,item);
      insert into ti_tenders(id,payload) values(item->>'id',item)
      on conflict(id) do update set payload=excluded.payload;
      changes := changes+1;
    end if;
  end loop;
  insert into ti_runs(id,source,started_at,finished_at,actor,status,changed)
  values((sync_run->>'id')::uuid,sync_run->>'source',(sync_run->>'started_at')::timestamptz,
    (sync_run->>'finished_at')::timestamptz,(sync_run->>'actor')::uuid,'success',changes);
  return sync_run || jsonb_build_object('changed',changes);
end $$;
create function public.ti_preference(actor uuid, tender text, patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare previous jsonb; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text || tender,0));
  select to_jsonb(p) into previous from ti_preferences p where user_id=actor and tender_id=tender;
  insert into ti_preferences(user_id,tender_id,favorite,workflow)
  values(actor,tender,coalesce((patch->>'favorite')::boolean,false),coalesce(patch->>'workflow','new'))
  on conflict(user_id,tender_id) do update set
    favorite=case when patch ? 'favorite' then (patch->>'favorite')::boolean else ti_preferences.favorite end,
    workflow=case when patch ? 'workflow' then patch->>'workflow' else ti_preferences.workflow end
  returning to_jsonb(ti_preferences.*) into result;
  insert into ti_history(tender_id,user_id,before,after) values(tender,actor,previous,result);
  return result;
end $$;
revoke all on function public.ti_sync(jsonb,jsonb), public.ti_preference(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.ti_sync(jsonb,jsonb), public.ti_preference(uuid,text,jsonb) to service_role;
commit;
