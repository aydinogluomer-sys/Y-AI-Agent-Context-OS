import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import '@/apps/web/src/lib/api/auth-bootstrap';

if ((import.meta as any).env?.DEV) {
  const isViteHmrNoise = (msg: any): boolean => {
    if (typeof msg !== 'string') return false;
    return (
      msg.includes("[vite] failed to connect to websocket") ||
      msg.includes("WebSocket closed without opened") ||
      msg.includes("failed to connect to websocket")
    );
  };

  const origError = console.error;
  console.error = function (...args: any[]) {
    if (args.length > 0 && isViteHmrNoise(args[0])) {
      return;
    }
    origError.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = function (...args: any[]) {
    if (args.length > 0 && isViteHmrNoise(args[0])) {
      return;
    }
    origWarn.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    const errorMsg = event.message || '';
    if (isViteHmrNoise(errorMsg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reasonMsg = (event.reason && (event.reason.message || String(event.reason))) || '';
    if (isViteHmrNoise(reasonMsg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
