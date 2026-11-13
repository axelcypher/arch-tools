import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@core/platform/files';
import { installLogging } from '@core/platform/log';
import { themeAnwenden } from '@core/platform/theme';
import { App } from './App';
import { vorDemSchliessenAnmelden } from './ausstehend';
import { ErrorBoundary } from '@core/ui/Absturz';
import '@core/ui/base.css';
import './styles.css';

installLogging({ version: __APP_VERSION__, desktop: isTauri(), userAgent: navigator.userAgent });
// Farbschema vor dem ersten Zeichnen setzen (kein helles Aufblitzen)
themeAnwenden();
// vor dem Schließen, Andocken oder Update-Neustart laufendes Schreiben abwarten (Projektdatei, Formular, Dokumente)
vorDemSchliessenAnmelden();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
