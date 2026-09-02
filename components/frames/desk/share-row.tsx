'use client';

import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { CopySimpleIcon } from '@phosphor-icons/react/dist/ssr/CopySimple';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
} from '@/lib/manuscript/read-model';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import { useClipboardCopy } from './use-clipboard-copy';

type PublishState = 'idle' | 'publishing' | 'ready' | 'failed';

const SHARE_REQUEST_STORAGE_PREFIX = 'once-upon:share-request:';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function StoryShare({
  experience,
  session,
  onAnnounce,
}: {
  experience: ExperienceDefinition;
  session: ExperienceSession;
  onAnnounce: (message: string) => void;
}) {
  const manuscript = useMemo(
    () => deriveManuscriptReadModel(experience, session),
    [experience, session],
  );
  const requestId = useRef<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publicLink, setPublicLink] = useState('');
  const [error, setError] = useState('');
  const { copied, copy: copyPublicLink } = useClipboardCopy({
    text: publicLink,
    onCopied: () => onAnnounce('The manuscript link was copied.'),
    onFailed: () => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
      onAnnounce(
        'The manuscript link could not be copied. Select it to copy manually.',
      );
    },
  });

  const publish = useCallback(async () => {
    setPublishState('publishing');
    setError('');
    requestId.current ??= shareRequestId(session.sessionId);
    try {
      const response = await fetch('/api/shared-stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          createSharedStorySubmission(manuscript, requestId.current),
        ),
      });
      const result = (await response.json()) as {
        path?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!response.ok || !result.path || !result.expiresAt)
        throw new Error(result.error || 'The copy could not be prepared.');
      const url = new URL(result.path, window.location.origin).toString();
      setPublicLink(url);
      setPublishState('ready');
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : 'The copy could not be prepared.';
      setError(message);
      setPublishState('failed');
      onAnnounce(message);
    }
  }, [manuscript, onAnnounce, session.sessionId]);

  return (
    <div className="ending-share">
      <h2>Pass the manuscript on</h2>
      <p>
        Create an anonymous, unlisted copy that disappears in 30 days. Nothing
        is uploaded until you choose to.
      </p>
      {publicLink ? (
        <div className="public-link-result">
          <label className="sr-only" htmlFor="public-story-link">
            Manuscript copy link
          </label>
          <input
            id="public-story-link"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            ref={linkInputRef}
            value={publicLink}
          />
          <button
            aria-label={
              copied ? 'Manuscript link copied' : 'Copy manuscript link'
            }
            className="inline-copy-action public-link-copy"
            title={copied ? 'Copied' : 'Copy link'}
            type="button"
            onClick={() => void copyPublicLink()}
          >
            {copied ? (
              <CheckIcon aria-hidden="true" size={19} weight="bold" />
            ) : (
              <CopySimpleIcon aria-hidden="true" size={19} />
            )}
          </button>
        </div>
      ) : publishState === 'idle' || publishState === 'failed' ? (
        <div className="ending-share-actions">
          <button
            className="share-button"
            type="button"
            onClick={() => void publish()}
          >
            {publishState === 'failed' ? 'Try again' : 'Create a link'}
          </button>
        </div>
      ) : (
        <div aria-busy="true" className="public-link-result is-loading">
          <span className="public-link-status">Preparing a copy…</span>
          <button
            aria-label="Copy manuscript link"
            className="inline-copy-action public-link-copy"
            disabled
            type="button"
          >
            <CopySimpleIcon aria-hidden="true" size={19} />
          </button>
        </div>
      )}
      {error ? <p className="share-feedback">{error}</p> : null}
    </div>
  );
}

function shareRequestId(sessionId: string): string {
  const fresh = crypto.randomUUID();
  try {
    const key = `${SHARE_REQUEST_STORAGE_PREFIX}${sessionId}`;
    const stored = window.sessionStorage.getItem(key);
    if (stored && UUID_PATTERN.test(stored)) return stored;
    window.sessionStorage.setItem(key, fresh);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
  return fresh;
}
