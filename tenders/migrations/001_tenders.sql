-- Tender Intelligence, этап 2 (MVP). Выполнять вручную в Supabase SQL Editor.
-- Только новые таблицы с префиксом tender_. Существующие таблицы магазина не затрагиваются.
-- Скрипт идемпотентный: повторный запуск безопасен. Данные не удаляет.
-- RLS включён БЕЗ политик: напрямую с фронта таблицы недоступны, бэкенд ходит через service role.

create table if not exists public.tender_lots (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,                 -- demo | portal-file | goszakup-api | zakup-sk
  external_id    text not null,                 -- номер лота в источнике
  number         text,                          -- номер лота/объявления для показа
  title          text not null default '',
  description    text,
  customer_name  text,
  customer_bin   text,
  region_code    text,                          -- КАТО, если источник отдаёт
  region_name    text,
  method         text,                          -- способ закупки
  status_raw     text,                          -- статус как в источнике
  total_price    numeric,
  quantity       numeric,
  currency       text default 'KZT',
  published_at   timestamptz,
  deadline_at    timestamptz,
  url            text,                          -- только если источник дал ссылку
  directions     text[] not null default '{}',  -- направления компании
  extra          jsonb not null default '{}'::jsonb,
  sig            text,                          -- отпечаток: пишем строку только при изменении
  score          integer,
  score_confidence integer,
  score_detail   jsonb,
  is_demo        boolean not null default false,
  first_seen_at  timestamptz not null default now(),
  synced_at      timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists tender_lots_deadline_idx on public.tender_lots (deadline_at desc);
create index if not exists tender_lots_score_idx    on public.tender_lots (score desc nulls last);

create table if not exists public.tender_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  lot_id     uuid not null references public.tender_lots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lot_id)
);

-- Рабочий статус лота (общий для команды)
create table if not exists public.tender_lot_state (
  lot_id     uuid primary key references public.tender_lots(id) on delete cascade,
  status     text not null default 'new',
  note       text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Журнал синхронизаций
create table if not exists public.tender_sync_log (
  id          bigserial primary key,
  source      text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean not null default false,
  fetched     integer default 0,
  inserted    integer default 0,
  updated     integer default 0,
  unchanged   integer default 0,
  error       text
);
create index if not exists tender_sync_log_idx on public.tender_sync_log (source, started_at desc);

-- Настройки оценки соответствия (один ряд)
create table if not exists public.tender_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tender_lots       enable row level security;
alter table public.tender_favorites  enable row level security;
alter table public.tender_lot_state  enable row level security;
alter table public.tender_sync_log   enable row level security;
alter table public.tender_settings   enable row level security;
