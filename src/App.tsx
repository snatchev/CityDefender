import { ErrorBoundary } from './debug/ErrorBoundary';
import { Scene } from './render/Scene';
import { Attribution } from './ui/Attribution';
import { EndScreen } from './ui/EndScreen';
import { Hud } from './ui/Hud';

export function App() {
  return (
    <>
      <ErrorBoundary>
        <Scene />
      </ErrorBoundary>
      <Hud />
      <Attribution />
      <EndScreen />
    </>
  );
}
