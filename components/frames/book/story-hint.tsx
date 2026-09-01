'use client';

import { LightbulbFilamentIcon } from '@phosphor-icons/react/dist/ssr/LightbulbFilament';
import { useDismissiblePanel } from './use-dismissible-panel';

const HINT_PANEL_ID = 'story-hint-panel';
const HINT_TITLE_ID = 'story-hint-title';

export function StoryHint({ hint }: { hint: string }) {
  const { open, rootRef, triggerRef, toggle } = useDismissiblePanel();

  return (
    <div className="story-hint-control" ref={rootRef}>
      <button
        aria-controls={HINT_PANEL_ID}
        aria-expanded={open}
        aria-label="Hint"
        className="story-hint-trigger"
        data-available
        onClick={toggle}
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
