import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

// One serialized writer per process. Demo store is explicitly single-process only.
export class DemoStore {
  constructor(path) { this.path = path; this.queue = Promise.resolve(); }
  async read() {
    try { return JSON.parse(await readFile(this.path, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; return { tenders: [], preferences: [], runs: [], history: [] }; }
  }
  async all(table) { return (await this.read())[table]; }
  transact(fn) {
    const run = this.queue.then(async () => {
      const state = await this.read(); const result = await fn(state);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, JSON.stringify(state), { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path); return result;
    });
    this.queue = run.catch(() => {}); return run;
  }
  async sync(rows, run) {
    return this.transact(s => {
      let changed = 0;
      for (const row of rows) {
        const previous = s.tenders.find(t => t.id === row.id);
        if (previous && JSON.stringify(previous.payload) === JSON.stringify(row)) continue;
        s.history.push({ tender_id: row.id, before: previous?.payload || null, after: row, created_at: run.finished_at });
        const next = { id: row.id, payload: row, first_seen: previous?.first_seen || run.finished_at };
        if (previous) s.tenders[s.tenders.indexOf(previous)] = next; else s.tenders.push(next);
        changed++;
      }
      run.changed = changed; s.runs.push(run); return run;
    });
  }
  async log(run) { return this.transact(s => { s.runs.push(run); }); }
  async preference(userId, tenderId, patch) {
    return this.transact(s => {
      let row = s.preferences.find(p => p.user_id === userId && p.tender_id === tenderId);
      const before = row ? { ...row } : null;
      if (!row) { row = { user_id: userId, tender_id: tenderId, favorite: false, workflow: 'new' }; s.preferences.push(row); }
      Object.assign(row, patch);
      s.history.push({ tender_id: tenderId, user_id: userId, before, after: { ...row }, created_at: new Date().toISOString() });
      return row;
    });
  }
}

export class SupabaseStore {
  constructor(client) { this.client = client; }
  async all(table) {
    // Explicit paging avoids Supabase's default 1000-row truncation.
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client.from(`ti_${table}`).select('*').order('id').range(from, from + 999);
      if (error) throw error; rows.push(...data); if (data.length < 1000) return rows;
    }
  }
  async sync(rows, run) {
    const { data, error } = await this.client.rpc('ti_sync', { incoming: rows, sync_run: run });
    if (error) throw error; return data;
  }
  async log(run) { const { error } = await this.client.from('ti_runs').insert(run); if (error) throw error; }
  async preference(userId, tenderId, patch) {
    const { data, error } = await this.client.rpc('ti_preference', { actor: userId, tender: tenderId, patch });
    if (error) throw error; return data;
  }
}
