'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LightbulbFilamentIcon } from '@phosphor-icons/react/dist/ssr/LightbulbFilament';

const HINT_PANEL_ID = 'story-hint-panel';
const HINT_TITLE_ID = 'story-hint-title';

export function StoryHint({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target))
        return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeAndRestoreFocus, open]);

  return (
    <div className="story-hint-control" ref={rootRef}>
      <button
        aria-controls={HINT_PANEL_ID}
        aria-expanded={open}
        aria-label="Hint"
        className="story-hint-trigger"
        data-available
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="Hint"
        type="button"
      >
        <LightbulbFilamentIcon aria-hidden="true" size={20} weight="fill" />
      </button>
      <div
        aria-hidden={!open}
        aria-labelledby={HINT_TITLE_ID}
        className="story-hint-panel"
        data-open={open || undefined}
        id={HINT_PANEL_ID}
        inert={!open}
      >
        <p className="story-hint-kicker" id={HINT_TITLE_ID}>
          Hint
        </p>
        <p>{hint}</p>
      </div>
    </div>
  );
}
