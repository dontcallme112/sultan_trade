import React from 'react';
import './Loader.css';

const Loader = ({ size = 'medium', fullscreen = false }) => {
  const sizeClass = `loader-${size}`;

  if (fullscreen) {
    return (
      <div className="loader-fullscreen">
        <div className={`loader ${sizeClass}`}>
          <div className="loader-ring"></div>
          <div className="loader-ring"></div>
          <div className="loader-ring"></div>
          <div className="loader-ring"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`loader ${sizeClass}`}>
      <div className="loader-ring"></div>
      <div className="loader-ring"></div>
      <div className="loader-ring"></div>
      <div className="loader-ring"></div>
    </div>
  );
};

export default Loader;