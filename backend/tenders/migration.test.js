import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { demoTenders } from './domain.js';

test('PostgreSQL migration, transactional RPC, audit and client access denial',async()=>{
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    await db.exec(await readFile(new URL('../../supabase/migrations/202611170001_tender_intelligence.sql',import.meta.url),'utf8'));
    const actor='00000000-0000-0000-0000-000000000001';
    await db.query('insert into auth.users(id) values ($1)',[actor]);
    const run={id:'00000000-0000-0000-0000-000000000002',source:'demo',actor,started_at:new Date().toISOString(),finished_at:new Date().toISOString()};
    const sync=async()=> (await db.query('select ti_sync($1::jsonb,$2::jsonb) as result',[JSON.stringify(demoTenders()),JSON.stringify(run)])).rows[0].result;
    assert.equal((await sync()).changed,4);
    run.id='00000000-0000-0000-0000-000000000003';
    assert.equal((await sync()).changed,0);
    await db.query('select ti_preference($1,$2,$3::jsonb)',[actor,'demo:1',JSON.stringify({favorite:true,workflow:'preparing'})]);
    await db.query('select ti_preference($1,$2,$3::jsonb)',[actor,'demo:1',JSON.stringify({favorite:false})]);
    const pref=(await db.query('select * from ti_preferences')).rows[0];
    assert.equal(pref.favorite,false);assert.equal(pref.workflow,'preparing');
    assert.equal((await db.query('select count(*)::int as n from ti_history')).rows[0].n,6);
    await assert.rejects(db.query('select ti_preference($1,$2,$3::jsonb)',[actor,'demo:1','{"workflow":"invalid"}']));
    assert.equal((await db.query('select count(*)::int as n from ti_history')).rows[0].n,6);
    const tables=(await db.query("select relname from pg_class where relname like 'ti_%' and relkind='r' and not relrowsecurity")).rows;
    assert.equal(tables.length,0);
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.ti_tenders'));
      await assert.rejects(db.query("insert into public.ti_members(user_id,role) values ($1,'admin')",[actor]));
      await assert.rejects(db.query('select public.ti_preference($1,$2,$3::jsonb)',[actor,'demo:1','{"favorite":true}']));
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
