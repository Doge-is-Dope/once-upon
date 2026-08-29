'use client';

import { Component, type ReactNode } from 'react';

export class ManuscriptErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="message-screen">
        <p className="eyebrow">The manuscript closed unexpectedly</p>
        <h1>The Last Manuscript</h1>
        <p>
          Something went wrong on this page. Your saved pages are safe on this
          device — reload to pick the story back up.
        </p>
        <button
          className="copy-button recovery-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload the manuscript
        </button>
      </main>
    );
  }
}
