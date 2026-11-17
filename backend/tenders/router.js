import express from 'express';
import { randomUUID } from 'node:crypto';
import { scoreTender, filterTenders, demoTenders, sources, statuses } from './domain.js';

export function createTenderRouter({ store, authenticate, demo = false }) {
  const router = express.Router();
  let syncing = false;
  router.get('/connection', (_req, res) => res.json({ demo, sources }));
  router.use(authenticate);
  const handle = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const rowsFor = async userId => {
    const [rows, preferences] = await Promise.all([store.all('tenders'), store.all('preferences')]);
    return rows.map(t => ({ ...t.payload, first_seen: t.first_seen, rating: scoreTender(t.payload),
      ...Object.fromEntries(Object.entries(preferences.find(p => p.user_id === userId && p.tender_id === t.id) || { favorite: false, workflow: 'new' }).filter(([k]) => ['favorite', 'workflow'].includes(k))) }));
  };
  router.get('/', handle(async (req, res) => {
    const all = await rowsFor(req.user.id);
    const filtered = filterTenders(all, req.query);
    const page = Number(req.query.page || 1), limit = 20;
    if (!Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: 'Некорректная страница' });
    res.json({ items: filtered.slice((page-1)*limit, page*limit), total: filtered.length, page, pages: Math.ceil(filtered.length/limit),
      summary: { total: all.length, favorites: all.filter(t => t.favorite).length, high: all.filter(t => t.rating.score >= 80).length,
        new: all.filter(t => t.workflow === 'new').length, upcoming: all.filter(t => Date.parse(t.deadline) > Date.now() && Date.parse(t.deadline) < Date.now()+7*86400000).length },
      regions: [...new Set(all.map(t => t.region))], methods: [...new Set(all.map(t => t.method))] });
  }));
  router.get('/sync-runs', handle(async (_req, res) => {
    const runs = (await store.all('runs')).sort((a,b) => b.started_at.localeCompare(a.started_at));
    res.json({ runs: runs.slice(0, 50), last_success: runs.find(r => r.status === 'success')?.finished_at || null });
  }));
  router.post('/sync', handle(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Требуется роль admin' });
    if (syncing) return res.status(409).json({ error: 'Синхронизация уже выполняется' });
    if (!sources.some(s => s.id === req.body?.source)) return res.status(400).json({ error: 'Неизвестный источник' });
    syncing = true;
    const run = { id: randomUUID(), source: req.body.source, started_at: new Date().toISOString(), actor: req.user.id };
    try {
      if (run.source !== 'demo' || !demo) throw Object.assign(new Error('Источник отключён. Официальный доступ не подтверждён; demo доступен только в деморежиме.'), { status: 503 });
      Object.assign(run, { status: 'success', finished_at: new Date().toISOString(), error: null });
      res.json(await store.sync(demoTenders(), run));
    } catch (e) {
      await store.log({ ...run, status: 'error', finished_at: new Date().toISOString(), error: e.status === 503 ? e.message : 'Ошибка хранилища', changed: 0 });
      throw e;
    } finally { syncing = false; }
  }));
  router.get('/:id', handle(async (req, res) => {
    const tender = (await rowsFor(req.user.id)).find(t => t.id === req.params.id);
    if (!tender) return res.status(404).json({ error: 'Закупка не найдена' });
    const history = (await store.all('history')).filter(h => h.tender_id === tender.id && (!h.user_id || h.user_id === req.user.id));
    res.json({ ...tender, history });
  }));
  router.patch('/:id', handle(async (req, res) => {
    if (!['admin', 'analyst'].includes(req.user.role)) return res.status(403).json({ error: 'Только чтение' });
    const patch = req.body;
    if (!patch || !Object.keys(patch).length || Object.keys(patch).some(k => !['favorite','workflow'].includes(k)) ||
      ('favorite' in patch && typeof patch.favorite !== 'boolean') || ('workflow' in patch && !statuses.includes(patch.workflow)))
      return res.status(400).json({ error: 'Некорректный статус или избранное' });
    if (!(await rowsFor(req.user.id)).some(t => t.id === req.params.id)) return res.status(404).json({ error: 'Закупка не найдена' });
    res.json(await store.preference(req.user.id, req.params.id, patch));
  }));
  router.use((error, _req, res, _next) => {
    console.error('Tender API:', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Ошибка тендерного сервиса. Проверьте настройки БД и журнал сервера.' });
  });
  return router;
}
