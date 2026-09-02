'use client';

import { LightbulbFilamentIcon } from '@phosphor-icons/react/dist/ssr/LightbulbFilament';
import { useDismissiblePanel } from './use-dismissible-panel';

const HINT_PANEL_ID = 'story-hint-panel';
const HINT_TITLE_ID = 'story-hint-title';

// The bulb stays mounted between turns so the header never reflows; it
// only dims while the page is being written or the record is closed.
export function StoryHint({
  hint,
  disabled = false,
}: {
  hint: string;
  disabled?: boolean;
}) {
  const { open, rootRef, triggerRef, toggle } = useDismissiblePanel();
  const panelOpen = open && !disabled;

  return (
    <div className="story-hint-control" ref={rootRef}>
      <button
        aria-controls={HINT_PANEL_ID}
        aria-expanded={panelOpen}
        aria-label="Hint"
        className="story-hint-trigger"
        data-available={disabled ? undefined : true}
        disabled={disabled}
        onClick={toggle}
        ref={triggerRef}
        title={disabled ? 'Hint (available after this chapter)' : 'Hint'}
        type="button"
      >
        <LightbulbFilamentIcon aria-hidden="true" size={20} weight="fill" />
      </button>
      <div
        aria-hidden={!panelOpen}
        aria-labelledby={HINT_TITLE_ID}
        className="story-hint-panel"
        data-open={panelOpen || undefined}
        id={HINT_PANEL_ID}
        inert={!panelOpen}
      >
        <p className="story-hint-kicker" id={HINT_TITLE_ID}>
          Hint
        </p>
        <p>{hint}</p>
      </div>
    </div>
  );
}
