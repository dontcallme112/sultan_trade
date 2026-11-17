# Sultan Trade AI — Tender Intelligence MVP

## Что работает

В существующий магазин добавлены `/tenders` и `/tenders/:id`, ссылка в меню. Каталог, поиск по тексту и заказчику, фильтры по региону, направлению, сумме, сроку, способу, активности, рабочему статусу и избранному; сортировка и постраничная выдача. Карточка содержит базовую оценку, неопределённость и историю. Избранное и рабочий статус принадлежат отдельному пользователю; изменения аудируются. Панель показывает новые, избранные, соответствие ≥80 и сроки ≤7 дней. Журнал содержит успешные и ошибочные попытки, дату последнего успеха.

RU/KZ переключатель переводит основные элементы управления. Сообщения backend, диагностические причины и объяснение рейтинга пока русские. Это частичная локализация, а не полноценный перевод платформы.

Демонстрационный адаптер возвращает четыре явно вымышленные закупки. Повторная синхронизация не создаёт дубликаты, фиктивные изменения и не сдвигает сроки. По истечении фиксированных сроков demo исчезает из фильтра «Только активные»: снимите фильтр.

## Локальный запуск без внешних учётных данных

Node.js 22.12+ (проверено на 24), npm. В корне:

```bash
npm install
npm --prefix backend install
npm --prefix backend run tenders:demo
```

В другом терминале:

```bash
VITE_TENDER_DEMO=true TENDER_API_TARGET=http://127.0.0.1:8081 VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=local-demo npm run dev
```

Откройте `http://localhost:5173/tenders`, нажмите «Загрузить / обновить демоданные». Параметры Supabase в этой команде — явно нерабочие локальные значения, необходимые существующему AuthProvider магазина. Для демо вход не требуется, запросы к локальному Auth могут завершаться ошибкой; реальные аккаунты и оформление заказа требуют настоящего dev Supabase. Продакшен Supabase не нужен для тестового тендерного сценария.

Демосервер слушает только 127.0.0.1, использует одного общего тестового пользователя admin, хранит JSON в `backend/data/tenders-demo.json`. Можно изменить `TENDER_DEMO_FILE` и `TENDER_PORT`. Это однопроцессный локальный режим. Не размещайте его как публичный сервис. В существующем `backend/server.js` этот обход авторизации отсутствует.

## Supabase и существующий backend

