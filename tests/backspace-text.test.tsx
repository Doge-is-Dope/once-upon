// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackspaceText,
  buildRewriteParts,
} from '../components/frames/desk/backspace-text';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('backspace replacement', () => {
  it('keeps the animation visual separate from one clean accessible result', () => {
    const html = renderToStaticMarkup(
      createElement(BackspaceText, {
        original: 'You keep walking.',
        replacement: 'The subject continues walking.',
        onComplete: () => undefined,
      }),
    );

    expect(html).toContain('class="backspace-replacement"');
    expect(html).toContain('You keep ');
    expect(html).toContain('walking.');
    expect(html).toContain(
      '<span class="sr-only">The subject continues walking.</span>',
    );
    expect(html).not.toContain('<del>');
    expect(html).not.toContain('<ins>');
  });

  it('keeps common tokens outside changed runs', () => {
    expect(
      buildRewriteParts(
        'You leave the room and keep walking.',
        'The subject leaves the room and continues walking.',
      ),
    ).toEqual([
      {
        kind: 'change',
        original: 'You leave ',
        replacement: 'The subject leaves ',
      },
      { kind: 'same', text: 'the room and ' },
      { kind: 'change', original: 'keep ', replacement: 'continues ' },
      { kind: 'same', text: 'walking.' },
    ]);
  });

  it('deletes, pauses, types, then completes exactly once', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(BackspaceText, {
          original: 'AB',
          replacement: 'CD',
          onComplete,
        }),
      );
    });
    const visible = () =>
      host.querySelector<HTMLElement>('.backspace-visual')?.textContent;

    expect(visible()).toBe('AB');
    await act(async () => vi.advanceTimersByTime(28));
    expect(visible()).toBe('A');
    await act(async () => vi.advanceTimersByTime(28));
    expect(visible()).toBe('');
    await act(async () => vi.advanceTimersByTime(180));
    expect(visible()).toBe('');
    await act(async () => vi.advanceTimersByTime(36));
    expect(visible()).toBe('C');
    await act(async () => vi.advanceTimersByTime(36));
    expect(visible()).toBe('CD');
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(36));
    expect(onComplete).toHaveBeenCalledTimes(1);
    await act(async () => vi.runOnlyPendingTimers());
    expect(onComplete).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
