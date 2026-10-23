// intant.js — интеграция с B2B API Intant (прайс GetPersonalPrices + остатки GetQuantities).
// Товары Intant ложатся в ту же таблицу products как «свои» (source='manual', supplier='Intant'), поэтому категории, поиск,
// наценка на сервере и корзина работают так же, как у остальных товаров. Закупочная цена (PersonalPrice) наружу не отдаётся.
import { createHash } from 'node:crypto';

export const INTANT_SUPPLIER = 'Intant';
export const INTANT_ROOT = { id: '990005', name: 'Сети, телеком и ИТ-оборудование' };
export const INTANT_ROOT_SECURITY = { id: '990007', name: 'Безопасность и видеонаблюдение' };
export const INTANT_ROOT_POWER = { id: '990008', name: 'Электропитание и зарядные станции' };

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ───── разделы: по ключевым словам в названии (в API Intant категорий нет); первое совпадение выигрывает ─────
// Порядок важен: узкие правила (шлагбаум, домофон, регистратор) стоят раньше широких (камера, сеть), а марки без уточнения («Hikvision …») только в конце.
const SEC = INTANT_ROOT_SECURITY.id, PWR = INTANT_ROOT_POWER.id;
export const DEFAULT_CATEGORIES = [
  // безопасность
  { id: '990710', root: SEC, name: 'Кронштейны и крепления для камер', match: '^(?=.*(камер|домофон|hikvision|hilook|dahua|ajax))(?=.*(кронштейн|стойка для крепления|крепление|штатив))' },
  { id: '990703', root: SEC, name: 'Жёсткие диски для видеонаблюдения', match: 'жесткий диск|(^|[\\s(,])hdd([\\s),]|$)|skyhawk|твердотельный' },
  { id: '990702', root: SEC, name: 'Видеорегистраторы', match: 'видеорегистратор|(^|[^a-z])(nvr|dvr|xvr)([^a-z]|$)' },
  { id: '990711', root: SEC, name: 'Досмотровое и противокражное оборудование', match: 'металлодетектор|досмотр|рентген|видеоконтроля днища|противокраж' },
  { id: '990705', root: SEC, name: 'Шлагбаумы и ограждения', match: 'шлагбаум|ограждени|парковочн|боллард|привод (для )?ворот|откатн(ые|ых) ворот|распашн(ые|ых) ворот|калитк|ворот' },
  { id: '990706', root: SEC, name: 'Домофоны и вызывные панели', match: 'домофон|вызывн(ая|ой|ые) панел' },
  { id: '990704', root: SEC, name: 'Контроль доступа (СКУД)', match: 'турникет|считыватель|контроллер (доступа|замка)|контроля доступа|биометрическ|терминал (доступа|распознаван)|распознаван|(^|[\\s(])замок|электромагнитн|доводчик|rfid|mifare|скуд|(^|[\\s])ts[12]000|speedface|senseface|inbio|saturn t|контроллер лифта|контроллер регистрации|licon' },
  { id: '990707', root: SEC, name: 'Пожарная и охранная сигнализация', match: 'ппку|извещател|пожарн|охранн|сигнализац|оповещател|сирена|датчик (движения|дыма|открытия|разбития|затопления)|приемно-контрольн|адресн|искробезопасн|болид|риэлта|спектрон|сибарс|эпотос|спецприбор|лунь|квазар|комком|(^|[\\s(])шс([\\s).,]|$)|(^|[\\s(])рип-?\\d|ax ?pro|starterkit|demostand|ajax hub|hub (kit|2|hybrid)|fibra|контроллер систем безопасности|motionprotect|doorprotect|keypad|doorbell|lifequality|waterstop|видеозвонок|тревожн' },
  { id: '990708', root: SEC, name: 'Звук и оповещение', match: 'усилитель|громкоговорител|микшер|микшир|проигрыватель|тюнер|акустическ|звуков|микрофон|рупор|колонк|(^|[\\s(])itc([\\s)]|$)' },
  { id: '990701', root: SEC, name: 'Видеокамеры', match: 'камер(а|ы|у|ой)|видеокамер|ip-?камер|(^|[^a-z])ptz([^a-z]|$)|bullet|купольн' },
  // телеком и сети
  { id: '990514', name: 'IP-телефония', match: 'fanvil|ip-?телефон|телефонный аппарат|(^|[^a-z])sip([^a-z]|$)' },
  { id: '990502', name: 'Оптические кабели и компоненты', match: 'оптическ|оптоволокон|fttx|(^|[\\s(])(sc|lc|fc|st)[\\/\\- ]|сплайс|пигтейл|pigtail|медиаконвертер' },
  { id: '990501', name: 'Шкафы и стойки', match: '(^|[\\s(])шкаф([\\s)]|$)|^(напольная |настенная |телекоммуникационная |серверная )?стойка' },
  { id: '990503', name: 'Кабель витая пара', match: '^(?=.*(кабель|бухта))(?=.*(витая пара|utp|ftp|stp|cat ?[5-8]))' },
  { id: '990504', name: 'Патч-корды', match: 'патч-?корд' },
  { id: '990505', name: 'Патч-панели и кроссы', match: 'патч-?панел|кроссов|плинт' },
  { id: '990510', name: 'Инструмент и тестеры', match: 'инструмент|кримпер|тестер|обжим|стриппер|(^|[\\s(])нож([\\s)]|$)' },
  { id: '990513', root: PWR, name: 'Зарядные станции для электромобилей', match: 'зарядн(ая|ые|ую) станци|электромобил|wallbox' },
  { id: '990511', name: 'Принтеры, МФУ и офисная техника', match: 'принтер|(^|[\\s(])мфу([\\s)]|$)|плоттер|сканер|ламинатор|фальцовщик|брошюровщик|уничтожитель|копир|картридж|тонер' },
  { id: '990515', name: 'Дисплеи и цифровые вывески', match: 'интерактивный дисплей|цифров(ая|ые|ую) вывеск|видеостен|дисплей|(^|[\\s(])монитор([\\s)]|$)' },
  { id: '990512', name: 'Серверы и системы хранения', match: 'сервер|(^|[^a-z])схд([^a-z]|$)|storage' },
  { id: '990507', name: 'Сетевое оборудование', match: 'коммутатор|свитч|switch|маршрутизатор|роутер|точка доступа|access point|wi-?fi|sfp|poe|сетевая карта|межсетевой экран|firewall|беспроводн(ой|ая|ое|ые) (передач|мост|точк)|(^|[\\s(])cpe|wi-tek|dptech|eltex' },
  { id: '990506', name: 'Розетки, модули и коннекторы', match: 'розетк|keystone|коннектор|rj-?45|разъ[её]м|джек|вставка|модуль' },
  { id: '990508', root: PWR, name: 'Электропитание', match: '(^|[\\s(])(ибп|ups|pdu)([\\s)]|$)|бесперебойн|блок питани|источник питани|блок розеток|стабилизатор|аккумулятор|батаре' },
  { id: '990509', name: 'Кабельные трассы и крепёж', match: 'лоток|кабель-?канал|гофр|труба|стяжк|хомут|креп[её]ж|органайзер|держател|скоб|дюбел|винт|гайк|заглушк' },
  // марки без уточнения в названии: в «Прочее (безопасность)»
  { id: '990709', root: SEC, name: 'Прочее (безопасность)', match: 'hikvision|hilook|dahua|slinex|ezviz|ajax|zkteco|perco|ironlogic|yale|nice|forteza' },
];
export const FALLBACK_CATEGORY = { id: '990599', name: 'Прочее' };

