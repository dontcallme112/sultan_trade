import { createDemoAdapter } from './demo.js';
import { createPortalFileAdapter } from './portalFile.js';
import { createGoszakupApiAdapter, createZakupSkAdapter } from './official.js';

export function createAdapters(opts = {}) {
  const list = [
    createPortalFileAdapter(),
    createGoszakupApiAdapter(opts.env),
    createZakupSkAdapter(),
    createDemoAdapter(opts),
  ];
  return new Map(list.map(a => [a.id, a]));
}
