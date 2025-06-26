import React from 'react';
import { createRoot } from 'react-dom/client';
import Terms from './Terms';
import '@assets/styles/tailwind.css';

function init() {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(<Terms />);
}

init();