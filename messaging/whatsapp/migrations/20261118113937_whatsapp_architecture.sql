-- Prepared only. Apply when the owner starts the separate WhatsApp connection phase.
begin;
create table public.wa_contacts (
 id uuid primary key default gen_random_uuid(), wa_id text not null unique check(wa_id ~ '^[1-9][0-9]{7,14}$'),
 display_name text, consent_status text not null default 'unknown' check(consent_status in ('unknown','granted','revoked')),
 consent_at timestamptz,consent_source text,last_inbound_at timestamptz,created_at timestamptz not null default now(),
 check(consent_status <> 'granted' or (consent_at is not null and length(consent_source)>0))
);
create table public.wa_templates (
 id uuid primary key default gen_random_uuid(),meta_id text unique,name text not null,language text not null,
 status text not null default 'unknown' check(status in ('unknown','approved','rejected','paused')),
 components jsonb not null default '[]',updated_at timestamptz not null default now(),unique(name,language)
);
create table public.wa_inbox (
 id uuid primary key default gen_random_uuid(),event_key text not null unique check(event_key ~ '^[0-9a-f]{64}$'),payload jsonb not null,
 state text not null default 'pending' check(state in ('pending','processing','done','failed')),attempts integer not null default 0,
 lock_token uuid,locked_until timestamptz,next_attempt_at timestamptz not null default now(),last_error text,
 received_at timestamptz not null default now(),processed_at timestamptz
);
create index wa_inbox_pending_idx on public.wa_inbox(state,next_attempt_at,received_at);
create table public.wa_outbox (
 id uuid primary key default gen_random_uuid(),idempotency_key uuid not null unique,contact_id uuid not null references public.wa_contacts(id),
 payload jsonb not null,state text not null default 'draft' check(state in ('draft','approved','sending','sent','failed','uncertain','cancelled')),
 created_by uuid,approved_by uuid,approved_at timestamptz,provider_message_id text unique,
 lock_token uuid,locked_until timestamptz,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(state not in ('approved','sending','sent') or (approved_by is not null and approved_at is not null))
);
create index wa_outbox_state_idx on public.wa_outbox(state,created_at);
create index wa_outbox_contact_idx on public.wa_outbox(contact_id);
create table public.wa_messages (
 id uuid primary key default gen_random_uuid(),contact_id uuid not null references public.wa_contacts(id),provider_message_id text not null unique,
 direction text not null check(direction in ('inbound','outbound')),kind text not null,text_body text,provider_payload jsonb not null default '{}',
 delivery_status text not null,provider_timestamp timestamptz,created_at timestamptz not null default now()
);
create index wa_messages_contact_idx on public.wa_messages(contact_id,created_at desc);
create table public.wa_audit (
 id bigint generated always as identity primary key,actor_id uuid,event text not null,entity_id uuid,created_at timestamptz not null default now(),details jsonb not null default '{}'
);
create index wa_audit_entity_idx on public.wa_audit(entity_id,created_at desc);
alter table public.wa_contacts enable row level security;
alter table public.wa_templates enable row level security;
alter table public.wa_inbox enable row level security;
alter table public.wa_outbox enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_audit enable row level security;
revoke all on public.wa_contacts,public.wa_templates,public.wa_inbox,public.wa_outbox,public.wa_messages,public.wa_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.wa_contacts,public.wa_templates,public.wa_inbox,public.wa_outbox,public.wa_messages to service_role;
grant select,insert on public.wa_audit to service_role;
revoke all on sequence public.wa_audit_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.wa_audit_id_seq to service_role;

create function public.wa_claim_inbox() returns setof public.wa_inbox language sql security invoker set search_path='' as $$
 update public.wa_inbox set state='failed',last_error='Retry budget exceeded; manual review required',lock_token=null,locked_until=null where state='processing' and locked_until<now() and attempts>=5;
 update public.wa_inbox set state='processing',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes'
 where id=(select id from public.wa_inbox where attempts<5 and next_attempt_at<=now() and (state in ('pending','failed') or (state='processing' and locked_until<now())) order by received_at for update skip locked limit 1) returning *;
