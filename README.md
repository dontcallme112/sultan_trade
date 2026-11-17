# Stockera / Sultan Trade AI

Существующий интернет-магазин ТОО «Султан Trade LD»: React + Vite, Express, Supabase, серверная интеграция al-style.kz.

Добавлен MVP Tender Intelligence: `/tenders` — каталог закупок, фильтры, избранное, рабочие статусы, базовая оценка и журнал синхронизации.

- [Запуск и границы тендерного MVP](docs/TENDER-MVP.md)
- [Аудит существующего проекта](docs/AUDIT-2026-11-17.md)
- [Backend магазина](backend/README.md)

## Разработка магазина

Node.js 22.12+:

```bash
npm install
npm --prefix backend install
npm run dev
```

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (публичный anon ключ), `VITE_BACKEND_URL` (production/staging). Локальный Vite proxy магазина по умолчанию направлен на существующий Railway backend; для тендерного demo см. отдельную инструкцию выше.

Backend: `ALSTYLE_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`; остальные настройки в backend/README.md. Секреты поставщиков и AI нельзя хранить в `VITE_*` или коммитить в Git.

```bash
npm run build
npm --prefix backend test
```

Демо-закупки вымышлены. Официальные источники отключены до подтверждения доступа. Миграция новых таблиц подготовлена для отдельной dev/staging базы; production не изменялся. Развёртывание требует подтверждения владельца.
