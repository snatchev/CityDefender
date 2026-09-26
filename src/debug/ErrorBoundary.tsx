import { Component, type ReactNode } from 'react';
import { useHud } from '../ui/store';

/** Catches render errors (e.g. WebGL context failure) and reports them to the HUD instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    useHud.getState().pushError(error instanceof Error ? error.message : String(error));
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
