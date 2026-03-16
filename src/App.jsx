import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext.jsx';
import Header from './components/layout/Header/Header.jsx';
import Footer from './components/layout/Footer/Footer.jsx';
import Toast from './components/common/Toast/Toast.jsx';
import Home from './pages/home/Home.jsx';
import Catalog from './pages/catalog/Catalog.jsx';
import Product from './pages/product/Product.jsx';
import Cart from './pages/cart/Cart.jsx';
import Checkout from './pages/checkout/Checkout.jsx';
import NotFound from './pages/NotFound/NotFound.jsx';
import OrderConfirmation from './pages/OrderConfirmation/OrderConfirmation';
import NewProducts from './pages/NewProducts/NewProducts';
import './styles/globals.css';
import './styles/variables.css';
import './styles/animations.css';


function App() {
  return (
    <CartProvider>
      <Router>
        <div className="App">
          <Header />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/product/:id" element={<Product />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
              <Route path="/new" element={<NewProducts />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </CartProvider>
  );
}

export default App;