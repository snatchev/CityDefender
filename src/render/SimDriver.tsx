import { useFrame } from '@react-three/fiber';
import { game, publish } from '../game';
import { refreshPlanning, refreshSelection } from '../planning';
import { tickWorld } from '../sim/world';

/** HUD refresh interval in ticks (4 Hz): event rate, never per frame. */
const PUBLISH_EVERY_TICKS = 5;

/**
 * Bridges the render loop to the fixed-step simulation. Renders nothing.
 * Rule: no React state updates here except the throttled `publish()`.
 */
export function SimDriver() {
  useFrame((_, delta) => {
    const steps = game.stepper.advance(delta);
    let due = false;
    for (let i = 0; i < steps; i++) {
      tickWorld(game.world);
      if (game.world.tick % PUBLISH_EVERY_TICKS === 0) due = true;
    }
    if (due) {
      publish();
      refreshPlanning(); // no-op unless the flow field changed (barricade damaged or destroyed)
      refreshSelection();
    }
  });
  return null;
}
