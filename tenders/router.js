import express from 'express';
import { LOT_STATUSES, LOT_STATUS_LABELS } from './service.js';
import { DIRECTIONS } from './directions.js';

// Подключение: app.use(createTendersRouter({...})). Все маршруты — под /api/tenders.
// Доступ: вошедший пользователь, чья почта есть в TENDERS_ALLOWED_EMAILS, либо заголовок x-sync-secret (для администрирования).
// Если список пустой и секрета нет — раздел закрыт для всех (безопасное значение по умолчанию).
export function createTendersRouter({ service, requireAuth, rateLimit, syncSecret, allowedEmails = [] }) {
  const r = express.Router();
  const allow = new Set(allowedEmails.map(e => e.trim().toLowerCase()).filter(Boolean));
  const isSecret = req => Boolean(syncSecret) && req.headers['x-sync-secret'] === syncSecret;

  const gate = (req, res, next) => {
    if (isSecret(req)) { req.tenderAdmin = true; req.user = req.user || { id: null }; return next(); }
    requireAuth(req, res, () => {
      const email = String(req.user?.email || '').toLowerCase();
      if (!allow.size || !allow.has(email)) return res.status(403).json({ error: 'Раздел тендеров недоступен для этого аккаунта', code: 'TENDERS_FORBIDDEN' });
      next();
    });
  };
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      const status = e.status || (e.code === 'NOT_CONNECTED' ? 409 : e.code === 'BAD_FORMAT' ? 400 : 500);
      if (status >= 500) console.error('❌ Tenders:', e.message);
      res.status(status).json({ error: e.status || e.code ? e.message : 'Внутренняя ошибка раздела тендеров', code: e.code });
    }
  };
  const rl = rateLimit({ windowMs: 60000, max: 120 });
  const big = express.json({ limit: '10mb' });
  const uid = req => req.user?.id || null;

  r.use('/api/tenders', rl);
  // ВАЖНО: глобальный парсер на сервере ограничен 200kb. Для импорта файла используем отдельный лимит (см. server.js).
  r.get('/api/tenders/access', gate, wrap(async (req, res) => res.json({ allowed: true, admin: !!req.tenderAdmin })));
  r.get('/api/tenders/meta', gate, wrap(async (req, res) => res.json({
    directions: DIRECTIONS.map(d => ({ id: d.id, ru: d.ru, kk: d.kk })),
    statuses: LOT_STATUSES.map(s => ({ id: s, ru: LOT_STATUS_LABELS.ru[s], kk: LOT_STATUS_LABELS.kk[s] })),
  })));
  r.get('/api/tenders/dashboard', gate, wrap(async (req, res) => res.json(await service.dashboard(uid(req)))));
  r.get('/api/tenders/sources', gate, wrap(async (req, res) => res.json({ sources: await service.sources() })));
  r.get('/api/tenders/sync-log', gate, wrap(async (req, res) => res.json({ log: (await service.sources()).map(s => ({ source: s.id, last_sync_at: s.last_sync_at, last_success_at: s.last_success_at, last_error: s.last_error })) })));
  r.get('/api/tenders/settings', gate, wrap(async (req, res) => res.json(await service.getScoringConfig())));
  r.put('/api/tenders/settings', gate, express.json({ limit: '50kb' }), wrap(async (req, res) => {
    const cfg = await service.saveScoring(req.body); res.json({ config: cfg, ...(await service.rescore()) });
  }));
  r.post('/api/tenders/sync/:source', gate, wrap(async (req, res) => {
    if (req.params.source === 'portal-file') return res.status(400).json({ error: 'Для этого источника используйте POST /api/tenders/import' });
    res.json(await service.sync(req.params.source));
  }));
  r.post('/api/tenders/import', gate, big, wrap(async (req, res) => res.json(await service.sync('portal-file', req.body))));
  r.get('/api/tenders', gate, wrap(async (req, res) => res.json(await service.list(uid(req), req.query))));
  r.get('/api/tenders/:id', gate, wrap(async (req, res) => {
    const l = await service.get(uid(req), req.params.id);
    return l ? res.json(l) : res.status(404).json({ error: 'Лот не найден' });
  }));
  r.put('/api/tenders/:id/favorite', gate, wrap(async (req, res) => {
    if (!uid(req)) return res.status(400).json({ error: 'Избранное доступно только вошедшему пользователю' });
    res.json(await service.setFavorite(uid(req), req.params.id, true));
  }));
  r.delete('/api/tenders/:id/favorite', gate, wrap(async (req, res) => {
    if (!uid(req)) return res.status(400).json({ error: 'Избранное доступно только вошедшему пользователю' });
    res.json(await service.setFavorite(uid(req), req.params.id, false));
  }));
  r.put('/api/tenders/:id/state', gate, express.json({ limit: '20kb' }), wrap(async (req, res) => res.json(await service.setWorkState(uid(req), req.params.id, req.body || {}))));
  return r;
}
