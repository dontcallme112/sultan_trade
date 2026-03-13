import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { BACKEND_URL } from '../../api/client';
import './Product.css';

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async (retryCount = 0) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Loading product with ID:', id);

      const url = `${BACKEND_URL}/api/product/${id}`;
      console.log('📍 Fetching from:', url);

      const response = await fetch(url);
      console.log('📥 Response status:', response.status);

      // Если 403 и это первая попытка - retry через 2 секунды
      if (response.status === 403 && retryCount === 0) {
        console.log('⚠️ 403 Forbidden, retry через 2 сек...');
        setTimeout(() => {
          loadProduct(1);
        }, 2000);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 Raw API data:', data);

      let productData = null;

      // Вариант 1: Backend вернул { status: true, data: {...} }
      if (data.status && data.data) {
        productData = data.data;
        console.log('✅ Found product in data field');
      }
      // Вариант 2: Backend вернул { elements: [...] }
      else if (data.elements && Array.isArray(data.elements)) {
        if (data.elements.length > 0) {
          productData = data.elements[0];
          console.log('✅ Found product in elements[0]');
        } else {
          console.error('❌ Elements array is empty');
          setError('Товар не найден');
          setLoading(false);
          return;
        }
      }
      // Вариант 3: Backend вернул массив напрямую
      else if (Array.isArray(data)) {
        console.log('📦 Response is array, length:', data.length);
        
        productData = data.find(item => 
          item.article === id || 
          item.article === parseInt(id) ||
          item.id === id ||
          item.id === parseInt(id)
        );
        
        if (productData) {
          console.log('✅ Found product in array by article');
        } else {
          console.error('❌ Product not found in array');
          setError('Товар не найден в списке');
          setLoading(false);
          return;
        }
      }
      // Вариант 4: Данные напрямую (один объект)
      else if (data.article) {
        productData = data;
        console.log('✅ Product data is direct object');
      }
      else {
        console.error('❌ Unknown response format:', Object.keys(data));
        setError('Неизвестный формат ответа API');
        setLoading(false);
        return;
      }

      if (!productData) {
        console.error('❌ Could not extract product data');
        setError('Не удалось получить данные товара');
        setLoading(false);
        return;
      }

      console.log('🎯 Final product data:', productData);
      console.log('📝 Name:', productData.name);
      console.log('💰 Price:', productData.price2 || productData.price);
      console.log('🖼️ Images:', productData.images);

      setProduct(productData);
    } catch (err) {
      console.error('❌ Error loading product:', err);
      
      // Если 403 и это первая попытка - retry
      if (err.message.includes('403') && retryCount === 0) {
        console.log('⚠️ 403 error, retry через 2 сек...');
        setTimeout(() => {
          loadProduct(1);
        }, 2000);
        return;
      }
      
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;

    const price = product.price2 || product.price1 || product.price || 0;

    const cartItem = {
      id: product.article,
      article: product.article,
      name: product.name,
      price: Math.round(price * 1.1),
      image: getProductImage(),
    };

    console.log('🛒 Adding to cart:', cartItem);

    for (let i = 0; i < quantity; i++) {
      addToCart(cartItem);
    }

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 3000);
  };

  const formatPrice = (price) => {
    if (!price || isNaN(price)) return '0';
    const priceWithMarkup = Math.round(price * 1.1);
    return new Intl.NumberFormat('ru-RU').format(priceWithMarkup);
  };

  const getProductPrice = () => {
    if (!product) return 0;
    return product.price2 || product.price1 || product.price || 0;
  };

  const getProductImage = () => {
    if (!product) return 'https://via.placeholder.com/600x600?text=No+Image';
    
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      return product.images[0];
    }
    
    if (product.image) return product.image;
    
    return 'https://via.placeholder.com/600x600?text=No+Image';
  };

  const getProductImages = () => {
    if (!product) return ['https://via.placeholder.com/600x600?text=No+Image'];
    
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      return product.images;
    }
    
    if (product.image) return [product.image];
    
    return ['https://via.placeholder.com/600x600?text=No+Image'];
  };

  if (loading) {
    return (
      <div className="product-page">
        <div className="container">
          <div className="product-loading">
            <div className="loader"></div>
            <p>Загрузка товара...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="product-page">
        <div className="container">
          <div className="product-error">
            <div className="error-icon">⚠️</div>
            <h2>Товар не найден</h2>
            <p>{error || 'Товар не найден в ответе API'}</p>
            <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
              Вернуться в каталог
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => loadProduct(0)}
              style={{ marginLeft: '1rem' }}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    );
  }

  const images = getProductImages();
  const currentPrice = getProductPrice();
  const productName = product.name || product.full_name || 'Товар';
  const productDescription = product.description || product.full_name || '';

  return (
    <div className="product-page">
      <div className="container">
        {/* Breadcrumbs */}
        <nav className="breadcrumbs">
          <button onClick={() => navigate('/')}>Главная</button>
          <span>/</span>
          <button onClick={() => navigate('/catalog')}>Каталог</button>
          <span>/</span>
          <span>{productName}</span>
        </nav>

        <div className="product-content">
          {/* Gallery */}
          <div className="product-gallery">
            <div className="main-image">
              <img 
                src={images[selectedImage]} 
                alt={productName}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/600x600?text=No+Image';
                }}
              />
            </div>

            {images.length > 1 && (
              <div className="thumbnails">
                {images.map((img, index) => (
                  <button
                    key={index}
                    className={`thumbnail ${selectedImage === index ? 'active' : ''}`}
                    onClick={() => setSelectedImage(index)}
                  >
                    <img 
                      src={img} 
                      alt={`${productName} ${index + 1}`}
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/100x100?text=No+Image';
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="product-details">
            {product.brand && (
              <p className="product-brand">{product.brand}</p>
            )}

            <h1 className="product-title">{productName}</h1>
            <p className="product-article">Артикул: {product.article}</p>

            <div className="product-price-block">
              <p className="product-price">
                {formatPrice(currentPrice)} ₸
              </p>
            </div>

            <div className="product-stock">
              {product.quantity > 0 ? (
                <span className="in-stock">
                  ✓ В наличии ({product.quantity} шт)
                </span>
              ) : (
                <span className="out-of-stock">Нет в наличии</span>
              )}
            </div>

            {productDescription && (
              <div className="product-description">
                <h3>Описание</h3>
                <p>{productDescription}</p>
              </div>
            )}

            <div className="quantity-selector">
              <label>Количество:</label>
              <div className="quantity-controls">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  −
                </button>
                <span>{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  disabled={quantity >= (product.quantity || 999)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="product-actions">
              <button 
                className={`btn btn-primary btn-lg ${addedToCart ? 'added' : ''}`}
                onClick={handleAddToCart}
                disabled={product.quantity === 0}
              >
                {addedToCart ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Добавлено
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="21" r="1"/>
                      <circle cx="20" cy="21" r="1"/>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                    </svg>
                    В корзину
                  </>
                )}
              </button>

              <button 
                className="btn btn-secondary btn-lg"
                onClick={() => navigate('/cart')}
              >
                Перейти в корзину
              </button>
            </div>

            <div className="product-features">
              <div className="feature">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
                </svg>
                <div>
                  <strong>Гарантия</strong>
                  <p>12 месяцев</p>
                </div>
              </div>

              <div className="feature">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <div>
                  <strong>Доставка</strong>
                  <p>1-2 дня по Алматы</p>
                </div>
              </div>

              <div className="feature">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <strong>Оригинал</strong>
                  <p>100% оригинальная техника</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}