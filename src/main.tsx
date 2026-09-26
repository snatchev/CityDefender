import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDevHook } from './debug/devHook';
import { installErrorReporting } from './debug/reportErrors';
import { publish } from './game';
import './index.css';

installErrorReporting();
if (import.meta.env.DEV) installDevHook();
publish();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
