/** Einstiegspunkt: verdrahtet echte Services (src/services) und BrowserRouter. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { auth, data, IS_DEMO_BACKEND } from './services';
// Schriften lokal (kein Google-Fonts-Abruf): Instrument Serif (Überschriften), Inter (UI)
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App services={{ auth, data, demoMode: IS_DEMO_BACKEND }} />
    </BrowserRouter>
  </StrictMode>,
);
