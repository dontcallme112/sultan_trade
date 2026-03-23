import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../../api/client';
import './Categorysidebar.css';

// Группы на основе РЕАЛЬНЫХ названий категорий al-style
const CATEGORY_GROUPS = [
  {
    id: 'phones',
    name: 'Телефоны и планшеты',
    icon: '📱',
    keywords: [
      'мобильн', 'телефон', 'смартфон', 'планшет', 'iphone', 'ipad',
      'защитн', 'стёкла', 'плёнк', 'чехол для планшет',
      'портативн зарядн', // power bank
    ],
  },
  {
    id: 'computers',
    name: 'Компьютеры и ноутбуки',
    icon: '💻',
    keywords: [
      'ноутбук', 'laptop', 'системн блок', 'моноблок', 'мини пк',
      'компьютер', 'комплектующ', 'процессор', 'cpu',
      'материнск', 'mb', 'видеокарт', 'vga',
      'оперативн памят', 'ddr3', 'ddr4', 'ddr5', 'озу',
      'жёстк диск', 'hdd', 'твердотельн', 'ssd',
      'портативн диск', 'корпус', 'блок питани',
      'охлаждени', 'вентилятор', 'термопаст',
      'программн обеспечени', 'охлаждающ подставк',
      'сумк', // сумки для ноутбука
    ],
  },
  {
    id: 'peripherals',
    name: 'Периферия и устройства ввода',
    icon: '⌨️',
    keywords: [
      'клавиатур', 'keyboard', 'мышь', 'мыши', 'mouse',
      'беспроводн комплект', 'проводн комплект',
      'монитор', 'дисплей', 'кронштейн для монитор',
      'веб камер', 'расширител usb', 'адаптер', 'контроллер',
      'устройств ввод', 'устройств чтени',
      'принтер', 'сканер', 'мфу',
    ],
  },
  {
    id: 'network',
    name: 'Сеть и серверы',
    icon: '🌐',
    keywords: [
      'сетев', 'роутер', 'маршрутизатор', 'коммутатор', 'switch',
      'wifi', 'wi-fi', 'беспроводн сет',
      'сервер', 'nas', 'rack',
      'патч', 'кабель rj', 'sfp',
    ],
  },
  {
    id: 'audio',
    name: 'Аудио и акустика',
    icon: '🎧',
    keywords: [
      'наушник', 'headphone', 'headset',
      'колонк', 'акустик', 'speaker',
      'микрофон', 'звуков', 'аудио',
      'гарнитур',
    ],
  },
  {
    id: 'tv_media',
    name: 'ТВ и медиа',
    icon: '📺',
    keywords: [
      'телевизор', 'тв', 'tv',
      'проектор', 'медиаплеер', 'стриминг',
      'кронштейн для тв', 'антенн',
    ],
  },
  {
    id: 'photo_video',
    name: 'Фото и видео',
    icon: '📷',
    keywords: [
      'камер', 'фотоаппарат', 'объектив', 'штатив',
      'экшн', 'action', 'gopro', 'видеокамер',
      'дрон', 'квадрокоптер',
    ],
  },
  {
    id: 'gaming',
    name: 'Игры и консоли',
    icon: '🎮',
    keywords: [
      'игров', 'game', 'gaming',
      'консол', 'playstation', 'xbox', 'nintendo',
      'джойстик', 'геймпад', 'руль игров',
      'игровой стул', 'игровой стол',
    ],
  },
  {
    id: 'wearables',
    name: 'Умные устройства',
    icon: '⌚',
    keywords: [
      'смарт час', 'smart watch',
      'фитнес браслет', 'браслет',
      'умн', 'smart home', 'умный дом',
    ],
  },
  {
    id: 'cables_power',
    name: 'Кабели и зарядки',
    icon: '🔌',
    keywords: [
      'кабел', 'провод', 'шнур',
      'зарядн устройств', 'зарядк',
      'сетевой фильтр', 'удлинитель', 'ибп', 'ups',
      'переходник', 'разветвитель',
    ],
  },
  {
    id: 'office',
    name: 'Офис и бизнес',
    icon: '🖨️',
    keywords: [
      'принтер', 'сканер', 'мфу', 'копир',
      'картридж', 'тонер', 'чернил',
      'бумаг', 'ламинатор', 'уничтожитель',
      'офисн', 'канцелярск',
    ],
  },
  {
    id: 'storage',
    name: 'Носители информации',
    icon: '💾',
    keywords: [
      'флешк', 'flash', 'usb накопитель',
      'карт памят', 'sd card', 'microsd',
      'оптическ диск', 'dvd', 'blu-ray',
    ],
  },
];

function getGroupId(categoryName) {
  const name = categoryName.toLowerCase();
  for (const group of CATEGORY_GROUPS) {
    if (group.keywords.some(kw => name.includes(kw))) return group.id;
  }
  return 'other';
}

export default function CategorySidebar({ onCategoryChange, activeCategory }) {
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
      let unmapped = [];

      data.filter(cat => cat.elements > 0).forEach(cat => {
        const groupId = getGroupId(cat.name);
        if (!grouped[groupId]) grouped[groupId] = { count: 0, categoryIds: [] };
        grouped[groupId].count += cat.elements;
        grouped[groupId].categoryIds.push(cat.id.toString());
        if (groupId === 'other') unmapped.push(cat.name);
      });

      if (unmapped.length > 0) {
        console.log('⚠️ Не распределены по группам:', unmapped);
      }

      setGroupedCategories(grouped);
      console.log('✅ Группы категорий:', Object.fromEntries(
        Object.entries(grouped).map(([k, v]) => [k, v.count])
      ));
    } catch (error) {
      console.error('❌ Ошибка загрузки категорий:', error);
      setGroupedCategories({});
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