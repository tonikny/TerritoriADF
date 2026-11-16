import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = {
  onError?: (error: unknown) => void;
  children: ReactNode;
};

type State = { hasError: boolean };

/** React encara no permet error boundaries amb hooks. */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- diagnòstic de desenvolupament
      console.error("[map] error del motor", error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <div className="map-loading">No s'ha pogut carregar el mapa.</div>;
    }
    return this.props.children;
  }
}