export function compileCategories(config) {
  const roots = new Map([[INTANT_ROOT.id, INTANT_ROOT], [INTANT_ROOT_SECURITY.id, INTANT_ROOT_SECURITY], [INTANT_ROOT_POWER.id, INTANT_ROOT_POWER]]);
  for (const r of Array.isArray(config?.roots) ? config.roots : []) if (/^\d{4,8}$/.test(String(r?.id)) && r?.name) roots.set(String(r.id), { id: String(r.id), name: String(r.name) });
  const cats = Array.isArray(config?.categories) && config.categories.length ? config.categories : DEFAULT_CATEGORIES;
  const fb = config?.fallback?.id ? config.fallback : FALLBACK_CATEGORY;
  const rootOf = (id) => roots.get(String(id)) || INTANT_ROOT;
  return {
    rules: cats.filter(c => /^\d{4,8}$/.test(String(c.id)) && c.name && c.match).map(c => ({ id: String(c.id), name: String(c.name), root: rootOf(c.root), re: new RegExp(c.match, 'i') })),
    fallback: { id: String(fb.id), name: String(fb.name), root: rootOf(fb.root) },
  };
}
const DEFAULT_COMPILED = compileCategories();
export const categorize = (name, compiled = DEFAULT_COMPILED) => {
  const n = norm(name);
  return compiled.rules.find(r => r.re.test(n)) || compiled.fallback;
};

