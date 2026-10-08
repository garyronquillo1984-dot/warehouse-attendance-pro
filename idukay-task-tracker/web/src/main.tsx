import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { AccountProvider } from './lib/account';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './components/ui';

// Browsers restore scroll on back/forward; the app manages it itself.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <AuthProvider>
          <AccountProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AccountProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
