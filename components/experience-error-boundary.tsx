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
        <p className="eyebrow">This story paused unexpectedly</p>
        <h1>{this.props.experienceTitle}</h1>
        <p>
          Something went wrong in this experience. Your saved progress remains
          on this device — reload to continue.
        </p>
        <button
          className="copy-button recovery-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload the experience
        </button>
      </main>
    );
  }
}
