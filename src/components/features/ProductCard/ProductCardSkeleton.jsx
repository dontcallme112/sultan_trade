/**
 * ProductCardSkeleton — заглушка карточки во время загрузки
 * Используйте вместо спиннера "Загрузка..."
 *
 * Пример использования в CatalogPage:
 *
 *   import ProductCardSkeleton from './ProductCardSkeleton';
 *
 *   {isLoading ? (
 *     Array.from({ length: 6 }).map((_, i) => (
 *       <ProductCardSkeleton key={i} />
 *     ))
 *   ) : (
 *     products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
 *   )}
 */
const ProductCardSkeleton = () => (
  <div className="product-card skeleton-card" aria-hidden="true">

    {/* Изображение */}
    <div className="skeleton-image-wrapper">
      <div className="skeleton-shimmer" />
    </div>

    {/* Инфо */}
    <div className="product-info">
      {/* Бренд */}
      <div className="skeleton-line" style={{ width: '35%', height: '10px' }} />

      {/* Название — две строки */}
      <div className="skeleton-line" style={{ width: '100%', height: '12px', marginTop: '6px' }} />
      <div className="skeleton-line" style={{ width: '75%', height: '12px', marginTop: '4px' }} />

      {/* Футер */}
      <div className="skeleton-footer">
        <div className="skeleton-line" style={{ width: '55%', height: '16px' }} />
        <div className="skeleton-btn-placeholder" />
      </div>
    </div>
  </div>
);

export default ProductCardSkeleton;

