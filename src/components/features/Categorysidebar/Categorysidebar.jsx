import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../../api/client';
import './Categorysidebar.css';

// Группы: сопоставляем по ключевым словам в названии категории
const CATEGORY_GROUPS = [
  { id: 'phones',     name: 'Телефоны и планшеты',     icon: '📱', keywords: ['телефон', 'смартфон', 'планшет', 'tablet', 'iphone', 'ipad'] },
  { id: 'computers',  name: 'Компьютеры и ноутбуки',   icon: '💻', keywords: ['ноутбук', 'laptop', 'компьютер', 'пк', 'моноблок', 'системн'] },
  { id: 'accessories',name: 'Аксессуары',               icon: '🎧', keywords: ['наушник', 'headphone', 'колонк', 'speaker', 'клавиатур', 'keyboard', 'мыш', 'mouse', 'чехол', 'case', 'наклад', 'защит', 'кабел', 'провод', 'зарядн', 'адаптер', 'аудио', 'микрофон'] },
  { id: 'tv_monitors',name: 'Телевизоры и мониторы',   icon: '🖥️', keywords: ['монитор', 'дисплей', 'тв', 'телевизор', 'проектор'] },
  { id: 'photo_video',name: 'Фото и видео',             icon: '📷', keywords: ['камер', 'фото', 'видео', 'объектив', 'штатив', 'экшн'] },
  { id: 'wearables',  name: 'Умные устройства',         icon: '⌚', keywords: ['часы', 'watch', 'браслет', 'фитнес', 'умн', 'smart'] },
  { id: 'gaming',     name: 'Игры и консоли',           icon: '🎮', keywords: ['игров', 'game', 'консол', 'playstation', 'xbox', 'nintendo'] },
];

function getGroupId(categoryName) {
  const name = categoryName.toLowerCase();
  for (const group of CATEGORY_GROUPS) {
    if (group.keywords.some(kw => name.includes(kw))) return group.id;
  }
  return 'other';
}

export default function CategorySidebar({ onCategoryChange, activeCategory }) {
  // { groupId: { count: number, categoryIds: string[] } }
  const [groupedCategories, setGroupedCategories] = useState({});
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

      const grouped = {};
      data.filter(cat => cat.elements > 0).forEach(cat => {
        const groupId = getGroupId(cat.name);
        if (!grouped[groupId]) grouped[groupId] = { count: 0, categoryIds: [] };
        grouped[groupId].count += cat.elements;
        grouped[groupId].categoryIds.push(cat.id.toString());
      });

      setGroupedCategories(grouped);
      console.log('✅ Группы:', grouped);
    } catch (error) {
      console.error('❌ Ошибка загрузки категорий:', error);
      setGroupedCategories({});
    } finally {
      setLoading(false);
    }
  };

  const handleGroupClick = (groupId) => {
    if (activeCategory === groupId) {
      // Сбросить
      onCategoryChange(null, null);
    } else {
      const ids = groupedCategories[groupId]?.categoryIds || [];
      // Передаём groupId для подсветки, ids — реальные ID для запроса
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
  const hasOther = !!groupedCategories['other'];

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
        {/* Все товары */}
        <button
          className={`category-item ${!activeCategory ? 'active' : ''}`}
          onClick={() => onCategoryChange(null, null)}
        >
          <span className="category-icon">📦</span>
          <div className="category-info">
            <span className="category-name">Все товары</span>
          </div>
        </button>

        {visibleGroups.map((group) => (
          <button
            key={group.id}
            className={`category-item ${activeCategory === group.id ? 'active' : ''}`}
            onClick={() => handleGroupClick(group.id)}
          >
            <span className="category-icon">{group.icon}</span>
            <div className="category-info">
              <span className="category-name">{group.name}</span>
              <span className="category-count">{groupedCategories[group.id].count} товаров</span>
            </div>
          </button>
        ))}

        {hasOther && (
          <button
            className={`category-item ${activeCategory === 'other' ? 'active' : ''}`}
            onClick={() => handleGroupClick('other')}
          >
            <span className="category-icon">📦</span>
            <div className="category-info">
              <span className="category-name">Прочее</span>
              <span className="category-count">{groupedCategories['other'].count} товаров</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}