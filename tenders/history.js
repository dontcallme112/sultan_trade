// Only shared procurement/workflow fields belong in the team history.
// Personal calculations, uploaded documents and credentials are deliberately excluded.
export const SOURCE_HISTORY_FIELDS = ['source','external_id','number','title','description','customer_name','customer_bin','region_code','region_name','method','status_raw','total_price','quantity','currency','published_at','deadline_at','url','directions'];
export function historySnapshot(row, fields = SOURCE_HISTORY_FIELDS) {
  return row ? Object.fromEntries(fields.map(k => [k, structuredClone(row[k] ?? null)])) : null;
}
export function historyChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}
