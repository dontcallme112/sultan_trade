# Tender Intelligence — этап 2 (MVP), бэкенд

Раздел отслеживания тендеров. Ничего в магазине не меняет: новые таблицы `tender_*`, новый роутер `/api/tenders`, подключён в `server.js` одним блоком.

## Что здесь настоящее, а что нет
| Источник | Статус |
|---|---|
| `portal-file` | **Работает.** Загрузка JSON, сохранённого человеком из публичного API лотов портала (формат `{count,next,previous,facets,results}`). Робот портал не опрашивает: `robots.txt` портала запрещает автоматический доступ. Проверено на реальном файле из 50 лотов (`test/fixtures`). |
| `demo` | Вымышленные лоты для проверки интерфейса. Везде помечены «ДЕМО». |
| `goszakup-api` | **Отключён.** Нужен токен от оператора. Эндпоинты не прописаны, так как не подтверждены документацией оператора. |
| `zakup-sk` | **Отключён.** Подтверждённого публичного API нет. |

Подключение официального API: получить доступ у оператора → прислать документацию → написать адаптер в `adapters/official.js` (интерфейс: `status()`, `fetch()` → массив лотов через `normalizeLot`).

## Запуск
1. Выполнить `migrations/001_tenders.sql` в Supabase SQL Editor (только создаёт новые таблицы, существующие не трогает).
2. Railway → Variables: `TENDERS_ALLOWED_EMAILS=почта1,почта2` (без этого раздел закрыт для всех). Остальное по желанию, см. `.env.example`.
3. После деплоя `/health` покажет `tenders: true`.
4. Тесты: `npm run test:tenders` (23 теста, без внешней сети и без базы).

## API (все маршруты требуют вход по почте из списка либо `x-sync-secret`)
`GET /api/tenders` (фильтры: q, direction, source, method, region, workStatus, minPrice, maxPrice, minScore, deadlineBefore, onlyOpen, onlyFav, sort=score|deadline|price|published, page, limit) · `GET /api/tenders/:id` · `PUT|DELETE /api/tenders/:id/favorite` · `PUT /api/tenders/:id/state` · `GET /api/tenders/dashboard` · `GET /api/tenders/sources` · `GET /api/tenders/sync-log` · `POST /api/tenders/sync/demo` · `POST /api/tenders/import` (тело — JSON файла портала) · `GET|PUT /api/tenders/settings` (веса оценки, после сохранения оценки пересчитываются).

## Оценка соответствия (0–100)
Шесть факторов: направление, сумма, срок, регион, способ закупки, статус. У каждого фактора значение 0..1 или «нет данных». Итог = взвешенное среднее по **известным** факторам; «уверенность» = доля веса, по которой данные были. Если уверенность ниже 60%, оценка помечается «предварительная». Веса и пороги меняются через `/api/tenders/settings`. Коды региона по умолчанию — Алматы (75) и Алматинская область (19): проверьте по КАТО.

## Ограничения MVP
- Фильтрация в памяти сервера (потолок `TENDERS_MAX_ROWS`, по умолчанию 5000 лотов) — чтобы не нагружать Supabase Disk IO. Для десятков тысяч лотов нужен перенос фильтров в SQL.
- Автоматической синхронизации нет: единственный реальный источник загружается вручную.
- Ссылка на лот на портале не хранится: формат ссылки нами не подтверждён.

## Совместимость с frontend ветки main

Railway использует корневой backend ветки master. Его доступ проверяется по `TENDERS_ALLOWED_EMAILS` (через подтверждённую Supabase-сессию). Запись в `ti_members` другого backend из `main/backend` сама по себе этот сервер не открывает. Пустой список почт закрывает раздел для всех.

Добавлены защищённые алиасы `/api/tenders/connection`, `/sync-runs`, `POST /sync` и `PATCH /:id`, а также дополнительные поля ответа списка и карточки, которые ожидает React из main. Существующие маршруты и поля master сохранены. Рабочие статусы master остаются общими для команды, избранное — личным. `analysis` интерфейса преобразуется в `review` backend. Рейтинг и полнота берутся из реального расчёта master. История изменений в этом хранилище отсутствует: возвращается явный `history_available:false`, история не выдумывается.

Backend требует свою миграцию `tenders/migrations/001_tenders.sql` с таблицами `tender_*`, а не только миграцию `ti_*` ветки main. Production БД в рамках исправления не изменялась; наличие таблиц нужно подтвердить при проверке действующего сервера после открытия доступа.