// ───── клиент API ─────
export function createIntantClient({ baseUrl = 'https://api.intant.kz', login, password, token, authMode, fetchImpl = fetch, timeoutMs = 120000, tries = 4, retryBaseMs = 2000,
  sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const mode = authMode || (token && !login ? 'bearer' : 'basic');
  const auth = () => (mode === 'bearer' ? `Bearer ${token}` : `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`);

  async function get(path) {
    for (let n = 1; ; n++) {
      let res;
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
        try { res = await fetchImpl(`${base}/${path}`, { headers: { Accept: 'application/json', Authorization: auth() }, signal: ctl.signal }); } finally { clearTimeout(t); }
      } catch (e) {
        if (n >= tries) throw new Error(`Intant не отвечает (${path}): ${e?.name === 'AbortError' ? 'таймаут' : 'ошибка сети'}`);
        await sleep(retryBaseMs * 2 ** (n - 1)); continue;
      }
      if (res.status === 401) throw new Error('Intant отклонил доступ (401): проверьте логин и пароль. В их инструкции упомянуты и Basic, и Bearer: уточните у менеджера Intant способ входа (INTANT_AUTH=bearer и INTANT_TOKEN)');
      if (res.status === 403) throw new Error('Intant: нет прав на чтение (403). Попросите персонального менеджера Intant активировать интеграцию');
      if (res.status === 429 || res.status >= 500) {
        if (n >= tries) throw new Error(`Intant ${path}: ошибка ${res.status} после ${tries} попыток`);
        const ra = Number(res.headers?.get?.('retry-after'));
        await sleep(ra > 0 ? Math.min(ra * 1000, 60000) : retryBaseMs * 2 ** (n - 1)); continue;
      }
      if (!res.ok) throw new Error(`Intant ${path}: ошибка ${res.status}`);
      let data; try { data = await res.json(); } catch { throw new Error(`Intant ${path}: ответ не JSON`); }
      if (!Array.isArray(data)) throw new Error(`Intant ${path}: ожидался список товаров, пришло другое`);
      return data;
    }
  }
  return { mode, getPrices: () => get('GetPersonalPrices'), getQuantities: () => get('GetQuantities') };
}

// ───── сборка строк таблицы products ─────
// Артикул на сайте: нейтральный код от GUID (по нему Intant не найти, а GUID у Intant постоянный, в отличие от Article и Name)
export const articleFor = (guid) => 'TK-' + createHash('sha1').update(String(guid).trim().toLowerCase()).digest('hex').slice(0, 10).toUpperCase();
const unitOf = (u) => { const s = clean(u, 10).toLowerCase(); return !s ? 'шт.' : s === 'шт' ? 'шт.' : s; };
const CITY_ALIASES = { 'almaty': 'алматы', 'алма-ата': 'алматы', 'astana': 'астана', 'нур-султан': 'астана', 'нур-султан / астана': 'астана' };
export const parseCities = (s) => String(s ?? 'Алматы').split(',').map(x => norm(x)).filter(Boolean).map(x => CITY_ALIASES[x] || x);

