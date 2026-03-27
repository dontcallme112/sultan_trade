import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../../api/client';
import './Catalog.css';

// ─── Иконки категорий по ключевым словам ──────────────────────
const CATEGORY_ICONS = {
  'мобильн': '📱', 'телефон': '📱', 'смартфон': '📱', 'iphone': '📱',
  'планшет': '📱',
  'ноутбук': '💻', 'компьютер': '💻', 'системн': '💻', 'процессор': '⚙️',
  'видеокарт': '🖥️', 'материнск': '🖥️',
  'наушник': '🎧', 'микрофон': '🎙️', 'акустич': '🔊', 'колонк': '🔊',
  'клавиатур': '⌨️', 'мышь': '🖱️', 'мониторы': '🖥️', 'монитор': '🖥️',
  'принтер': '🖨️', 'сканер': '🖨️', 'картридж': '🖨️',
  'телевизор': '📺', 'проектор': '📺',
  'роутер': '🌐', 'сетев': '🌐', 'wifi': '🌐',
  'смарт час': '⌚', 'фитнес': '⌚', 'умный дом': '🏠',
  'кабел': '🔌', 'зарядн': '🔋', 'переходник': '🔌', 'аккумулятор': '🔋',
  'флешк': '💾', 'ssd': '💾', 'накопитель': '💾', 'карт памят': '💾',
  'камер': '📷', 'фотоаппарат': '📷', 'дрон': '🚁',
  'игров': '🎮', 'консол': '🎮', 'джойстик': '🎮',
  'электросна': '⚡', 'батарей': '🔋', 'аккумул': '🔋',
  'носитель': '💿', 'диск': '💿',
  'автомобил': '🚗', 'автоэлектр': '🚗',
  'офис': '📋', 'канцел': '📋',
};

function getCategoryIcon(name) {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '📦';
}

// ─── Строим дерево из плоского массива (Nested Sets) ─────────
function buildTree(categories) {
  // Берём только level 1 и 2, у которых есть товары в поддереве
  const roots = categories.filter(c => c.level === 1);
  return roots.map(root => {
    const children = categories.filter(
      c => c.level === 2 && c.left > root.left && c.right < root.right && c.elements > 0
    );
    return { ...root, children };
  }).filter(r => r.elements > 0 || r.children.length > 0);
}

export default function Catalog() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const searchRef = useRef(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/categories`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setCategories(arr);
        setTree(buildTree(arr));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Переход на страницу товаров категории
  const goToProducts = (categoryId, categoryName) => {
    navigate(`/products?category=${categoryId}&name=${encodeURIComponent(categoryName)}`);
  };

  // Поиск по категориям
  const searchLower = search.toLowerCase().trim();
  const filteredTree = searchLower
    ? tree.map(root => {
        const rootMatch = root.name.toLowerCase().includes(searchLower);
        const matchedChildren = root.children.filter(c =>
          c.name.toLowerCase().includes(searchLower)
        );
        if (rootMatch) return { ...root, children: root.children, _expanded: true };
        if (matchedChildren.length > 0) return { ...root, children: matchedChildren, _expanded: true };
        return null;
      }).filter(Boolean)
    : tree;

  return (
    <div className="catalog-page">
      <div className="catalog-search-wrap">
        <div className="catalog-search-box">
          <svg className="catalog-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={searchRef}
            className="catalog-search-input"
            placeholder="Начните вводить название категории..."
            value={search}
            onChange={e => setSearch(e.target.value)}

          />
          {search && (
            <button className="catalog-search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="catalog-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="catalog-skeleton-item" />
          ))}
        </div>
      ) : (
        <div className="catalog-tree">
          {filteredTree.map(root => {
            const isExpanded = search ? root._expanded : !!expanded[root.id];
            const icon = getCategoryIcon(root.name);
            return (
              <div key={root.id} className="catalog-group">
                {/* Родительская категория */}
                <div
                  className={`catalog-root-item ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => {
                    if (root.children.length > 0) {
                      toggleExpand(root.id);
                    } else {
                      goToProducts(root.id, root.name);
                    }
                  }}
                >
                  <span className="catalog-root-icon">{icon}</span>
                  <span className="catalog-root-name">{root.name}</span>
                  {root.children.length > 0 && (
                    <svg
                      className={`catalog-chevron ${isExpanded ? 'open' : ''}`}
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  )}
                </div>

                {/* Подкатегории — раскрываются inline */}
                {isExpanded && root.children.length > 0 && (
                  <div className="catalog-children">
                    {root.children.map(child => (
                      <button
                        key={child.id}
                        className="catalog-child-item"
                        onClick={() => goToProducts(child.id, child.name)}
                      >
                        <span className="catalog-child-dot" />
                        <span className="catalog-child-name">{child.name}</span>
                        <span className="catalog-child-count">{child.elements}</span>
                      </button>
                    ))}
                    {/* Кнопка "Все в категории" */}
                    <button
                      className="catalog-child-item catalog-child-all"
                      onClick={() => goToProducts(root.id, root.name)}
                    >
                      <span className="catalog-child-dot catalog-child-dot-all" />
                      <span className="catalog-child-name">Все товары раздела</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {filteredTree.length === 0 && search && (
            <div className="catalog-empty">
              <p>Категория «{search}» не найдена</p>
              <button onClick={() => setSearch('')}>Сбросить поиск</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}