Проверено: 24/24 тестов `npm run test:tenders`, включая совместимость контрактов и изоляцию доступа. Реальный локальный HTTP-сценарий Chromium: React main → этот Express router → memory store; каталог, поиск, карточка, избранное, статус analysis и сохранение после перезагрузки. Подменена только авторизация, данные API в браузерном сценарии не подменялись.

## Рабочие инструменты тендера

### Импорт выгрузки

Frontend main предоставляет загрузку JSON до 8 МБ. `POST /api/tenders/import/preview` принимает ту же структуру, что импорт (`results` или массив строк с `lot_number`, `name_ru`/`description_ru`), проверяет суммы/даты, удаляет дубликаты ID внутри файла и показывает первые 5 принятых записей. Preview не пишет ни лоты, ни журнал. `POST /api/tenders/import` запускает сохранение; ответ включает skipped и duplicates. Поиск портала автоматически не выполняется. Ссылка первоисточника сохраняется только из самого файла и только для HTTPS-доменов официальных порталов; URL по номеру не придумывается. Загрузка файла не доказывает подлинность его содержимого.

### Технические задания

Требуется Node.js 24.x (совпадает с текущим Railway runtime); версии парсеров закреплены в package.json и package-lock.json.

`POST /api/tenders/:id/documents/extract` принимает `{name,base64}`: PDF с текстом, DOCX, XLSX или UTF-8 TXT до 5 МБ. Обработка изолирована worker_threads: одна задача на процесс, таймаут 30 секунд, лимит V8 worker 256 МБ (native-память идёт сверх него), PDF до 200 страниц, Office до 25 МБ распакованных данных / 2000 ZIP entries, XLSX до 50 000 ячеек, текст до 300 000 символов. Пароль/шифрование, повреждённые архивы и неподдерживаемые форматы дают ошибку. Если текста нет, возвращается OCR_REQUIRED: скан не выдаётся за прочитанный документ.

Результат: реальный текст, SHA-256 оригинала и предварительные фразы требований со ссылками на строки. Это детерминированный поиск по правилам, mode=rules_draft. AI-провайдер опционален и вызывается только после серверной настройки и согласия; без ключа запросов к AI нет. OCR не подключён. UI позволяет вручную сравнить каждый параметр с предложенной моделью и указать источник. Отметка matches без значения параметра и HTTPS-ссылки не экспортируется. Проверка скачивается в JSON; извлечённый текст и требования сохраняются в личном документном workspace, ручные отметки — по кнопке сохранения. Оригинал файла в БД не сохраняется. Это не автоматическое заключение о полном соответствии оборудования.

### Предложения и финансы

`GET/PUT /api/tenders/:id/workspace` — личные предложения и расчёт пользователя. Используются существующие `tender_settings` с ключом `workspace:<user_id>:<lot_id>`; клиентских grants нет, серверный gate проверяет доступ сотрудника. Новые таблицы не нужны. При последующей ERP-интеграции эти записи можно вынести в нормализованные таблицы. Сохраняются до 30 ручных предложений и последние 20 отметок сохранения; полная история предыдущих значений не ведётся. Сохранение только предложений не стирает расчёт, неверные входные данные не заменяют предыдущий сохранённый результат. Одновременные сохранения одного пользователя: последнее успешно записанное значение побеждает.

Предложения включают точную модель, источник HTTPS, валюту KZT/CNY/USD/EUR, дату цены, количество, явный курс и дату курса. Автоматической верификации цен/наличия нет. Frontend может выбрать товар из существующего публичного каталога Stockera через `/api/search`: цена маркируется как цена продажи магазина, не закупочная цена. `VITE_STOREFRONT_URL` может задать канонический HTTPS-адрес магазина; по умолчанию https://sultan-trade.vercel.app .

`POST /api/tenders/finance/calculate` — расчёт без сохранения. Ставки НДС/КПН и период обязательны, законодательные ставки не подставляются. Все суммы расходов вводятся gross. НДС из закупок исключается из себестоимости только у плательщика НДС при отмеченном праве на зачёт. Исходящий и входной НДС, их баланс, прибыль и КПН показаны отдельно. Валовая прибыль вычитает оборудование, доставку и таможню; прогноз до КПН вычитает все статьи. Резерв учитывается в управленческих расходах, но добавляется обратно для расчёта налогооблагаемой прибыли. Дополнительная налоговая корректировка вводится сверх резерва. КПН = max(0, прибыль до КПН + резерв + корректировка) × ставка. Убытки других сделок/режимы налогообложения не моделируются. Отрицательный VAT balance не означает автоматический возврат денег.

