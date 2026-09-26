import { ErrorBoundary } from './debug/ErrorBoundary';
import { Scene } from './render/Scene';
import { Hud } from './ui/Hud';

export function App() {
  return (
    <>
      <ErrorBoundary>
        <Scene />
      </ErrorBoundary>
      <Hud />
    </>
  );
}