1. Создайте отдельный development/staging Supabase проект.
2. Выполните `supabase/migrations/202611170001_tender_intelligence.sql` в нём. Миграция не запускалась на production и не меняет таблицы магазина.
3. Настройте серверные `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, существующий `ALSTYLE_ACCESS_TOKEN`, `ALLOWED_ORIGINS`.
4. Настройте frontend `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL` на staging. Для Vite локально `TENDER_API_TARGET` направляет только тендерные запросы; существующий proxy магазина сохранён.
5. Создайте пользователя через существующий Auth и выдайте доступ в SQL Editor (UUID заменить):

```sql
insert into public.ti_members(user_id,role) values ('UUID-ПОЛЬЗОВАТЕЛЯ','admin');
```

Роли: admin — синхронизация и работа с закупками; analyst — избранное и статусы; viewer — чтение. Все маршруты данных проверяют Supabase access token и серверную таблицу участников. Регистрация покупателя сама по себе доступа не даёт. Service role хранится только на backend. RLS включён на всех новых таблицах; прямой доступ anon/authenticated отозван, RPC разрешены только service_role. Роли не берутся из изменяемых user_metadata. Сервер намеренно не разрешает загрузку demo в рабочую БД.

В staging без официального импорта каталог будет пустым: это ожидаемо. Для оценки UI и всех MVP операций используйте локальный demo.

## Официальные источники — проверка 17.11.2026

- https://ows.goszakup.gov.kz/help/ — описывает выдачу токена через МФ РК и Bearer-авторизацию. Актуальная страница разработчика: https://procurement.gov.kz/ru/developer/ows_v3 ; GraphQL схема https://ows.goszakup.gov.kz/help/v3/schema/ . Страница разработчика также описывает выпуск токена администратором организации. Реальный токен владельца отсутствует, доступ и текущие квоты не проверены. Числовые лимиты запросов не предполагаются. Перед включением нужно подтвердить действующие условия, квоты и отображение статусов/полей на реальных ответах.
- zakup.sk.kz — официальная публичная документация разрешённой интеграции в рамках проверки не подтверждена; адаптер отключён. Не используются недокументированные URL, CAPTCHA, парсинг личного кабинета или сторонние «подборы endpoint».
- `/connection` показывает эти ограничения явно. Попытка синхронизировать отключённый источник возвращает 503 и сохраняется в журнал. Наличие API-токена само по себе пока не включает импорт: реализацию адаптера нужно завершить и проверить после подтверждения доступа. Рабочего официального импорта в этом PR нет.

## API

`GET /api/tenders/access` — проверка доступа сотрудника.
`GET /api/tenders/connection` — состояние подключения, также только для сотрудников.
Остальные требуют Bearer token в основном backend:

- `GET /api/tenders` — search, customer, region, category, min, max, before, method, status, favorite=true, active=true, sort=deadline|amount|rating|newest, page (20 записей).
- `GET /api/tenders/:id` — данные и доступная пользователю история.
- `PATCH /api/tenders/:id` — `{favorite: boolean}` и/или `{workflow: ...}`.
- `GET /api/tenders/sync-runs` — последние 50 запусков и последний успех.
- `POST /api/tenders/sync` — `{source: "demo"|"goszakup"|"samruk"}`, admin.

## Границы этапа

Базовый рейтинг рассчитывает соответствие по известным факторам и показывает полноту данных. Расширенный рейтинг использует настраиваемые веса и введённые основания оценок; это не автоматическое AI-заключение. Извлечение документов, ручная проверка, сравнение предложений и финансовый калькулятор реализованы. OCR, уведомления и планировщик не подключены. Существующая интеграция al-style магазина сохранена; цены поставщиков и прибыль не выдумываются.

Фоновая регулярная синхронизация будет иметь смысл после подключения официального источника; текущий MVP запускает синхронизацию вручную. Для больших объёмов нужно перенести фильтрацию/пагинацию из backend в SQL и ограничить чтение истории на уровне запросов. Сейчас SupabaseStore читает страницы по 1000 строк без молчаливого усечения; это подходит для малого MVP, не для национального архива.

## Проверки

```bash
npm --prefix backend test
npm run build
npx eslint src/pages/tenders/Tenders.jsx backend/tenders/*.js vite.config.js
```

Тесты охватывают HTTP цепочку: синхронизация → каталог → избранное/статус → история → повторное чтение файла; дедупликацию, изоляцию пользователей, роли, фильтры, ошибки и журнал. Проверки Supabase RLS и SQL выполняются отдельно в тестовой БД, не в production. Перед публикацией обязателен staging smoke test реального входа и ролей с настроенным Supabase. Публикация и изменения production требуют отдельного разрешения владельца.

### Результаты проверки этой ветки

- `npm --prefix backend test`: 5/5 успешно, включая применение миграции в PGlite (PostgreSQL WASM), RPC, откат неверного статуса, включённый RLS и запрет таблиц/RPC для anon/authenticated. Это изолированная SQL-проверка, не подтверждение настроек реального Supabase.
- `npm run build`: успешно, 176 модулей. Предупреждение о возрасте Browserslist не блокирует сборку.
- ESLint для новых JS/JSX и vite.config.js: успешно.
- Общий `npm run lint`: 48 существующих замечаний (43 errors, 5 warnings) в старых файлах магазина. Полная очистка старого кода не входила в изменение.
- Headless Chromium: синхронизация demo, открытие карточки, избранное, статус, перезагрузка с сохранением, поиск, переключение KZ, ширина 390px — успешно, без необработанных JS ошибок. Исправлено переполнение поля подписки в существующем footer (min-width), обнаруженное мобильной проверкой.
- `git diff --check`: успешно.

## Видимость только сотрудникам

Пункт меню и маршруты /tenders доступны только вошедшим пользователям, включённым владельцем в ti_members. Для остальных пункт скрыт, прямой переход возвращает на главную; данные и состояние подключения защищены серверной проверкой. Доступ перепроверяется при фокусе окна и каждую минуту. При выходе или смене пользователя интерфейс закрывается немедленно. Регистрация покупателя и user_metadata не дают доступа. Удаление записи из ti_members отзывает API-доступ при следующем запросе. Для явного локального demo добавлен VITE_TENDER_DEMO=true; этот флаг игнорируется production-сборкой. Production не изменялся.

Проверка ограничения доступа: 6/6 backend тестов; целевой ESLint и production build успешны. В Chromium с подменёнными ответами тестовой авторизации проверены гость, покупатель, сотрудник, перезагрузка защищённой страницы и выход сотрудника: пункт меню скрывается, защищённый маршрут закрывается. Реальный Supabase staging по-прежнему требует настройки владельца.

### Ошибки проверки доступа

При прямом переходе вошедшего пользователя на /tenders отказ 403 показывает отсутствие доступа сотрудника, 401 — необходимость повторного входа, ошибки сети/404/5xx — временную недоступность проверки. Можно повторить проверку без перезагрузки. Гости по-прежнему перенаправляются на главную, меню и данные доступны только после положительной серверной проверки. Неожиданный ответ 200 без allowed:true не открывает раздел. Проверено в Chromium с тестовыми ответами: гость, покупатель, сотрудник, выход, 404 и обрыв сети с последующим успешным повтором; сборка и целевой ESLint прошли.

Preview Vercel может быть отдельно защищён Vercel Authentication: вход в магазин и роль ti_members не заменяют вход в Vercel. На проверке 17.11.2026 указанный preview перенаправлял на vercel.com/login. Railway /api/tenders/access уже отвечал 401 на запрос без токена (ранее отвечал 404); preflight разрешал origin preview и публичного sultan-trade.vercel.app. Это не подтверждает права конкретного аккаунта или состояние его сессии.

### Подтверждённая конфигурация Railway

Прямое чтение проекта selfless-nature / service sultan_trade подтвердило: production использует корень ветки master, а не main/backend. В журнале запуска: «TENDERS_ALLOWED_EMAILS не задан — раздел закрыт». Поэтому admin в ti_members не устраняет отказ этого backend. Подготовлена (не применена) переменная с почтой владельца; для применения нужен production deploy.

Исправление совместимости master добавляет ожидаемые интерфейсом маршруты и поля. Сам master использует таблицы tender_* из своей миграции, историю изменений не предоставляет, рабочие статусы общие для команды. UI показывает недоступность истории и фактическую полноту рейтинга; неизвестная сумма отображается прочерком. Проверен локальный сценарий React main → реальный HTTP master backend → memory store, с тестовой авторизацией: каталог, поиск, карточка, избранное, статус и перезагрузка. Это не проверка production Supabase или входа владельца.

## Следующий рабочий блок: импорт, ТЗ, поставщики и прибыль

Интерфейс источников принимает JSON официального портала: выбор файла → серверная проверка без записи → предварительные строки/дубликаты/пропуски → явный импорт. Автоматический поиск без подтверждённого официального доступа не включается. Демо не загружается автоматически в рабочую БД.

Карточка тендера получила извлечение текста PDF/DOCX/XLSX/TXT до 5 МБ и ручную таблицу соответствия. По каждой найденной фразе есть номер строки исходного текста; соответствие требует характеристики предлагаемой модели и HTTPS-подтверждения для экспорта. Результат JSON скачивается локально. Извлечённый текст и требования сохраняются в аккаунте, ручная таблица — по кнопке сохранения; оригинал не хранится. AI опционален и требует серверной настройки с согласием пользователя. Без AI доступен предварительный разбор по правилам; скан без текста возвращает OCR_REQUIRED.

Предложения поставщиков сохраняются отдельно для пользователя: модель, цена/дата, валюта, курс/дата, количество, источник. Есть поиск существующего каталога Stockera; цена магазина явно маркируется как розничная и не выдаётся за закупочную. Формула прибыли разделяет выручку без НДС, себестоимость, валовую/до-КПН/чистую прибыль, КПН, входной/исходящий НДС и минимальную цену. Ставки и даты действия вводятся явно, резерв добавляется обратно для расчёта КПН. Допущения и неподтверждённые исходные данные видны пользователю. Никаких автоматических цен Китая, таможенных тарифов или налоговых ставок не придумано.

Backend этой версии — отдельный PR в master (ветка feat/tender-workbench). Нужна совместная публикация с frontend: новые эндпоинты `/import/preview`, `/finance/calculate`, `/:id/workspace`, `/:id/documents/extract`. Новых SQL-миграций для блока нет: личные рабочие данные хранятся в уже существующем tender_settings под серверным ключом пользователя/лота. Пределы и расчётные допущения — в tenders/README.md ветки backend.

Проверки: frontend build и ESLint новых компонентов; 35 backend тестов; реальный локальный HTTP-сценарий в Chromium, включая импорт файла, извлечение/экспорт, выбор Stockera, расчёт и сохранение/перезагрузку, экран 390 px. Для Auth и поиска Stockera использованы тестовые ответы; финансовые и импортные API не подменялись. getToken в AuthContext стабилизирован, чтобы обновление профиля не запускало повторную загрузку редактора с потерей несохранённых полей.

### Supplier comparison, import and expanded rating

The tender card adds a private supplier comparison with an existing-catalogue search, manual Kazakhstan/1688 offers, dates/currencies/FX dates, pack multiples, explicit parameter/evidence matching, shipping and customs estimates. Pinduoduo stays disconnected; no external supplier API is fabricated. Unknown costs remain unknown. Catalogue references are not certified procurement quotes or stock reservations.

The comparison table can transfer goods, shipping, duty/fees and import VAT separately into the existing finance form. Import VAT credit must be explicitly confirmed; initial cash outlay stays visible. Review all tax rates, periods, valuation bases, shipping and costs before using a result. Specific/combined tariffs and legal treatment need broker/accounting confirmation.

A nine-factor expanded rating uses configurable weights and evidenced manual scores. Unknown criteria are excluded from the score denominator but lower the separately displayed coverage. This does not replace the baseline catalogue ranking or claim that an AI provider is connected. Saved comparison/rating fields are personal and preserved when offers or finance are edited. Backend deployment must precede frontend; production deployment still requires confirmation.

### Saved specification workflow

The document panel loads each employee's current saved text and review. Users may explicitly open an existing specification already attached to the lot, or upload a new PDF/DOCX/XLSX/TXT. The UI states that extracted text/requirements persist in the employee's account; original bytes do not. Manual review statuses and supporting HTTPS sources can be saved or exported. File hash plus server revision protect against stale tabs, including reprocessing the same file.

Selected requirements can be mapped into supplier-comparison parameters with an exact source quote. The employee specifies and reviews operator/value/unit; provenance does not certify the interpretation or model compliance. Existing finance drafts stay open during transfer and requirements are scoped to the current lot.

AI analysis is optional and needs server `OPENAI_API_KEY` and `OPENAI_MODEL`. The UI requires explicit consent to sending saved extracted text to OpenAI. Provider failures keep the previous review. Successful re-analysis may change requirements and clear manual marks; the UI prompts exporting first. No OCR provider, full document-version archive or supplier API is implied. These changes supersede the earlier standalone AI-control PR while preserving supplier/import functionality. Publish backend first after owner confirmation.

### Management report

Each tender card adds an Excel/JSON download panel. Downloads contain saved personal data only; users must save document checks, comparisons, finance and rating first. The workbook has ten sheets covering the lot, requirements/citations, supplier estimates and parameter comparison, delivery/import inputs, manual quotations, financial results, rating coverage, assumptions and bounded audit metadata. Unknowns remain visible; closed lots, stale quotes, missing finance and citations to another document hash are flagged. Original document bytes are excluded.

Authenticated Blob downloads keep tokens in headers, not URLs. Errors returned as JSON blobs are shown in the panel. Server access remains employee-only and private per user; export is read-only and requires no migration or new configuration. Formula-looking text is exported as plain strings. A compiled-browser fixture downloaded both formats, verified ten sheets/profit 86/rating coverage 15%, proved an unsaved bid edit was excluded, and checked mobile layout/no page errors. Optional saved rating weights and comparison fields now hydrate safely instead of crashing the card. Publication still requires owner confirmation.
