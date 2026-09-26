import { useHud } from '../ui/store';

/** Mirror uncaught errors and promise rejections into the HUD. */
export function installErrorReporting(): void {
  const push = useHud.getState().pushError;
  window.addEventListener('error', (e) => push(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) =>
    push(`Unhandled rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`),
  );
}
