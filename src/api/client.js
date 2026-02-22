import axios from 'axios';

// API al-style.kz configuration
const API_BASE_URL = 'https://api.al-style.kz/api';
const ACCESS_TOKEN = import.meta.env.VITE_ALSTYLE_ACCESS_TOKEN || '';

// Создаем instance axios с базовой конфигурацией
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - добавляем access-token ко всем запросам
apiClient.interceptors.request.use(
  (config) => {
    // Добавляем access-token как query параметр
    if (!config.params) {
      config.params = {};
    }
    config.params['access-token'] = ACCESS_TOKEN;
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Обработка ошибок
    if (error.response) {
      // Сервер вернул ошибку
      console.error('API Error:', error.response.data);
      
      if (error.response.status === 401) {
        console.error('Unauthorized: проверьте access-token');
      }
      
      if (error.response.status === 403) {
        console.error('Forbidden: доступ запрещен');
      }
    } else if (error.request) {
      // Запрос был отправлен, но ответа нет
      console.error('Network Error:', error.request);
    } else {
      // Ошибка при настройке запроса
      console.error('Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;