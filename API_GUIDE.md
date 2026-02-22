# 📡 API Integration Guide - Al-Style.kz

Полное руководство по интеграции с API al-style.kz

## 🔐 Авторизация

### Получение Access Token

1. Зарегистрируйтесь на [al-style.kz](https://al-style.kz)
2. Войдите в личный кабинет
3. Перейдите в раздел "API"
4. Скопируйте ваш `access-token`

### Настройка проекта

Создайте файл `.env` в корне проекта:

```env
VITE_ALSTYLE_ACCESS_TOKEN=ваш_токен_здесь
```

Access token автоматически добавляется ко всем запросам через interceptor в `src/api/client.js`.

## 📦 Структура API

### Base URLs

- **API товаров и справочников:** `https://api.al-style.kz/api`
- **API корзины:** `https://api.al-style.kz/cart-api`

## 🛍️ Товары (Products)

### Получение списка товаров

```javascript
import { productsAPI } from './api/services/products';

const response = await productsAPI.getProducts({
  category: 3638,      // ID категории (опционально)
  limit: 100,          // Макс 250
  offset: 0,           // Смещение для пагинации
  exclude_missing: true, // Скрыть товары без остатка
  brand: 'guid-бренда', // GUID бренда (опционально)
});

// Ответ:
{
  elements: [...],     // Массив товаров
  pagination: {
    totalCount: 6911,
    totalPages: 70,
    currentPage: 1,
    limit: 100,
    offset: 0
  }
}
```

### Получение товара по артикулу

```javascript
const product = await productsAPI.getProductByArticle(20908);

// Ответ:
{
  article: 20908,
  name: "Колонки Mi Bluetooth Speaker...",
  full_name: "Полное наименование...",
  category: 3472,
  price1: 8434,    // Дилерская цена
  price2: 11490,   // Розничная цена
  quantity: ">50", // Остаток
  isnew: 1,        // Новинка
  images: [...],   // Массив URL изображений
  description: "...",
  brand: { id: "...", name: "..." },
  // ... другие поля
}
```

### Поиск по названию

```javascript
const results = await productsAPI.searchByName('xiaomi');
```

### Получение изображений

```javascript
const images = await productsAPI.getProductImages(20908, true);
// Возвращает массив URL: ["http://img.al-style.kz/...", ...]
```

### Получение категорий

```javascript
import { useCategories } from './hooks/useCategories';

// Получить все категории верхнего уровня
const { categories } = useCategories();

// Получить подкатегории
const { categories } = useCategories(3633); // parentId
```

### Получение брендов

```javascript
import { useBrands } from './hooks/useBrands';

const { brands } = useBrands();

// Ответ:
[
  {
    id: "fde2257a-2ecb-11eb-a360-503eaa0dbd7f",
    name: "70mai",
    count: 11  // Количество товаров
  },
  ...
]
```

### Остатки и цены

```javascript
const data = await productsAPI.getQuantityPrice({
  exclude_missing: true,
  article: '20908,20932', // Несколько артикулов через запятую
});

// Ответ:
{
  "20908": {
    quantity: ">50",
    price1: 8434,
    price2: 11490,
    discountPrice: 10341, // Цена со скидкой
    discount: 10,         // % скидки
    warehouse: "panfilov"
  }
}
```

### Свойства товаров

```javascript
const props = await productsAPI.getProperties({
  article: '20908',
  category: 3472,
});

// Ответ включает детальные характеристики товара
```

## 🛒 Корзина (Cart)

### Добавить товар в корзину

```javascript
import { cartAPI } from './api/services/cart';

// Один товар
await cartAPI.add(20908, 2); // article, quantity

// Несколько товаров
await cartAPI.add([20908, 20932], [2, 1]);
await cartAPI.add('20908,20932', '2,1'); // Альтернатива
```

### Получить состав корзины

```javascript
const cart = await cartAPI.get();

// Ответ:
{
  status: true,
  user: 1,
  data: {
    "270217": {
      article: 45770,
      label: "Планшет Redmi Pad...",
      price: 122000,
      price2: 149990,
      quantity: 2,
      total: 244000,
      balance: ">50",
      url: "https://al-style.kz/...",
      weight: 1.64,
      volume: 0.0024
    }
  }
}
```

### Удалить товар из корзины

```javascript
await cartAPI.remove(20908); // article
```

### Очистить корзину

```javascript
await cartAPI.clear();
```

### Создать заказ

```javascript
await cartAPI.submit({
  shipping_date: '15.02.2026', // Дата отгрузки ДД.ММ.ГГГГ
  attorney_json: {...},         // Из user-data
  delivery_json: {...},         // Из user-data
  comments: 'Комментарий',
  consignment: true,            // Выписать накладную
  without_docs: false,
  bin: '111111111111',          // БИН (опционально)
});

// Ответ:
{
  status: true,
  data: {
    status: "ok",
    id: 312113  // Номер заказа
  }
}
```

## 📋 Заказы (Orders)

### Список заказов

```javascript
import { ordersAPI } from './api/services/orders';

const orders = await ordersAPI.getOrders({
  type: 'index',  // index, current, archive, canceled
  page: 1,
  date_from: '01.01.2026',
  date_to: '13.02.2026',
});
```

### Детали заказа

```javascript
const order = await ordersAPI.getOrder(312113);

// Ответ включает:
{
  id: 312113,
  date: "2026-02-13 12:00:00",
  sum: 214980,
  status: "N",  // Статусы: N, P, SV, OS, OK, F, Un, R, DA
  cart: [...]   // Состав заказа
}
```

### Отменить заказ

```javascript
await cartAPI.cancel(312113);
```

### Операции с заказом

```javascript
// Удалить позицию
await ordersAPI.deleteOrderItem(312113, '20908');

// Изменить количество
await ordersAPI.updateOrderItem(312113, '20908', 5);

// Объединить заказы
await ordersAPI.mergeOrders(100001, 100002);

// Прикрепить файл
const file = document.getElementById('file').files[0];
await ordersAPI.uploadFile(312113, file);
```

## 📍 Справочники

### Склады

```javascript
import { warehousesAPI } from './api/services/reference';

const warehouses = await warehousesAPI.getWarehouses();

// Ответ:
{
  "panfilov": {
    name: "Vender",
    phone: "+7(747)3247192",
    city: "Алматы",
    street: "Панфилова",
    house: "10",
    full_address: "Панфилова, 10",
    lat: 43.27321,
    lng: 76.9425
  }
}
```

### Персональные данные

```javascript
import { userDataAPI } from './api/services/reference';

const userData = await userDataAPI.getUserData();

// Включает:
{
  Доверенности: [...],    // Генеральные доверенности
  Транспортники: [...],   // Способы доставки
  Подчиненные: {...},     // Связанные организации
  bin: "111111111111"     // Основной БИН
}
```

## 🎣 React Hooks

### useProducts

```javascript
import { useProducts } from './hooks/useProducts';

const { products, loading, error, pagination, refetch } = useProducts({
  category: 3638,
  limit: 50,
  offset: 0,
  brand: null,
  exclude_missing: true,
});
```

### useProduct

```javascript
import { useProduct } from './hooks/useProduct';

const { product, loading, error } = useProduct(20908);
```

### useCategories

```javascript
import { useCategories } from './hooks/useCategories';

const { categories, loading, error } = useCategories(3633);
```

### useBrands

```javascript
import { useBrands } from './hooks/useBrands';

const { brands, loading, error } = useBrands();
```

## 🔧 Утилиты

### Форматирование цены

```javascript
import { productUtils } from './api/services/products';

productUtils.formatPrice(11490);  // "11 490 ₸"
productUtils.formatPrice(1);      // "Цена по запросу"
```

### Форматирование остатка

```javascript
productUtils.formatQuantity(">50"); // "Более 50 шт."
productUtils.formatQuantity(5);     // "5 шт."
productUtils.formatQuantity(0);     // "Нет в наличии"
```

### Проверка наличия

```javascript
productUtils.isInStock(">50");  // true
productUtils.isInStock(0);      // false
```

### Маппинг товара

```javascript
// Преобразует товар из формата API в формат приложения
const mapped = productUtils.mapProduct(apiProduct);
```

## ⚠️ Важные замечания

1. **Access Token** - обязателен для всех запросов
2. **Лимиты** - максимум 250 товаров за запрос
3. **Пагинация** - используйте offset для больших списков
4. **Артикулы** - можно передавать через запятую для batch-операций
5. **Цены** - price1 (дилерская), price2 (розничная)
6. **Остатки** - могут быть числом или строкой ">50"

## 🐛 Обработка ошибок

```javascript
try {
  const products = await productsAPI.getProducts({ limit: 50 });
} catch (error) {
  if (error.response?.status === 401) {
    console.error('Неверный access-token');
  } else if (error.response?.status === 403) {
    console.error('Доступ запрещен');
  } else {
    console.error('Ошибка API:', error.message);
  }
}
```

## 📞 Поддержка

- Документация API: https://api.al-style.kz/docs
- Техподдержка: support@al-style.kz
- Личный кабинет: https://al-style.kz

---

**Готово к работе с real-world данными! 🚀**