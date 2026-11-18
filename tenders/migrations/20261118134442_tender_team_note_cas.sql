-- Atomic shared-note updates; no changes to shop tables or existing data.
begin;
create function public.tender_update_team_note(p_lot_id uuid,p_expected_note text,p_note text,p_actor uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare previous public.tender_lot_state;
begin
 if p_actor is null or length(p_note)>2000 or length(p_expected_note)>2000 then raise exception using errcode='22023',message='Invalid note update';end if;
 select * into previous from public.tender_lot_state where lot_id=p_lot_id for update;
 if found then
  if previous.note is distinct from p_expected_note then raise exception using errcode='40001',message='Team note changed';end if;
  if previous.note is not distinct from p_note then return true;end if;
  update public.tender_lot_state set note=p_note,updated_by=p_actor,updated_at=clock_timestamp() where lot_id=p_lot_id;
 else
  if p_expected_note is not null then raise exception using errcode='40001',message='Team note changed';end if;
  insert into public.tender_lot_state(lot_id,status,note,updated_by,updated_at) values(p_lot_id,'new',p_note,p_actor,clock_timestamp()) on conflict(lot_id) do nothing;
  if not found then raise exception using errcode='40001',message='Team note changed';end if;
 end if;
 return true;
end;
$$;
revoke all on function public.tender_update_team_note(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.tender_update_team_note(uuid,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
