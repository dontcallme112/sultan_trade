// sync-products.js
// Запуск: node sync-products.js
// Синхронизирует все товары из al-style.kz → Supabase products таблицу
// + обновляет Redis кеш поиска (search_all_products)

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const ALSTYLE_TOKEN  = process.env.ALSTYLE_ACCESS_TOKEN;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ALSTYLE_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Не заданы переменные окружения!');
  console.error('Нужны: ALSTYLE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

if (redis) console.log('✅ Redis подключён');
else console.log('⚠️  Redis не настроен (UPSTASH_REDIS_REST_URL / TOKEN) — кеш поиска не обновится');

const api = axios.create({
  baseURL: 'https://api.al-style.kz/api',
  timeout: 30000,
});

const LIMIT         = 250;
const BATCH_SIZE    = 100;
const API_DELAY_MS  = 5000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Загрузка одной страницы товаров ─────────────────────────
async function fetchPage(offset, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await api.get('/elements-pagination', {
        params: {
          'access-token':   ALSTYLE_TOKEN,
          exclude_missing:  'true',
          limit:            LIMIT,
          offset,
          additional_fields: 'brand,images,description',
        },
      });
      return response.data;
    } catch (e) {
      const status = e.response?.status;
      console.warn(`⚠️ Попытка ${attempt}/${retries}, offset=${offset}, статус: ${status}`);
      if (attempt < retries) {
        const wait = 10000 * attempt;
        console.log(`   Ждём ${wait / 1000}с...`);
        await sleep(wait);
      } else {
        throw e;
      }
    }
  }
}

// ─── Upsert пачки товаров в Supabase ─────────────────────────
async function upsertBatch(products) {
  const rows = products.map(p => ({
    article:     String(p.article),
    name:        p.name        || '',
    full_name:   p.full_name   || '',
    brand:       p.brand       || '',
    price:       p.price2 || p.price1 || p.price || 0,
    price1:      p.price1 || null,
    price2:      p.price2 || null,
    quantity:    String(p.quantity ?? '0'),
    isnew:       p.isnew || 0,
    image_url:   p.images?.[0] || p.image || null,
    images:      JSON.stringify(p.images || []),
    category_id: p.category_id ? String(p.category_id) : null,
    description: p.description || null,
    raw_data:    JSON.stringify({}),
    synced_at:   new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'article' });

  if (error) {
    console.error('❌ Ошибка upsert:', error.message);
    throw error;
  }
}

// ─── Основная функция ─────────────────────────────────────────
async function syncAll() {
  console.log('\n🚀 Синхронизация товаров al-style → Supabase');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime  = Date.now();
  let offset       = 0;
  let totalCount   = null;
  let synced       = 0;
  let errors       = 0;
  const allCompact = []; // собираем для Redis

  do {
    let data;
    try {
      data = await fetchPage(offset);
    } catch (e) {
      console.error(`❌ Не удалось загрузить offset=${offset}:`, e.message);
      errors++;
      offset += LIMIT;
      continue;
    }

    const elements = data.elements || [];
    if (elements.length === 0) break;

    if (totalCount === null) {
      totalCount = data.pagination?.totalCount || 0;
      console.log(`📦 Всего товаров: ${totalCount}`);
      console.log(`📄 Страниц: ${Math.ceil(totalCount / LIMIT)}\n`);
    }

    // Upsert в Supabase
    for (let i = 0; i < elements.length; i += BATCH_SIZE) {
      const batch = elements.slice(i, i + BATCH_SIZE);
      try {
        await upsertBatch(batch);
        synced += batch.length;
      } catch (e) {
        errors += batch.length;
      }
    }

    // Собираем компактные данные для Redis
    for (const p of elements) {
      allCompact.push({
        article:   p.article,
        name:      p.name      || '',
        full_name: p.full_name || '',
        brand:     p.brand     || '',
        price:     p.price2 || p.price1 || 0,
        isnew:     p.isnew  || 0,
        image:     p.images?.[0] || null,
      });
    }

    const pct     = totalCount ? Math.round((synced / totalCount) * 100) : 0;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ ${synced}/${totalCount} (${pct}%) — ${elapsed}с`);

    offset += LIMIT;

    if (totalCount && offset < totalCount) {
      await sleep(API_DELAY_MS);
    }

  } while (totalCount && offset < totalCount);

  // ── Обновляем Redis кеш поиска ─────────────────────────────
  if (redis && allCompact.length > 0) {
    try {
      await redis.set('search_all_products', allCompact, { ex: 90 * 60 }); // 90 мин TTL
      console.log(`\n💾 Redis обновлён: ${allCompact.length} товаров (TTL 90мин)`);
    } catch (e) {
      console.warn('⚠️ Redis update error:', e.message);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const mins    = Math.floor(elapsed / 60);
  const secs    = elapsed % 60;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Готово за ${mins}м ${secs}с`);
  console.log(`📦 Синхронизировано: ${synced}`);
  if (errors > 0) console.log(`⚠️  Пропущено из-за ошибок: ${errors}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

syncAll().catch(e => {
  console.error('💥 Критическая ошибка:', e.message);
  process.exit(1);
});