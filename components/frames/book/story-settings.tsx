'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BugIcon } from '@phosphor-icons/react/dist/ssr/Bug';
import { GearSixIcon } from '@phosphor-icons/react/dist/ssr/GearSix';

const SETTINGS_PANEL_ID = 'story-settings-panel';
const SETTINGS_TITLE_ID = 'story-settings-title';

export function StorySettings({
  debugMode,
  onDebugModeChange,
}: {
  debugMode: boolean;
  onDebugModeChange: (enabled: boolean) => void;
}) {
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
    <div className="story-settings" ref={rootRef}>
      <button
        aria-controls={SETTINGS_PANEL_ID}
        aria-expanded={open}
        aria-label="Settings"
        className="story-settings-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="Settings"
        type="button"
      >
        <GearSixIcon aria-hidden="true" size={20} weight="regular" />
      </button>
      <div
        aria-hidden="true"
        className="settings-backdrop"
        data-open={open || undefined}
        onPointerDown={() => setOpen(false)}
      />
      <div
        aria-hidden={!open}
        aria-labelledby={SETTINGS_TITLE_ID}
        className="settings-panel"
        data-open={open || undefined}
        id={SETTINGS_PANEL_ID}
        inert={!open}
      >
        <div className="settings-panel-header">
          <h2 id={SETTINGS_TITLE_ID}>Settings</h2>
        </div>
        <div className="setting-row">
          <BugIcon
            aria-hidden="true"
            className="setting-row-icon"
            size={19}
            weight="regular"
          />
          <div className="setting-row-copy">
            <label htmlFor="debug-mode-toggle">Debug mode</label>
            <p id="debug-mode-description">
              Show WebMCP tools and lifecycle details.
            </p>
          </div>
          <input
            aria-describedby="debug-mode-description"
            checked={debugMode}
            className="setting-switch"
            id="debug-mode-toggle"
            onChange={(event) => onDebugModeChange(event.target.checked)}
            type="checkbox"
          />
        </div>
        <button
          className="settings-restart-button"
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Reset? Your progress will be erased and this page will reload.',
              )
            )
              window.location.reload();
          }}
        >
          <strong>Reset</strong>
        </button>
      </div>
    </div>
  );
}