Минимальная цена выводится для заданной целевой чистой прибыли с учётом КПН и НДС, округляется вверх до тиына. При цели N, корректировке A и ставке c: прибыль до КПН `(N+c*A)/(1-c)` при положительной налоговой базе. Нулевые расходы — не подтверждение полноты данных: пользователь отдельно подтверждает расходы и право на зачёт, иначе результат requires_review.

### Проверки нового блока

35/35 backend тестов: реальное извлечение PDF/DOCX/XLSX/TXT, ZIP/размер/формат ошибки, worker endpoint, приватность рабочих данных, сохранение предыдущего расчёта при ошибке, preview без записей, импорт >200 КБ, дедупликация, раздельный НДС/КПН, убыточные сделки, период ставок, обратная проверка минимальной цены, валюта/источники предложений. Production npm audit: 0 замечаний; для транзитивной uuid в ExcelJS закреплена исправленная версия 11.1.1. Новые версии пакетов закреплены точно, package-lock.json коммитится.

Chromium: React main → реальный Express master → memory store: preview, импорт, карточка, извлечение текста и скачивание ручной таблицы, выбор из тестового каталога Stockera, сохранение предложений, расчёт 1160 gross / 880 net costs / 86 net profit, сохранение и перезагрузка. Auth и ответ каталога Stockera — тестовые; остальные ответы API не подменялись. Ширина 390 px без переполнения, необработанных JS ошибок нет. Production БД в этой проверке не использовалась; реальные документы и тестовые закупки в неё не загружались.

### Supplier comparison and import costs

Protected routes: `GET /api/tenders/supplier-sources`, `GET /api/tenders/suppliers/search?q=...`, `POST /api/tenders/suppliers/compare`, `POST /api/tenders/rating/calculate`. Search reads the existing synchronized products catalogue (20 results); it does not scrape suppliers or create orders. Source, original USD/KZT currency and catalogue update date remain visible. Catalogue prices remain references rather than verified purchase quotations. A sentinel price <=1 cannot be used as a real quote.

A comparison accepts at most 30 manually sourced offers and 30 requirements. Model identifiers preserve decimal points; separators/case are normalized. Parameter comparisons require a value, evidence, identical units, and an eq/min/max rule. No unit conversion or claim of full compliance is inferred. Sources 1688 and other Kazakhstan suppliers support manual quotations with source URLs and dates; no authenticated 1688 API is implemented. Pinduoduo is explicitly disconnected until a permitted integration is verified. No provider keys are sent to clients.

Shipping can be a known KZT amount or shipment weight × KZT/kg + a fixed fee. Unknown shipping/customs produce an unknown total, never a zero estimate. Purchases round upward to the declared pack multiple. Import estimate: customs value = converted goods + freight to border + declared valuation adjustment; duty = value × configured rate; import VAT = (value + duty + configured VAT-base additions) × configured rate. Border freight is a subset of total shipping and is never added twice to cash cost. Broker fees and VAT-base additions are explicit. Rates require a documented basis and inclusive effective period. This is an ad valorem estimate, not an automatic tariff-classification or legal determination; specific/combined duties, exemptions and detailed customs valuation require broker confirmation.

Comparison cash outlay includes import VAT. Transferring into finance puts duty/fees in customs costs and import VAT in its own field, initially without a credit. The company must confirm VAT entitlement and domestic input VAT separately. Import VAT credit changes economic cost, not the initial cash outlay. Do not include the same import VAT again in customs/other costs. Existing financial calculations remain compatible when no import VAT is supplied.

Supplier analyses and extended ratings are saved in each employee's existing private workspace setting; other fields/offers/finance survive partial saves and the existing bounded audit is retained. No production schema changes are required. The nine-factor rating uses configurable weights and only evidenced manual scores. It returns null without known factors and shows weighted coverage separately; this is not an LLM-generated assessment. Historical or incomplete lots are never made eligible by a score alone.

