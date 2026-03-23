import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';
import { BACKEND_URL } from '../../api/client';
import { formatNumber } from '../../utils/priceUtils.js';
import './Product.css';

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();

  const [product, setProduct]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity]           = useState(1);
  const [addedToCart, setAddedToCart]     = useState(false);
  const [isFavorite, setIsFavorite]       = useState(false);
  const [lightbox, setLightbox]           = useState(false);
  const [toast, setToast]                 = useState(null);

  useEffect(() => { loadProduct(); }, [id]);
  useEffect(() => { if (user && product) checkFavorite(); }, [user, product]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadProduct = async (retryCount = 0) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BACKEND_URL}/api/product/${id}`);
      if (response.status === 403 && retryCount === 0) { setTimeout(() => loadProduct(1), 2000); return; }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      let productData = null;
      if (data.status && data.data)       productData = data.data;
      else if (data.elements?.length)     productData = data.elements[0];
      else if (Array.isArray(data))       productData = data.find(i => i.article == id) || data[0];
      else if (data.article)              productData = data;
      if (!productData) { setError('Товар не найден'); return; }
      setProduct(productData);
    } catch (err) {
      if (err.message.includes('403') && retryCount === 0) { setTimeout(() => loadProduct(1), 2000); return; }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkFavorite = async () => {
    if (!user || !product) return;
    const { data } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('article', product.article).single();
    setIsFavorite(!!data);
  };

  const toggleFavorite = async () => {
    if (!user) { showToast('Войдите чтобы добавить в избранное', 'info'); return; }
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('article', product.article);
      setIsFavorite(false);
      showToast('Удалено из избранного', 'info');
    } else {
      await supabase.from('favorites').insert({
        user_id:   user.id,
        article:   product.article,
        name:      product.name,
        price:     getProductPrice(), // оригинальная цена без наценки
        image_url: getProductImages()[0],
      });
      setIsFavorite(true);
      showToast('Добавлено в избранное ❤️');
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    const cartItem = {
      id:      product.article,
      article: product.article,
      title:   product.name,
      name:    product.name,
      price:   getProductPrice(), // оригинальная цена БЕЗ наценки
      image:   getProductImages()[0],
    };
    for (let i = 0; i < quantity; i++) addToCart(cartItem);
    setAddedToCart(true);
    showToast(`${product.name?.slice(0, 40)}... добавлен в корзину 🛒`);
    setTimeout(() => setAddedToCart(false), 3000);
  };

  const getProductPrice  = () => product?.price2 || product?.price1 || product?.price || 0;
  const getProductImages = () => {
    if (product?.images?.length) return product.images;
    if (product?.image) return [product.image];
    return ['https://via.placeholder.com/600x600?text=No+Image'];
  };

  const prevImage = () => setSelectedImage(i => (i - 1 + images.length) % images.length);
  const nextImage = () => setSelectedImage(i => (i + 1) % images.length);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => {
      if (e.key === 'Escape')     setLightbox(false);
      if (e.key === 'ArrowLeft')  prevImage();
      if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  if (loading) return (
    <div className="product-page"><div className="container">
      <div className="product-loading"><div className="loader"/><p>Загрузка...</p></div>
    </div></div>
  );

  if (error || !product) return (
    <div className="product-page"><div className="container">
      <div className="product-error">
        <div className="error-icon">⚠️</div>
        <h2>Товар не найден</h2><p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/catalog')}>В каталог</button>
        <button className="btn btn-secondary" onClick={() => loadProduct(0)} style={{ marginLeft: '1rem' }}>Повторить</button>
      </div>
    </div></div>
  );

  const images       = getProductImages();
  const currentPrice = getProductPrice();
  const productName  = product.name || product.full_name || 'Товар';
  const inStock      = product.quantity && product.quantity !== '0' && product.quantity !== 0;

  return (
    <div className="product-page">
      {toast && (
        <div className={`product-toast product-toast--${toast.type || 'success'}`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <button className="lightbox-close" onClick={() => setLightbox(false)}>×</button>
          <button className="lightbox-prev" onClick={(e) => { e.stopPropagation(); prevImage(); }}>‹</button>
          <img src={images[selectedImage]} alt={productName} onClick={e => e.stopPropagation()} />
          <button className="lightbox-next" onClick={(e) => { e.stopPropagation(); nextImage(); }}>›</button>
          <div className="lightbox-counter">{selectedImage + 1} / {images.length}</div>
        </div>
      )}

      <div className="container">
        <nav className="breadcrumbs">
          <button onClick={() => navigate('/')}>Главная</button>
          <span>/</span>
          <button onClick={() => navigate('/catalog')}>Каталог</button>
          <span>/</span>
          <span>{productName.slice(0, 40)}{productName.length > 40 ? '...' : ''}</span>
        </nav>

        <div className="product-content">
          <div className="product-gallery">
            <div className="main-image" onClick={() => setLightbox(true)} title="Нажмите для увеличения">
              <img src={images[selectedImage]} alt={productName}
                onError={e => { e.target.src = 'https://via.placeholder.com/600x600?text=No+Image'; }} />
              <div className="zoom-hint">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </div>
              {images.length > 1 && (
                <>
                  <button className="gallery-prev" onClick={e => { e.stopPropagation(); prevImage(); }}>‹</button>
                  <button className="gallery-next" onClick={e => { e.stopPropagation(); nextImage(); }}>›</button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="thumbnails">
                {images.map((img, i) => (
                  <button key={i} className={`thumbnail ${selectedImage === i ? 'active' : ''}`} onClick={() => setSelectedImage(i)}>
                    <img src={img} alt={`${productName} ${i + 1}`} onError={e => { e.target.src = 'https://via.placeholder.com/100x100?text=?'; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="product-details">
            {product.brand && <p className="product-brand">{product.brand}</p>}

            <div className="product-title-row">
              <h1 className="product-title">{productName}</h1>
              <button className={`favorite-btn ${isFavorite ? 'favorite-btn--active' : ''}`} onClick={toggleFavorite}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            </div>

            <p className="product-article">Артикул: {product.article}</p>

            {/* Цена БЕЗ наценки — как в каталоге */}
            <div className="product-price-block">
              <span className="product-price">{formatNumber(currentPrice)} ₸</span>
            </div>

            <div className="product-stock">
              {inStock ? <span className="in-stock">✓ В наличии</span> : <span className="out-of-stock">✕ Нет в наличии</span>}
            </div>

            {product.description && (
              <div className="product-description">
                <h3>Описание</h3>
                <p>{product.description}</p>
              </div>
            )}

            {product.full_name && product.full_name !== productName && (
              <div className="product-specs">
                <h3>Характеристики</h3>
                <div className="specs-grid">
                  {product.full_name.split(',').filter(s => s.trim()).map((spec, i) => (
                    <div key={i} className="spec-item"><span>{spec.trim()}</span></div>
                  ))}
                </div>
              </div>
            )}

            <div className="quantity-selector">
              <label>Количество:</label>
              <div className="quantity-controls">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>−</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)}>+</button>
              </div>
            </div>

            <div className="product-actions">
              <button className={`btn btn-primary btn-lg ${addedToCart ? 'added' : ''}`} onClick={handleAddToCart} disabled={!inStock}>
                {addedToCart ? (
                  <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>Добавлено</>
                ) : (
                  <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>В корзину</>
                )}
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate('/cart')}>Перейти в корзину</button>
            </div>

            <div className="product-features">
              <div className="feature">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div><strong>Гарантия</strong><p>12 месяцев</p></div>
              </div>
              <div className="feature">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                <div><strong>Доставка</strong><p>1-2 дня по Алматы</p></div>
              </div>
              <div className="feature">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                <div><strong>Возврат</strong><p>14 дней</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}