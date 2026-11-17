import http from 'node:http';
import express from 'express';
import { createMemoryStore } from '../store.js';
import { createTenderService } from '../service.js';
import { createAdapters } from '../adapters/index.js';
import { createTendersRouter } from '../router.js';

export const NOW = Date.parse('2026-09-30T00:00:00Z');

export function makeApp({ allowed = ['boss@example.com'], secret = 'S3CRET', store = createMemoryStore(), env = {} } = {}) {
  const service = createTenderService({ store, adapters: createAdapters({ env, now: () => NOW }), now: () => NOW });
  const app = express();
  const jsonSmall = express.json({ limit: '200kb' });
  app.use((req, res, next) => ((req.path === '/api/tenders/import' || req.path === '/api/tenders/import/preview' || /^\/api\/tenders\/[^/]+\/documents\/extract$/.test(req.path)) ? next() : jsonSmall(req, res, next)));
  // тестовая авторизация: токен "token:<id>:<email>"
  const requireAuth = (req, res, next) => {
    const m = /^Bearer token:([^:]+):(.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: m[1], email: m[2] }; next();
  };
  const rateLimit = () => (req, res, next) => next();
  app.use(createTendersRouter({ service, requireAuth, rateLimit, syncSecret: secret, allowedEmails: allowed }));
  return { app, service, store };
}

export async function listen(app) {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, token, secret, raw } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (secret) headers['x-sync-secret'] = secret;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)) });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  return { call, close: () => new Promise(r => server.close(r)) };
}
