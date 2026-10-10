import React from 'react';
import ReactDOM from 'react-dom/client';
import Portal from './Portal';
import { ThemeProvider } from './theme';
import { I18nProvider } from './i18n';
import './styles/tailwind.css';
import './styles/styles.css';
import './styles/portal.css';
import './styles/workspace.css';
import './landing/landing.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <Portal />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
