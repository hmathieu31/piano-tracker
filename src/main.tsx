import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import { useNavigate, useHref } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import { UpdaterProvider } from './context/UpdaterContext';
import App from './App';
import './index.css';

function Root() {
  return (
    <BrowserRouter>
      <UpdaterProvider>
        <HeroUIInner />
      </UpdaterProvider>
    </BrowserRouter>
  );
}

function HeroUIInner() {
  const navigate = useNavigate();
  return (
    <HeroUIProvider navigate={navigate} useHref={useHref} className="h-full w-full">
      <App />
    </HeroUIProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
