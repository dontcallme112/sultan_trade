import express from 'express';
import { resolve } from 'node:path';
import { createTenderRouter } from './router.js';
import { DemoStore } from './store.js';

const app = express();
app.use(express.json({ limit: '20kb' }));
// Local-only demo: no credentials, one explicitly shared fictional user.
app.use('/api/tenders', createTenderRouter({
  store: new DemoStore(resolve(process.env.TENDER_DEMO_FILE || 'data/tenders-demo.json')),
  demo: true,
  authenticate: (req, _res, next) => { req.user = { id: 'demo-user', role: 'admin' }; next(); },
}));
app.listen(Number(process.env.TENDER_PORT || 8081), '127.0.0.1', () => console.log('Tender DEMO: http://127.0.0.1:8081; fictional data, shared demo user'));
