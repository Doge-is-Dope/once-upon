'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { useExperience } from '../experience-context';
import { ConnectionIssueNotice } from '../webmcp-notices';
import { StoryPreview } from './story-preview';

export function SetupScreen({
  title,
  onBegin,
  webMCPStatus,
  onRetryConnection,
  autoFocusName,
}: {
  title: string;
  onBegin: (name: string, specialty: string) => Promise<unknown>;
  webMCPStatus: WebMCPStatus;
  onRetryConnection: () => void;
  autoFocusName: boolean;
}) {
  const { story } = useExperience();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusName) nameRef.current?.focus();
  }, [autoFocusName]);
  return (
    <main className="cover-shell">
      <section className="cover-panel" aria-labelledby="game-title">
        <p className="platform-mark">Once Upon presents</p>
        <p className="eyebrow">Six pages before midnight</p>
        <h1 id="game-title">{title}</h1>
        <p className="lede">A mystery you play with your AI.</p>
        <p className="sublede">
          You choose. The book rolls the dice. Your AI writes what happens.
        </p>
        {webMCPStatus === 'connected' ? (
          <form
            className="character-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setBusy(true);
              setFormError('');
              const nameValue = data.get('characterName');
              const strengthValue = data.get('strength');
              const name = typeof nameValue === 'string' ? nameValue : '';
              const specialty = story.attributes.some(
                (attribute) => attribute.id === strengthValue,
              )
                ? (strengthValue as string)
                : story.attributes[0].id;
              void onBegin(name, specialty)
                .catch(() =>
                  setFormError(
                    'The manuscript could not be saved on this device. Private browsing or full storage can cause this.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <label htmlFor="character-name">Your character&apos;s name</label>
            <input
              id="character-name"
              name="characterName"
              autoComplete="off"
              placeholder="Optional"
              maxLength={40}
              ref={nameRef}
            />
            <p className="field-note">Leave blank to play as the traveler.</p>
            <fieldset>
              <legend>Choose one strength</legend>
              <p className="field-note">You can still use the others.</p>
              <div className="strength-grid">
                {story.attributes.map((attribute, index) => (
                  <label
                    className="strength-card"
                    aria-label={`${attribute.label}: ${attribute.description}`}
                    key={attribute.id}
                  >
                    <input
                      type="radio"
                      name="strength"
                      value={attribute.id}
                      defaultChecked={index === 0}
                    />
                    <span className="strength-copy">
                      <strong>{attribute.label}</strong>
                      <span>{attribute.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <StartButton busy={busy} submit />
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
          </form>
        ) : (
          <ConnectionIssueNotice
            status={webMCPStatus}
            onRetry={onRetryConnection}
          />
        )}
      </section>
      <StoryPreview />
    </main>
  );
}

export function BrowserPreview({ title }: { title: string }) {
  return (
    <main className="cover-shell preview-mode">
      <section className="cover-panel" aria-labelledby="preview-title">
        <p className="platform-mark">Once Upon presents</p>
        <p className="eyebrow">Six pages before midnight</p>
        <h1 id="preview-title">{title}</h1>
        <p className="lede">A mystery you play with your AI.</p>
        <p className="sublede">
          Open this page in a WebMCP-enabled AI browser to play.
        </p>
        <StartButton unavailableMessage="WebMCP isn't available in this browser." />
      </section>
      <StoryPreview />
    </main>
  );
}

function StartButton({
  busy = false,
  submit = false,
  unavailableMessage,
}: {
  busy?: boolean;
  submit?: boolean;
  unavailableMessage?: string;
}) {
  const tooltipId = useId();
  const unavailable = Boolean(unavailableMessage);
  return (
    <div className={`start-control${unavailable ? ' is-unavailable' : ''}`}>
      {unavailableMessage ? (
        <StartTooltip id={tooltipId} message={unavailableMessage} />
      ) : null}
      <button
        aria-describedby={unavailable ? tooltipId : undefined}
        className="primary-button"
        disabled={busy || unavailable}
        type={submit ? 'submit' : 'button'}
      >
        {busy ? 'Opening the manuscript…' : 'Start'}
      </button>
    </div>
  );
}

function StartTooltip({ id, message }: { id: string; message: string }) {
  return (
    <span className="start-tooltip" id={id} role="tooltip">
      {message}
    </span>
  );
}
