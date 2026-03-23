import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../../api/client';
import './Categorysidebar.css';

// Группы на основе ТОЧНЫХ parent ID из al-style API
// Каждая группа содержит ID родительских категорий верхнего уровня
// Все дочерние категории (level 2,3,4...) попадут в группу через parent
const CATEGORY_GROUPS = [
  {
    id: 'phones',
    name: 'Телефоны и планшеты',
    icon: '📱',
    // Мобильные телефоны и аксессуары (3633), Планшеты (21396), Смарт часы и браслеты (21360)
    parentIds: [3633, 21396, 21360],
  },
  {
    id: 'computers',
    name: 'Компьютеры и ноутбуки',
    icon: '💻',
    // Компьютеры и комплектующие (5751)
    parentIds: [5751],
  },
  {
    id: 'audio',
    name: 'Аудио и акустика',
    icon: '🎧',
    // Наушники и микрофоны (3648), Акустические системы (3466)
    parentIds: [3648, 3466],
  },
  {
    id: 'tv_media',
    name: 'ТВ и медиа',
    icon: '📺',
    // Телевизоры и аксессуары (3767), Мультимедиа устройства (3645), Коммерческая визуализация (21497), Демонстрационное оборудование (3506)
    parentIds: [3767, 3645, 21497, 3506],
  },
  {
    id: 'photo_video',
    name: 'Фото и видео',
    icon: '📷',
    // Фото и Видео техника (5638), Летательные аппараты (3526)
    parentIds: [5638, 3526],
  },
  {
    id: 'gaming',
    name: 'Игры и консоли',
    icon: '🎮',
    // Игровые кресла (3510), Игровые столы (3514), Игровые устройства (21174), Симуляторы (21815)
    // Игровые мыши/клавиатуры входят в Компьютеры через 5751
    parentIds: [3510, 3514, 21174, 21815],
  },
  {
    id: 'network',
    name: 'Сеть и серверы',
    icon: '🌐',
    // Сетевое и серверное оборудование (21517), Кабельные системы (21516)
    parentIds: [21517, 21516],
  },
  {
    id: 'power',
    name: 'Электропитание и ИБП',
    icon: '🔋',
    // Системы автономного электроснабжения (21519), Элементы питания (3416)
    parentIds: [21519, 3416],
  },
  {
    id: 'office',
    name: 'Офисная техника',
    icon: '🖨️',
    // Офисная техника (3686), Картриджи и комплектующие (3557), Оборудование для торговли (5685)
    parentIds: [3686, 3557, 5685],
  },
  {
    id: 'smart_home',
    name: 'Умный дом',
    icon: '🏠',
    // Дом и офис (3503)
    parentIds: [3503],
  },
  {
    id: 'appliances',
    name: 'Бытовая техника',
    icon: '🍳',
    // Бытовая техника (3505), Бытовая химия (5747), Освещение (3670), Садовая техника (21481)
    parentIds: [3505, 5747, 3670, 21481],
  },
  {
    id: 'cables',
    name: 'Кабели и аксессуары',
    icon: '🔌',
    // Кабели (3547), Электротехническое оборудование (3803)
    parentIds: [3547, 3803],
  },
  {
    id: 'storage',
    name: 'Носители информации',
    icon: '💾',
    // Носители информации (3655)
    parentIds: [3655],
  },
  {
    id: 'bags',
    name: 'Сумки и аксессуары',
    icon: '🎒',
    // Рюкзаки, чемоданы, сумки (5693), Аксессуары для автомобилей (3426)
    parentIds: [5693, 3426],
  },
  {
    id: 'outdoor',
    name: 'Спорт и отдых',
    icon: '🏕️',
    // Бассейны и отдых (3473), Отдых и туризм (3678), Игрушки (3516)
    parentIds: [3473, 3678, 3516],
  },
  {
    id: 'tools',
    name: 'Инструменты',
    icon: '🔧',
    // Инструменты (5606), Электротранспорт (3878), Канцелярские товары (3508)
    parentIds: [5606, 3878, 3508],
  },
];

