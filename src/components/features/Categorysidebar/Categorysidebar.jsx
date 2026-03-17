import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../../api/client';
import './CategorySidebar.css';

export default function CategorySidebar({ onCategoryChange, activeCategory }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/categories`);
      let data = await response.json();

      // Проверяем формат
      if (!Array.isArray(data)) {
        if (data && data.data && Array.isArray(data.data)) {
          data = data.data;
        } else if (data && typeof data === 'object') {
          data = Object.values(data);
        } else {
          data = [];
        }
      }

      // Фильтруем только категории с товарами
      const categoriesWithProducts = data.filter(cat => cat.elements > 0);

      setCategories(categoriesWithProducts);
      console.log('✅ Категорий загружено:', categoriesWithProducts.length);
    } catch (error) {
      console.error('❌ Ошибка загрузки категорий:', error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (categoryId) => {
    if (activeCategory === categoryId) {
      // Если уже выбрана - сбрасываем
      onCategoryChange(null);
    } else {
      onCategoryChange(categoryId);
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

  return (
    <div className="category-sidebar">
      <div className="sidebar-header">
        <h3>Категории</h3>
        {activeCategory && (
          <button 
            className="reset-btn"
            onClick={() => onCategoryChange(null)}
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="categories-list">
        <button
          className={`category-item ${!activeCategory ? 'active' : ''}`}
          onClick={() => onCategoryChange(null)}
        >
          <span className="category-icon">📦</span>
          <div className="category-info">
            <span className="category-name">Все товары</span>
          </div>
        </button>

        {categories.map((category) => (
          <button
            key={category.id}
            className={`category-item ${activeCategory === category.id.toString() ? 'active' : ''}`}
            onClick={() => handleCategoryClick(category.id.toString())}
          >
            <span className="category-icon">
              {getCategoryIcon(category.name)}
            </span>
            <div className="category-info">
              <span className="category-name">{category.name}</span>
              <span className="category-count">{category.elements} товаров</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Функция для иконок категорий
function getCategoryIcon(categoryName) {
  const name = categoryName.toLowerCase();
  
  if (name.includes('телефон') || name.includes('смартфон')) return '📱';
  if (name.includes('планшет') || name.includes('tablet')) return '📲';
  if (name.includes('ноутбук') || name.includes('laptop')) return '💻';
  if (name.includes('компьютер') || name.includes('пк')) return '🖥️';
  if (name.includes('наушник') || name.includes('headphone')) return '🎧';
  if (name.includes('колонк') || name.includes('speaker')) return '🔊';
  if (name.includes('клавиатур') || name.includes('keyboard')) return '⌨️';
  if (name.includes('мыш') || name.includes('mouse')) return '🖱️';
  if (name.includes('монитор') || name.includes('дисплей')) return '🖥️';
  if (name.includes('кабел') || name.includes('провод')) return '🔌';
  if (name.includes('зарядн') || name.includes('адаптер')) return '🔋';
  if (name.includes('чехол') || name.includes('case')) return '📱';
  if (name.includes('наклад') || name.includes('защит')) return '🛡️';
  if (name.includes('камер')) return '📷';
  if (name.includes('тв') || name.includes('телевизор')) return '📺';
  if (name.includes('часы') || name.includes('watch')) return '⌚';
  if (name.includes('игров') || name.includes('game')) return '🎮';
  if (name.includes('аудио')) return '🎵';
  if (name.includes('видео')) return '📹';
  
  return '📦'; // По умолчанию
}