Validation: 44 tender tests; browser fixture covers CNY, packs, weight shipping, import costs, parameter failure, finance transfer/import VAT credit, rating coverage, save/reload and mobile layout. Fixtures never write production data or call external supplier APIs. Deploy backend before frontend; old backend correctly reports unavailable endpoints until upgraded. Production deployment requires owner confirmation.

### Persistent document review → supplier requirements

`GET /api/tenders/:id/documents` returns the employee's latest saved document/review and metadata for existing specifications already attached to the lot. GET never copies data. `POST /:id/documents/use-imported` explicitly copies a selected existing specification into the employee's document workspace. Upload extraction now saves server-produced text, requirements, original SHA-256 and provenance automatically; the response retains its legacy top-level extraction fields for compatibility. Original file bytes are not stored. The UI discloses text persistence before upload.

Document settings use `document:<user>:<lot>` in the existing server-only `tender_settings`. One current document/review is retained per employee/lot, capped at 1,000,000 serialized characters, with a bounded metadata audit. Replacing requirements clears incompatible manual marks; export a review before AI re-analysis or file replacement. This is not a full version archive. No new database schema, RLS policy or public grant is introduced.

`PUT /:id/documents/review` validates each row, source URL and manual compliance status. Exact source quotes are verified against numbered extracted text. Mutations require both the original hash and a server-generated revision, so reprocessing the same file also invalidates stale tabs. Per-document mutations serialize within the process. This is designed for the current single replica; use database compare-and-swap before enabling multiple replicas.

`POST /:id/documents/requirements` copies selected citations into private supplier-comparison requirements without replacing existing requirements, offers, finance or ratings. The employee specifies the parameter name, operator, value and unit and must review their interpretation. Duplicate parameter names reject rather than overwrite. A citation proves where text came from, not semantic equivalence or product compliance.

Optional OpenAI analysis uses server-only `OPENAI_API_KEY` and `OPENAI_MODEL` (a Responses API model supporting strict JSON schema). Missing configuration leaves extraction, persistence, manual review and parameter transfer working. The explicit consent checkbox sends only saved server text, never a browser-supplied replacement or original file, to `https://api.openai.com/v1/responses` using `store:false`. Account/provider data terms still apply; `store:false` is not a zero-retention guarantee. Limits: 60,000 characters, 6,000 output tokens, 45-second timeout, two active requests per process, one per employee, five attempts/hour per employee. Failed requests count; no automatic retries. Quotas reset on restart. Refusals, incomplete answers and invalid citations preserve the prior saved review. AI input is untrusted document data; no external tools, supplier actions or embedded document commands execute.

Validation: 56 tender tests, including real extraction, private persistence, citations, invalid-save preservation, same-file revision conflicts, concurrent stale writes, safe transfer, and a mocked consented AI HTTP route that ignores forged browser text. A local browser fixture passed real imported PDF → private copy → text upload → manual review save/reload → transfer → comparison reload and mobile layout. External AI was not called; no production data was changed.

### Compact management report

`GET /api/tenders/:id/report.xlsx` returns exactly one sheet and eight columns matching the owner's template: row number; name/characteristics; unit; quantity; portal unit price; portal amount; portal amount +20%; net profit. No other sheets, prose, footnotes or totals are added. The JSON endpoint retains detailed saved data for integrations/debugging.

The proposed amount is rounded `portal amount × 1.2`. This is the requested arithmetic scenario, not a replacement for tax calculation or a verification that the portal permits that bid. Net profit is recomputed from saved financial inputs with the proposed amount as revenue, and is shown only when the employee has confirmed all costs. Missing budget, quantity, units or confirmed finance remain an em dash. Portal unit price is derived from amount/quantity only for a non-grouped lot; grouped/multi-item lots do not get a fabricated average unit price. Known source characteristics are included without the long internal analysis text.

Access remains employee-private and read-only, with no-store headers and one active XLSX export per process. No schema migration, new dependency, external API or production data change is required. Untrusted text is written as literal string cells, not formulas, hyperlinks or macros.

Validation: 63 tender tests. Tests parse the real workbook, verify exactly one sheet/eight headers and literal formula-looking text, and check 1,160 portal total → 1,392 proposed amount → 246 net profit under the explicit fixture tax/cost inputs. Missing data, grouped lots and unconfirmed costs stay unknown. A compiled-browser fixture verifies Excel/JSON downloads, excludes unsaved edits, and checks mobile/no page errors.
