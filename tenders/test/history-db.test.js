import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('real PostgreSQL history triggers: no backfill, business changes, atomic failure and RLS', async t => {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);`);
 await db.exec(readFileSync(new URL('../migrations/001_tenders.sql',import.meta.url),'utf8'));
 const old='00000000-0000-4000-8000-000000000001', id='00000000-0000-4000-8000-000000000002';
 await db.query("insert into public.tender_lots(id,source,external_id,title) values($1,'test','old','Existing')",[old]);
 await db.exec(readFileSync(new URL('../migrations/20261118045958_tender_history.sql',import.meta.url),'utf8'));
 const events=async()=> (await db.query('select * from public.tender_history order by id')).rows;
 assert.equal((await events()).length,0);
 await db.exec('grant select,insert,update on public.tender_lots, public.tender_lot_state to service_role; set role service_role');
 await db.query("insert into public.tender_lots(id,source,external_id,title,total_price) values($1,'test','new','Cable',100)",[id]);
 await db.query("update public.tender_lots set score=70, synced_at=now(),extra='{"+'"document":"private"'+"}' where id=$1",[id]);
 assert.equal((await events()).length,1);
 await db.query('update public.tender_lots set total_price=120 where id=$1',[id]);
 await db.query("insert into public.tender_lot_state(lot_id,status,updated_by) values($1,'review','00000000-0000-4000-8000-000000000003')",[id]);
 await db.query("update public.tender_lot_state set status='review',updated_at=now() where lot_id=$1",[id]);
 await db.query("update public.tender_lot_state set note='Check licence' where lot_id=$1",[id]);
 const h=await events(); assert.equal(h.length,4);
 assert.equal(h[0].before_data,null);assert.equal('extra' in h[0].after_data,false);
 assert.equal(h[1].before_data.total_price,100);assert.equal(h[1].after_data.total_price,120);
 assert.equal(h[2].before_data.status,'new');assert.equal(h[2].after_data.status,'review');
 assert.equal(h[3].actor_id,'00000000-0000-4000-8000-000000000003');
 await assert.rejects(db.exec('delete from public.tender_history'),/permission denied/);
 await assert.rejects(db.exec("update public.tender_history set kind='source_changed'"),/permission denied/);
 // An audit failure must roll the source write back, never silently lose history.
 await db.exec('reset role; revoke insert on public.tender_history from service_role; set role service_role');
 await assert.rejects(db.query('update public.tender_lots set total_price=999 where id=$1',[id]),/permission denied/);
 assert.equal((await db.query('select total_price from public.tender_lots where id=$1',[id])).rows[0].total_price,'120');
 await db.exec('reset role; grant insert on public.tender_history to service_role');
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.exec('select * from public.tender_history'),/permission denied/);
  await db.exec('reset role');
  // Even accidental SELECT grants remain protected by RLS with no client policies.
  await db.exec(`grant select on public.tender_history to ${role}; set role ${role}`);
  assert.equal((await events()).length,0);
  await db.exec(`reset role; revoke select on public.tender_history from ${role}`);
 }
 const permissions=(await db.query("select has_function_privilege('anon','public.tender_record_source_history()','EXECUTE') as allowed")).rows;
 assert.equal(permissions[0].allowed,false);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.tender_history'::regclass")).rows[0].relrowsecurity,true);
});
