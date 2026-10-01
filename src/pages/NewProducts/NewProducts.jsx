import ProductGrid from '../../components/features/ProductGrid/ProductGrid';

// Страница «Новинки» использует ту же сетка/карточки/поиск, что и список товаров категории.
export default function NewProducts() {
  return <ProductGrid onlyNew title="Новинки" />;
}