export default function CategorySidebar({ onCategoryChange, activeCategory }) {
  const [groupedCategories, setGroupedCategories] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/categories`);
      let data = await response.json();

      if (!Array.isArray(data)) {
        if (data?.data && Array.isArray(data.data)) data = data.data;
        else if (data && typeof data === 'object') data = Object.values(data);
        else data = [];
      }

      // Строим карту: id -> категория
      const catMap = {};
      data.forEach(cat => { catMap[cat.id] = cat; });

      // Для каждой группы находим все категории у которых есть товары
      // используя Nested Sets: категория принадлежит группе если её left/right
      // находится внутри диапазона left/right родительской категории
      const grouped = {};

      CATEGORY_GROUPS.forEach(group => {
        const categoryIds = [];
        let totalCount = 0;

        // Получаем диапазоны left/right для каждого родителя группы
        const parentRanges = group.parentIds
          .map(pid => catMap[pid])
          .filter(Boolean)
          .map(p => ({ left: p.left, right: p.right }));

        // Находим все листовые категории (с товарами) внутри этих диапазонов
        data.forEach(cat => {
          if (cat.elements <= 0) return;
          const inGroup = parentRanges.some(
            range => cat.left >= range.left && cat.right <= range.right
          );
          if (inGroup) {
            categoryIds.push(cat.id.toString());
            totalCount += cat.elements;
          }
        });

        if (totalCount > 0) {
          grouped[group.id] = { count: totalCount, categoryIds };
        }
      });

      // Проверяем что ничего не пропустили
      const allMappedIds = new Set(
        Object.values(grouped).flatMap(g => g.categoryIds)
      );
      const unmapped = data.filter(
        cat => cat.elements > 0 && !allMappedIds.has(cat.id.toString())
      );
      if (unmapped.length > 0) {
        console.warn('⚠️ Не распределены:', unmapped.map(c => `${c.name} (${c.id})`));
      }

      console.log('✅ Категории:', Object.fromEntries(
        Object.entries(grouped).map(([k, v]) => [k, `${v.count} товаров`])
      ));

      setGroupedCategories(grouped);
    } catch (error) {
      console.error('❌ Ошибка загрузки категорий:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGroupClick = (groupId) => {
    if (activeCategory === groupId) {
      onCategoryChange(null, null);
    } else {
      const ids = groupedCategories[groupId]?.categoryIds || [];
      onCategoryChange(groupId, ids);
    }
  };

  if (loading) {
    return (
      <div className="category-sidebar">
        <div className="sidebar-header"><h3>Категории</h3></div>
        <div className="sidebar-loading">
          <div className="loader-small"></div>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  const visibleGroups = CATEGORY_GROUPS.filter(g => groupedCategories[g.id]);

  return (
    <div className="category-sidebar">
      <div className="sidebar-header">
        <h3>Категории</h3>
        {activeCategory && (
          <button className="reset-btn" onClick={() => onCategoryChange(null, null)}>
            Сбросить
          </button>
        )}
      </div>

      <div className="categories-list">
        <button
          className={`category-item ${!activeCategory ? 'active' : ''}`}
          onClick={() => onCategoryChange(null, null)}
        >
          <span className="category-icon">📦</span>
          <div className="category-info">
            <span className="category-name">Все товары</span>
          </div>
        </button>

        {visibleGroups.map(group => (
          <button
            key={group.id}
            className={`category-item ${activeCategory === group.id ? 'active' : ''}`}
            onClick={() => handleGroupClick(group.id)}
          >
            <span className="category-icon">{group.icon}</span>
            <div className="category-info">
              <span className="category-name">{group.name}</span>
              <span className="category-count">
                {groupedCategories[group.id].count.toLocaleString('ru-RU')} товаров
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}