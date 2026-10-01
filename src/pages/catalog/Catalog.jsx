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

const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

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
      <div className="catalog-inner">
        <h1 className="catalog-title">Каталог</h1>

        <div className="catalog-search-box">
          <svg className="catalog-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            className="catalog-search-input"
            placeholder="Найти категорию..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="catalog-search-clear" onClick={() => setSearch('')} aria-label="Очистить">×</button>
          )}
        </div>

        {loading ? (
          <div className="catalog-tree" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="catalog-skeleton-row">
                <div className="skeleton catalog-skeleton-icon" />
                <div className="skeleton catalog-skeleton-line" style={{ width: `${40 + (i * 7) % 35}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="catalog-tree">
            {filteredTree.map(root => {
              const hasChildren = root.children.length > 0;
              const isExpanded = search ? !!root._expanded : !!expanded[root.id];
              return (
                <div key={root.id} className={`catalog-group ${isExpanded ? 'is-open' : ''}`}>
                  {/* Родительская категория */}
                  <button
                    type="button"
                    className={`catalog-root-item ${isExpanded ? 'expanded' : ''}`}
                    aria-expanded={hasChildren ? isExpanded : undefined}
                    onClick={() => (hasChildren ? toggleExpand(root.id) : goToProducts(root.id, root.name))}
                  >
                    <span className="catalog-root-icon">{getCategoryIcon(root.name)}</span>
                    <span className="catalog-root-name">{root.name}</span>
                    {root.elements > 0 && <span className="catalog-root-count">{fmt(root.elements)}</span>}
                    <svg
                      className={`catalog-chevron ${isExpanded ? 'open' : ''}`}
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    >
                      {hasChildren ? <polyline points="6 9 12 15 18 9" /> : <polyline points="9 18 15 12 9 6" />}
                    </svg>
                  </button>

                  {/* Подкатегории: всегда в разметке, раскрываются плавно через CSS */}
                  {hasChildren && (
                    <div className={`catalog-children-wrap ${isExpanded ? 'open' : ''}`}>
                      <div className="catalog-children">
                        {root.children.map((child, i) => (
                          <button
                            type="button"
                            key={child.id}
                            className="catalog-child-item"
                            style={{ '--i': i }}
                            onClick={() => goToProducts(child.id, child.name)}
                          >
                            <span className="catalog-child-dot" />
                            <span className="catalog-child-name">{child.name}</span>
                            <span className="catalog-child-count">{fmt(child.elements)}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="catalog-child-item catalog-child-all"
                          style={{ '--i': root.children.length }}
                          onClick={() => goToProducts(root.id, root.name)}
                        >
                          <span className="catalog-child-name">Все товары раздела</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredTree.length === 0 && search && (
              <div className="catalog-empty">
                <p>Категория «{search}» не найдена</p>
                <button type="button" onClick={() => setSearch('')}>Сбросить поиск</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}