export function buildRows(prices, quantities, { cities = ['алматы'], categories = DEFAULT_COMPILED, now = new Date().toISOString() } = {}) {
  const want = cities.includes('*') ? null : new Set(cities);
  const stock = new Map();
  for (const q of quantities || []) {
    if (!q?.GUID) continue;
    const city = norm(q.City); if (want && !want.has(CITY_ALIASES[city] || city)) continue;
    const qty = Number(q.Quantity); if (!(qty > 0)) continue;
    const s = stock.get(q.GUID) || { total: 0, brand: '', top: 0 }; s.total += qty;
    if (qty > s.top && q.Brand) { s.top = qty; s.brand = q.Brand; }       // бренд берём у склада, где товара больше всего
    stock.set(q.GUID, s);
  }
  const rows = [], seen = new Set(), skipped = { noStock: 0, noPrice: 0, bad: 0, duplicate: 0 };
  for (const p of prices || []) {
    if (!p?.GUID) { skipped.bad++; continue; }
    if (seen.has(p.GUID)) { skipped.duplicate++; continue; } seen.add(p.GUID);
    const s = stock.get(p.GUID); if (!s) { skipped.noStock++; continue; }
    const price = Number(p.PersonalPrice); if (!(price > 1 && price < 1e9)) { skipped.noPrice++; continue; }
    const name = clean(p.Name, 200); if (name.length < 3) { skipped.bad++; continue; }
    const cat = categorize(name, categories);
    rows.push({ article: articleFor(p.GUID), name, full_name: name, brand: clean(s.brand, 80), price, price1: price, price2: price, price_usd: null,
      quantity: String(Math.max(1, Math.floor(s.total))), isnew: 0, image_url: null, images: [], category_id: cat.id, root_category_id: cat.root.id,
      category_name: cat.name, root_category_name: cat.root.name, description: null, unit: unitOf(p.Unit), supplier: INTANT_SUPPLIER, source: 'manual', raw_data: {}, synced_at: now });
  }
  return { rows, skipped };
}

const numSig = (v) => (v == null || v === '' ? '' : String(Number(v)));
export const rowSig = (r) => [r.name, r.brand, numSig(r.price), r.unit, r.quantity, r.category_id, r.category_name, r.root_category_id, r.root_category_name].map(v => (v == null ? '' : String(v))).join('\u0001');

/** Синхронизация: пишем только изменившееся, исчезнувшее и обнулившееся прячем (quantity '0'). */
export async function syncIntant({ client, supabase, dbCall, cities, categories, log = console, now = () => new Date().toISOString(), pauseMs = 100, sleep = (ms) => new Promise(r => setTimeout(r, ms)) }) {
  const prices = await client.getPrices();
  const quantities = await client.getQuantities();
  if (!prices.length || !quantities.length) throw new Error('Intant вернул пустой список: ничего не меняем');
  const { rows, skipped } = buildRows(prices, quantities, { cities, categories, now: now() });

  // что уже лежит в базе от Intant
  const snapshot = new Map();
  for (let from = 0, prevFirst = null; from < 200000; ) {
    const data = await dbCall('чтение товаров Intant', () => supabase.from('products').select('article,name,brand,price,unit,quantity,category_id,category_name,root_category_id,root_category_name')
      .eq('supplier', INTANT_SUPPLIER).eq('source', 'manual').order('article').range(from, from + 999));
    if (!data?.length || data[0].article === prevFirst) break;
    prevFirst = data[0].article; for (const r of data) snapshot.set(r.article, { sig: rowSig(r), active: r.quantity !== '0' }); from += data.length;
  }
  const prevActive = [...snapshot.values()].filter(v => v.active).length;
  if (prevActive >= 20 && rows.length < prevActive * 0.5)      // защита: сбой API не должен «обнулить» каталог
    throw new Error(`Intant: товаров стало меньше половины (было ${prevActive}, стало ${rows.length}). Ничего не меняем, проверьте API и город склада`);

  const changed = rows.filter(r => { const prev = snapshot.get(r.article); return !prev || !prev.active || prev.sig !== rowSig(r); });
  for (let i = 0; i < changed.length; i += 100) {
    await dbCall('запись товаров Intant', () => supabase.from('products').upsert(changed.slice(i, i + 100), { onConflict: 'article' }));
    if (pauseMs) await sleep(pauseMs);
  }
  const seen = new Set(rows.map(r => r.article));
  const stale = [...snapshot].filter(([a, v]) => v.active && !seen.has(a)).map(([a]) => a);
  for (let i = 0; i < stale.length; i += 100)
    await dbCall('скрытие товаров Intant', () => supabase.from('products').update({ quantity: '0' }).in('article', stale.slice(i, i + 100)));
  const stats = { prices: prices.length, quantities: quantities.length, listed: rows.length, written: changed.length, unchanged: rows.length - changed.length, hidden: stale.length, skipped };
  log.log?.(`✅ Intant: в наличии ${stats.listed}, записано ${stats.written}, без изменений ${stats.unchanged}, скрыто ${stats.hidden}`);
  return stats;
}