-- Shared tender history. No backfill: only changes observed after installation.
-- Apply only after owner approval. Existing shop tables are untouched.
begin;
create table public.tender_history (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.tender_lots(id) on delete cascade,
  kind text not null check (kind in ('source_created','source_changed','workflow_changed')),
  before_data jsonb,
  after_data jsonb not null,
  actor_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index tender_history_lot_id_idx on public.tender_history (lot_id, id desc);
alter table public.tender_history enable row level security;
revoke all on public.tender_history from public, anon, authenticated, service_role;
grant select, insert on public.tender_history to service_role;
revoke all on sequence public.tender_history_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.tender_history_id_seq to service_role;

create function public.tender_record_source_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  previous jsonb;
  current_data jsonb;
  fields text[] := ARRAY['source','external_id','number','title','description','customer_name','customer_bin','region_code','region_name','method','status_raw','total_price','quantity','currency','published_at','deadline_at','url','directions'];
begin
  select jsonb_object_agg(k, to_jsonb(new)->k) into current_data from unnest(fields) as k;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, to_jsonb(old)->k) into previous from unnest(fields) as k;
  end if;
  if previous is distinct from current_data then
    insert into public.tender_history(lot_id,kind,before_data,after_data)
    values(new.id, case when tg_op = 'INSERT' then 'source_created' else 'source_changed' end,previous,current_data);
  end if;
  return new;
end;
$$;
revoke all on function public.tender_record_source_history() from public, anon, authenticated;
create trigger tender_source_history after insert or update on public.tender_lots
for each row execute function public.tender_record_source_history();

create function public.tender_record_workflow_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  previous jsonb := jsonb_build_object('status','new','note',null);
  current_data jsonb;
begin
  if tg_op = 'UPDATE' then
    previous := jsonb_build_object('status',old.status,'note',old.note);
  end if;
  current_data := jsonb_build_object('status',new.status,'note',new.note);
  if previous is distinct from current_data then
    insert into public.tender_history(lot_id,kind,before_data,after_data,actor_id)
    values(new.lot_id,'workflow_changed',previous,current_data,new.updated_by);
  end if;
  return new;
end;
$$;
revoke all on function public.tender_record_workflow_history() from public, anon, authenticated;
create trigger tender_workflow_history after insert or update on public.tender_lot_state
for each row execute function public.tender_record_workflow_history();
commit;
