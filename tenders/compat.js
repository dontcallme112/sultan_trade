// Additive contract for the existing React /tenders UI; native master fields stay intact.
const categoryGroups = { security: ['cctv','fire','acs'], it: ['it','fiber'], display: ['display','audio'], construction: ['build'], electrical: ['electrical'], other: ['other'] };
const labels = { direction: 'Направление', price: 'Сумма', deadline: 'Срок подачи', region: 'Регион', method: 'Способ закупки', status: 'Статус закупки' };
export function uiQuery(q) {
  const aliases = { search:'q', min:'minPrice', max:'maxPrice', before:'deadlineBefore', favorite:'onlyFav', active:'onlyOpen', status:'workStatus' };
  const out = { ...q };
  for (const [from,to] of Object.entries(aliases)) if (q[from] !== undefined) out[to] = q[from];
  if (q.category) out.direction = (categoryGroups[q.category] || []).join(',');
  if (out.workStatus === 'analysis') out.workStatus = 'review';
  out.sort = { amount:'price', rating:'score', newest:'published' }[q.sort] || q.sort;
  for (const key of ['minPrice','maxPrice']) {
    if (out[key] !== undefined && out[key] !== '' && (!Number.isFinite(Number(out[key])) || Number(out[key]) < 0))
      throw Object.assign(new Error('Некорректная сумма'), { status:400 });
  }
  if (out.minPrice !== undefined && out.maxPrice !== undefined && out.minPrice !== '' && out.maxPrice !== '' && Number(out.minPrice)>Number(out.maxPrice)) throw Object.assign(new Error('Минимум больше максимума'),{status:400});
  if (out.deadlineBefore && !Number.isFinite(Date.parse(out.deadlineBefore))) throw Object.assign(new Error('Некорректная дата'),{status:400});
  return out;
}
export function uiLot(lot) {
  const category = Object.entries(categoryGroups).find(([,dirs]) => dirs.some(d => lot.directions.includes(d)))?.[0] || 'other';
  return { ...lot, demo:lot.is_demo, customer:lot.customer_name, region:lot.region_name,
    amount:lot.total_price, deadline:lot.deadline_at, source_url:lot.url,
    workflow:lot.work_status === 'review' ? 'analysis' : lot.work_status,
    history:[], history_available:false,
    rating:{score:lot.score,coverage:(lot.score_confidence || 0)/100,category,
      formula:'Сумма (вес × значение) / сумма весов известных факторов × 100. Прибыль не оценивалась.',
      unknown:[...(lot.score_detail?.missing || []).map(k=>labels[k] || k),'Прибыль','Наличие оборудования','Лицензии','Договорные риски'],
      factors:lot.score_detail?.factors || [] } };
}
export function uiSource(s) {
  return {...s, label:typeof s.label === 'string' ? s.label : s.label?.ru || s.id,
    status:s.state, reason:s.message || '', documentation:s.documentation || null};
}
