import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {makeApp,listen} from './helpers.js';
import {createSupabaseStore} from '../store.js';
test('board returns all filtered pages without private workspaces/documents; shared notes reject stale versions and preserve status',async t=>{
 const m=makeApp({allowed:['boss@example.com','staff@example.com']}),s=await listen(m.app);t.after(s.close);const boss='token:u1:boss@example.com',staff='token:u2:staff@example.com';
 await m.store.upsertLots(Array.from({length:27},(_,i)=>({source:'test',external_id:String(i),title:'Board '+i,extra:{document:'source text'}})));const lot=(await m.store.listLots())[0];
 assert.equal((await s.call('GET','/api/tenders/board')).status,401);
 const board=(await s.call('GET','/api/tenders/board?page=2&limit=1',{token:boss})).json;assert.equal(board.items.length,27);assert.equal('extra' in board.items[0],false);assert.equal('finance' in board.items[0],false);
 const path='/api/tenders/'+lot.id+'/note';assert.equal((await s.call('PUT',path,{secret:'S3CRET',body:{note:'No actor',expectedNote:null}})).status,401);
 assert.equal((await s.call('PUT',path,{token:boss,body:{note:'Draft without version'}})).status,400);
 const first=await s.call('PUT',path,{token:boss,body:{note:'First team note',expectedNote:null}});assert.equal(first.status,200);
 await m.service.setWorkState('u2',lot.id,{status:'participating'});
 assert.equal((await s.call('PUT',path,{token:staff,body:{note:'Other employee',expectedNote:'First team note'}})).status,200);
 const stale=await s.call('PUT',path,{token:boss,body:{note:'Stale local draft',expectedNote:'First team note'}});assert.equal(stale.status,409);
 const current=await m.service.get('u1',lot.id);assert.equal(current.note,'Other employee');assert.equal(current.workflow,'participating');
 const events=(await m.store.history(lot.id)).items;assert.equal(events.filter(e=>e.after_data?.note==='Stale local draft').length,0);assert.equal(events[0].actor_id,'u2');
 assert.equal((await s.call('PUT',path,{token:staff,body:{note:'',expectedNote:'Other employee'}})).json.note,null);
 assert.equal((await s.call('GET','/api/tenders/board?status=participating',{token:boss})).json.items.length,1);
 assert.equal((await s.call('GET','/api/tenders/board?search=none',{token:boss})).json.total,0);
});
test('Supabase note store uses a JSON RPC (including long Cyrillic), maps conflicts and never exposes database details',async()=>{
 let args;const store=createSupabaseStore({rpc:async(name,input)=>{args={name,input};return {data:true,error:null};}});
 await store.setNote('lot','Я'.repeat(2000),'actor',null);assert.equal(args.name,'tender_update_team_note');assert.equal(args.input.p_note.length,2000);assert.equal(args.input.p_expected_note,null);
 for(const code of ['40001','42501']){const failing=createSupabaseStore({rpc:async()=>({error:{code,message:'secret details'}})});await assert.rejects(failing.setNote('lot','note','user',null),e=>e.status===(code==='40001'?409:503)&&!e.message.includes('secret'));}
});
test('real PostgreSQL atomic note function preserves concurrent fields, rejects stale text, audits once and denies client RPC',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
 await db.exec(readFileSync(new URL('../migrations/001_tenders.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/20261118045958_tender_history.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/20261118134442_tender_team_note_cas.sql',import.meta.url),'utf8'));
 const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';await db.query("insert into public.tender_lots(id,source,external_id,title) values($1,'test','fixture','Fixture')",[id]);await db.exec('grant select,insert,update on public.tender_lots,public.tender_lot_state to service_role;set role service_role');
 const update=async(expected,note)=>db.query('select public.tender_update_team_note($1,$2,$3,$4)',[id,expected,note,actor]);await update(null,'First');await db.query("update public.tender_lot_state set status='participating' where lot_id=$1",[id]);await update('First','Я'.repeat(2000));await assert.rejects(update('First','Lost update'),e=>e.code==='40001');
 let state=(await db.query('select * from public.tender_lot_state where lot_id=$1',[id])).rows[0];assert.equal(state.status,'participating');assert.equal(state.note,'Я'.repeat(2000));
 const count=(await db.query('select count(*)::int as n from public.tender_history')).rows[0].n;await update('Я'.repeat(2000),'Я'.repeat(2000));assert.equal((await db.query('select count(*)::int as n from public.tender_history')).rows[0].n,count);
 await db.exec('reset role;set role authenticated');await assert.rejects(update('Я'.repeat(2000),'Unauthorized'),/permission denied/);await db.exec('reset role');assert.equal((await db.query("select prosecdef from pg_proc where oid='public.tender_update_team_note(uuid,text,text,uuid)'::regprocedure")).rows[0].prosecdef,false);
});
