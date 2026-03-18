import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../../api/client';
import './Categorysidebar.css';

// Группы категорий: ключ = название группы, value = массив ключевых слов
const CATEGORY_GROUPS = [
  {
    id: 'phones',
    name: 'Телефоны и планшеты',
    icon: '📱',
    keywords: ['телефон', 'смартфон', 'планшет', 'tablet', 'iphone', 'samsung', 'ipad'],
  },
  {
    id: 'computers',
    name: 'Компьютеры и ноутбуки',
    icon: '💻',
    keywords: ['ноутбук', 'laptop', 'компьютер', 'пк', 'моноблок', 'системн'],
  },
  {
    id: 'accessories',
    name: 'Аксессуары',
    icon: '🎧',
    keywords: ['наушник', 'headphone', 'колонк', 'speaker', 'клавиатур', 'keyboard', 'мыш', 'mouse', 'чехол', 'case', 'наклад', 'защит', 'кабел', 'провод', 'зарядн', 'адаптер', 'аудио', 'микрофон'],
  },
  {
    id: 'tv_monitors',
    name: 'Телевизоры и мониторы',
    icon: '🖥️',
    keywords: ['монитор', 'дисплей', 'тв', 'телевизор', 'проектор'],
  },
  {
    id: 'photo_video',
    name: 'Фото и видео',
    icon: '📷',
    keywords: ['камер', 'фото', 'видео', 'объектив', 'штатив', 'экшн'],
  },
  {
    id: 'wearables',
    name: 'Умные устройства',
    icon: '⌚',
    keywords: ['часы', 'watch', 'браслет', 'фитнес', 'умн', 'smart'],
  },
  {
    id: 'gaming',
    name: 'Игры и консоли',
    icon: '🎮',
    keywords: ['игров', 'game', 'консол', 'playstation', 'xbox', 'nintendo'],
  },
];

// Определяем группу для категории по её названию
function getGroupId(categoryName) {
  const name = categoryName.toLowerCase();
  for (const group of CATEGORY_GROUPS) {
    if (group.keywords.some(kw => name.includes(kw))) {
      return group.id;
    }
  }
  return 'other';
}

export default function CategorySidebar({ onCategoryChange, activeCategory }) {
  const [groupCounts, setGroupCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

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

      // Считаем суммарное количество товаров по группам
      const counts = {};
      let otherCount = 0;

      data.filter(cat => cat.elements > 0).forEach(cat => {
        const groupId = getGroupId(cat.name);
        if (groupId === 'other') {
          otherCount += cat.elements;
        } else {
          counts[groupId] = (counts[groupId] || 0) + cat.elements;
        }
      });

      if (otherCount > 0) counts['other'] = otherCount;

      setGroupCounts(counts);
      console.log('✅ Групп загружено:', Object.keys(counts).length);
    } catch (error) {
      console.error('❌ Ошибка загрузки категорий:', error);
      setGroupCounts({});
    } finally {
      setLoading(false);
    }
  };

  const handleGroupClick = (groupId) => {
    if (activeCategory === groupId) {
      onCategoryChange(null);
    } else {
      onCategoryChange(groupId);
    }
  };

  if (loading) {
    return (
      <div className="category-sidebar">
        <div className="sidebar-header">
          <h3>Категории</h3>
        </div>
        <div className="sidebar-loading">
          <div className="loader-small"></div>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  // Показываем только группы, у которых есть товары
  const visibleGroups = CATEGORY_GROUPS.filter(g => groupCounts[g.id]);
  const hasOther = !!groupCounts['other'];

  return (
    <div className="category-sidebar">
      <div className="sidebar-header">
        <h3>Категории</h3>
        {activeCategory && (
          <button className="reset-btn" onClick={() => onCategoryChange(null)}>
            Сбросить
          </button>
        )}
      </div>

      <div className="categories-list">
        {/* Все товары */}
        <button
          className={`category-item ${!activeCategory ? 'active' : ''}`}
          onClick={() => onCategoryChange(null)}
        >
          <span className="category-icon">📦</span>
          <div className="category-info">
            <span className="category-name">Все товары</span>
          </div>
        </button>

        {/* Группы */}
        {visibleGroups.map((group) => (
          <button
            key={group.id}
            className={`category-item ${activeCategory === group.id ? 'active' : ''}`}
            onClick={() => handleGroupClick(group.id)}
          >
            <span className="category-icon">{group.icon}</span>
            <div className="category-info">
              <span className="category-name">{group.name}</span>
              <span className="category-count">{groupCounts[group.id]} товаров</span>
            </div>
          </button>
        ))}

        {/* Прочее */}
        {hasOther && (
          <button
            className={`category-item ${activeCategory === 'other' ? 'active' : ''}`}
            onClick={() => handleGroupClick('other')}
          >
            <span className="category-icon">📦</span>
            <div className="category-info">
              <span className="category-name">Прочее</span>
              <span className="category-count">{groupCounts['other']} товаров</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}