import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDevHook } from './debug/devHook';
import { installErrorReporting } from './debug/reportErrors';
import { loadCity, publish } from './game';
import { restartRun } from './planning';
import './index.css';
import './ui/hud.css';
import { useHud } from './ui/store';

installErrorReporting();
if (import.meta.env.DEV) installDevHook();
publish();
loadCity('philly')
  .then(() => restartRun())
  .catch((e: unknown) =>
    useHud
      .getState()
      .pushError(`City failed to load: ${e instanceof Error ? e.message : String(e)}`),
  );

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
