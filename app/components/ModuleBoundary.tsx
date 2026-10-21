'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  /** Shown in the fallback, e.g. "Voice notes". */
  name: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * Contains a crash to one panel of the page. If, say, the voice-note recorder throws while
 * rendering, only that panel is replaced by a short message; scanning and syncing keep working.
 */
export default class ModuleBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ui:${this.props.name}] crashed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {this.props.name} ran into a problem and was switched off for this page. Everything else still works.{' '}
        <button onClick={() => this.setState({ failed: false })} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          Try again
        </button>
      </div>
    );
  }
}
