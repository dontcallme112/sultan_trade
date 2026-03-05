import axios from 'axios';

// Backend API configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

// Проверяем режим работы
export const getMode = () => {
  return USE_BACKEND ? 'backend' : 'demo';
};

// Создаем instance axios для backend
const apiClient = axios.create({
  baseURL: USE_BACKEND ? BACKEND_URL : '',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Обработка ошибок
    if (error.response) {
      console.error('API Error:', error.response.data);
      
      if (error.response.status === 503) {
        console.error('Backend недоступен, переключаюсь на DEMO режим');
      }
    } else if (error.request) {
      console.error('Network Error:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Лог режима работы при старте
if (USE_BACKEND) {
  console.info('🚀 BACKEND MODE: Подключение к backend серверу');
  console.info(`📡 Backend URL: ${BACKEND_URL}`);
} else {
  console.info('🎭 DEMO MODE: Приложение работает с mock данными');
  console.info('📝 Чтобы использовать backend:');
  console.info('   1. Запустите backend сервер (см. backend/README.md)');
  console.info('   2. Добавьте в .env: VITE_USE_BACKEND=true');
  console.info('   3. Перезапустите приложение');
}

export default apiClient;