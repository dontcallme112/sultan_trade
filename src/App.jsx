import React from 'react';  
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext.jsx';
import Header from './components/layout/Header/Header.jsx';
import Footer from './components/layout/Footer/Footer.jsx';
import Home from './pages/home/Home.jsx';
import Catalog from './pages/catalog/Catalog.jsx';
import Product from './pages/product/Product.jsx';
import Cart from './pages/cart/Cart.jsx';
import './styles/globals.css';
import './styles/variables.css';
import './styles/animations.css';

function App() {
  return (
    <CartProvider>
      <Router>
        <div className="app">
          <Header />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/product/:id" element={<Product />} />
              <Route path="/cart" element={<Cart />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </CartProvider>
  );
}

export default App;