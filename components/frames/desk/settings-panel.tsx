'use client';

import { GearSixIcon } from '@phosphor-icons/react/dist/ssr/GearSix';
import { WrenchIcon } from '@phosphor-icons/react/dist/ssr/Wrench';
import { useState } from 'react';
import { useDismissiblePanel } from './use-dismissible-panel';

const SETTINGS_PANEL_ID = 'story-settings-panel';
const SETTINGS_TITLE_ID = 'story-settings-title';

export function StorySettings({
  debugMode,
  onDebugModeChange,
}: {
  debugMode: boolean;
  onDebugModeChange: (enabled: boolean) => void;
}) {
  const { open, rootRef, triggerRef, close, toggle } = useDismissiblePanel();
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const showRestartConfirm = open && confirmingRestart;

  return (
    <div className="story-settings" ref={rootRef}>
      <button
        aria-controls={SETTINGS_PANEL_ID}
        aria-expanded={open}
        aria-label="Settings"
        className="story-settings-trigger"
        onClick={() => {
          setConfirmingRestart(false);
          toggle();
        }}
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
        onPointerDown={() => {
          setConfirmingRestart(false);
          close();
        }}
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
          <WrenchIcon
            aria-hidden="true"
            className="setting-row-icon"
            size={19}
            weight="regular"
          />
          <div className="setting-row-copy">
            <label htmlFor="debug-mode-toggle">Tool inspector</label>
            <p id="debug-mode-description">
              Show the page tools your agent can call and their lifecycle. For
              judges and developers.
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
        {showRestartConfirm ? (
          <div className="settings-restart-confirm">
            <p id="settings-restart-question">
              Erase this manuscript and start again?
            </p>
            <div className="settings-restart-actions">
              <button
                className="settings-restart-button is-cancel"
                type="button"
                onClick={() => setConfirmingRestart(false)}
              >
                Cancel
              </button>
              <button
                className="settings-restart-button is-confirm"
                type="button"
                onClick={() => window.location.reload()}
              >
                Start over
              </button>
            </div>
          </div>
        ) : (
          <button
            className="settings-restart-button"
            type="button"
            onClick={() => setConfirmingRestart(true)}
          >
            <strong>Start over</strong>
          </button>
        )}
      </div>
    </div>
  );
}
