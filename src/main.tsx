import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  rootEl.removeAttribute('data-boot-shell');
  (window as any).__HAMBAK_APP_MOUNTED__ = true;
  createRoot(rootEl).render(
    <RootErrorBoundary scopeLabel="Root">
      <App />
    </RootErrorBoundary>
  );
}

