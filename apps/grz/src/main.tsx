import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@core/platform/files';
import { installLogging } from '@core/platform/log';
import { applyTheme, useTheme } from '@core/platform/theme';
import { App } from './App';
import { ErrorBoundary } from '@core/ui/Absturz';
import '@core/ui/base.css';
import './styles.css';

installLogging({ version: __APP_VERSION__, desktop: isTauri(), userAgent: navigator.userAgent });
// Farbschema vor dem ersten Zeichnen setzen (kein helles Aufblitzen)
applyTheme(useTheme.getState().theme, useTheme.getState().canvasDunkel);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