$$;
create function public.wa_apply_inbox(p_id uuid,p_token uuid,p_data jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c jsonb;m jsonb;s jsonb;contact uuid;outgoing public.wa_outbox;rank_current integer;rank_next integer;
begin
 perform 1 from public.wa_inbox where id=p_id and lock_token=p_token and state='processing' for update;
 if not found then raise exception 'Inbox lease expired';end if;
 for c in select value from jsonb_array_elements(p_data->'contacts') loop
  insert into public.wa_contacts(wa_id,display_name,last_inbound_at) values(c->>'wa_id',left(c->>'display_name',200),(c->>'last_inbound_at')::timestamptz)
  on conflict(wa_id) do update set last_inbound_at=greatest(wa_contacts.last_inbound_at,excluded.last_inbound_at),display_name=coalesce(excluded.display_name,wa_contacts.display_name);
  if (c->>'opt_out')::boolean then update public.wa_contacts set consent_status='revoked',consent_at=now(),consent_source='inbound_opt_out' where wa_id=c->>'wa_id';end if;
 end loop;
 for m in select value from jsonb_array_elements(p_data->'messages') loop
  select id into contact from public.wa_contacts where wa_id=m->>'wa_id';
  insert into public.wa_messages(contact_id,provider_message_id,direction,kind,text_body,provider_payload,provider_timestamp,delivery_status)
  values(contact,m->>'provider_message_id','inbound',m->>'kind',m->>'text_body',m->'provider_payload',(m->>'provider_timestamp')::timestamptz,'received') on conflict(provider_message_id) do nothing;
 end loop;
 for s in select value from jsonb_array_elements(p_data->'statuses') loop
  if s->>'outbox_id' is not null then
   update public.wa_outbox set state='sent',provider_message_id=s->>'provider_message_id',updated_at=now(),lock_token=null,locked_until=null,last_error=null
   where id=(s->>'outbox_id')::uuid and state in ('sending','uncertain') and s->>'status' in ('sent','delivered','read') returning * into outgoing;
   if found then
    insert into public.wa_messages(contact_id,provider_message_id,direction,kind,text_body,delivery_status)
    values(outgoing.contact_id,s->>'provider_message_id','outbound',outgoing.payload->>'kind',outgoing.payload->>'text',s->>'status') on conflict(provider_message_id) do nothing;
   end if;
  end if;
  select case delivery_status when 'read' then 3 when 'delivered' then 2 when 'sent' then 1 else 0 end into rank_current from public.wa_messages where provider_message_id=s->>'provider_message_id';
  rank_next:=case s->>'status' when 'read' then 3 when 'delivered' then 2 when 'sent' then 1 else 0 end;
  if rank_next>coalesce(rank_current,0) or (s->>'status'='failed' and coalesce(rank_current,0)=0) then update public.wa_messages set delivery_status=s->>'status' where provider_message_id=s->>'provider_message_id';end if;
 end loop;
 update public.wa_inbox set state='done',processed_at=now(),locked_until=null,lock_token=null,last_error=null where id=p_id;
 insert into public.wa_audit(event,entity_id) values('inbox_processed',p_id);
end;
$$;
create function public.wa_claim_outbox() returns setof public.wa_outbox language plpgsql security invoker set search_path='' as $$
begin
 update public.wa_outbox set state='uncertain',last_error='Send result unknown; manual reconciliation required',updated_at=now() where state='sending' and locked_until<now();
 return query update public.wa_outbox set state='sending',lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',updated_at=now()
 where id=(select id from public.wa_outbox where state='approved' order by created_at for update skip locked limit 1) returning *;
end;
$$;
create function public.wa_finish_outbox(p_id uuid,p_token uuid,p_state text,p_message_id text default null) returns void language plpgsql security invoker set search_path='' as $$
declare outgoing public.wa_outbox;
begin
 if p_state not in ('sent','failed','uncertain') or (p_state='sent' and p_message_id is null) then raise exception 'Invalid outcome';end if;
 update public.wa_outbox set state=p_state,provider_message_id=p_message_id,locked_until=null,lock_token=null,updated_at=now(),last_error=case when p_state='sent' then null else 'Delivery not confirmed; manual review required' end
 where id=p_id and lock_token=p_token and state='sending' returning * into outgoing;
 if not found then return;end if;
 if p_state='sent' then insert into public.wa_messages(contact_id,provider_message_id,direction,kind,text_body,delivery_status) values(outgoing.contact_id,p_message_id,'outbound',outgoing.payload->>'kind',outgoing.payload->>'text','sent') on conflict(provider_message_id) do nothing;end if;
 insert into public.wa_audit(event,entity_id) values('outbox_'||p_state,p_id);
end;
$$;
create function public.wa_create_draft(p_key uuid,p_contact uuid,p_payload jsonb,p_user uuid) returns public.wa_outbox language plpgsql security invoker set search_path='' as $$
declare outgoing public.wa_outbox;
begin
 insert into public.wa_outbox(idempotency_key,contact_id,payload,created_by) values(p_key,p_contact,p_payload,p_user) on conflict(idempotency_key) do nothing returning * into outgoing;
 if not found then
  select * into outgoing from public.wa_outbox where idempotency_key=p_key;
  if outgoing.created_by is distinct from p_user or outgoing.contact_id<>p_contact or outgoing.payload<>p_payload then raise exception 'Idempotency key conflict';end if;
  return outgoing;
 end if;
 insert into public.wa_audit(actor_id,event,entity_id) values(p_user,'draft_created',outgoing.id);
 return outgoing;
end;
$$;
create function public.wa_approve_draft(p_id uuid,p_user uuid) returns public.wa_outbox language plpgsql security invoker set search_path='' as $$
declare outgoing public.wa_outbox;
begin
 select * into outgoing from public.wa_outbox where id=p_id for update;
 if not found or outgoing.state<>'draft' then raise exception 'Only a draft can be approved';end if;
 update public.wa_outbox set state='approved',approved_at=now(),approved_by=p_user,updated_at=now() where id=p_id returning * into outgoing;
 insert into public.wa_audit(actor_id,event,entity_id) values(p_user,'draft_approved',p_id);
 return outgoing;
end;
$$;
revoke all on function public.wa_claim_inbox(),public.wa_apply_inbox(uuid,uuid,jsonb),public.wa_claim_outbox(),public.wa_finish_outbox(uuid,uuid,text,text),public.wa_create_draft(uuid,uuid,jsonb,uuid),public.wa_approve_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.wa_claim_inbox(),public.wa_apply_inbox(uuid,uuid,jsonb),public.wa_claim_outbox(),public.wa_finish_outbox(uuid,uuid,text,text),public.wa_create_draft(uuid,uuid,jsonb,uuid),public.wa_approve_draft(uuid,uuid) to service_role;
commit;
