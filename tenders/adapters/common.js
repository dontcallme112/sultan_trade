import { classify } from '../directions.js';

// Единый вид лота внутри системы. Любой адаптер возвращает массив таких объектов.
export function normalizeLot(src, base) {
  const text = [base.title, base.description, ...(base.extra?.enstru || []).map(e => `${e.name || ''} ${e.short || ''}`)].join(' ');
  return {
    source: src,
    external_id: String(base.external_id),
    number: base.number ?? null,
    title: String(base.title || '').slice(0, 500),
    description: base.description ? String(base.description).slice(0, 2000) : null,
    customer_name: base.customer_name ?? null,
    customer_bin: base.customer_bin ?? null,
    region_code: base.region_code ?? null,
    region_name: base.region_name ?? null,
    method: base.method ?? null,
    status_raw: base.status_raw ?? null,
    total_price: base.total_price == null || base.total_price === '' ? null : Number(base.total_price),
    quantity: base.quantity == null ? null : Number(base.quantity),
    currency: 'KZT',
    published_at: base.published_at ?? null,
    deadline_at: base.deadline_at ?? null,
    url: base.url ?? null,
    directions: classify(text).ids,
    extra: base.extra || {},
    is_demo: Boolean(base.is_demo),
  };
}

export class AdapterError extends Error {
  constructor(message, code = 'ADAPTER_ERROR') { super(message); this.code = code; }
}
