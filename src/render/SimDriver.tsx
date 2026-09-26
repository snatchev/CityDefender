import { useFrame } from '@react-three/fiber';
import { game, publish } from '../game';
import { TICK_HZ } from '../sim/constants';
import { tickWorld } from '../sim/world';

/**
 * Bridges the render loop to the fixed-step simulation. Renders nothing.
 * Rule: no React state updates here except the throttled `publish()`.
 */
export function SimDriver() {
  useFrame((_, delta) => {
    const steps = game.stepper.advance(delta);
    for (let i = 0; i < steps; i++) {
      tickWorld(game.world);
      if (game.world.tick % TICK_HZ === 0) publish();
    }
  });
  return null;
}
