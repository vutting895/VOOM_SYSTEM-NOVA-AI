import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SupabaseSessionProvider } from './providers/SupabaseSessionProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SupabaseSessionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SupabaseSessionProvider>
  </React.StrictMode>
);
