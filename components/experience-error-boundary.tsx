'use client';

import { Component, type ReactNode } from 'react';

export class ExperienceErrorBoundary extends Component<
  { children: ReactNode; experienceTitle: string },
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
        <p className="eyebrow">The record has been interrupted.</p>
        <h1>{this.props.experienceTitle}</h1>
        <p>
          Something went wrong. Reloading begins a new manuscript from the
          prologue.
        </p>
        <button
          className="copy-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Start over
        </button>
      </main>
    );
  }
}
