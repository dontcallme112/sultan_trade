import { AdapterError } from './common.js';

// Официальные источники. НИКАКИХ запросов к ним не выполняется, пока оператор не подтвердил доступ и формат.
// Эндпоинты здесь намеренно не прописаны: они не подтверждены нами по документации оператора.
export function createGoszakupApiAdapter(env = process.env) {
  const hasToken = Boolean(env.GOSZAKUP_API_TOKEN);
  return {
    id: 'goszakup-api', kind: 'api',
    label: { ru: 'Госзакупки (goszakup.gov.kz), официальный API', kk: 'Мемлекеттік сатып алу, ресми API' },
    status: () => hasToken
      ? { state: 'not_implemented', message: 'Токен задан, но формат запросов не подтверждён документацией оператора. Адаптер запросов не выполняет, пока владелец не передаст документацию и не подтвердит доступ.' }
      : { state: 'needs_connection', message: 'Нужен токен доступа от оператора портала (заявка на доступ к API). Переменная GOSZAKUP_API_TOKEN не задана.' },
    async fetch() { throw new AdapterError('Источник не подключён: ' + this.status().message, 'NOT_CONNECTED'); },
  };
}

export function createZakupSkAdapter() {
  return {
    id: 'zakup-sk', kind: 'api',
    label: { ru: 'Самрук-Казына (zakup.sk.kz)', kk: 'Самұрық-Қазына (zakup.sk.kz)' },
    status: () => ({ state: 'needs_connection', message: 'Подтверждённого публичного API с описанием доступа нет. Требуется запрос оператору. Источник отключён.' }),
    async fetch() { throw new AdapterError('Источник не подключён: ' + this.status().message, 'NOT_CONNECTED'); },
  };
}
