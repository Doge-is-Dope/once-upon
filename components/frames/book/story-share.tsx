'use client';

import { useMemo, useRef, useState } from 'react';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
  manuscriptToText,
} from '@/lib/manuscript/read-model';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import { copyText } from './copy-button';

type PublishState = 'idle' | 'publishing' | 'published' | 'failed';

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
  const text = useMemo(() => manuscriptToText(manuscript), [manuscript]);
  const requestId = useRef(crypto.randomUUID());
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publicLink, setPublicLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  const copyStory = async () => {
    try {
      await copyText(text);
      onAnnounce('The complete story was copied.');
    } catch {
      onAnnounce('The story could not be copied.');
    }
  };

  const downloadStory = () => {
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'the-last-manuscript.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    onAnnounce('The complete story was downloaded as a text file.');
  };

  const shareLink = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: manuscript.title, url });
        onAnnounce('The public story link was shared.');
        return;
      } catch (shareError) {
        if (
          shareError instanceof DOMException &&
          shareError.name === 'AbortError'
        )
          return;
      }
    }
    try {
      await copyText(url);
      onAnnounce('The public story link was copied.');
    } catch {
      onAnnounce('The public link is ready, but it could not be copied.');
    }
  };

  const publish = async () => {
    if (publicLink) {
      await shareLink(publicLink);
      return;
    }
    setPublishState('publishing');
    setError('');
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
        throw new Error(
          result.error || 'The public link could not be created.',
        );
      const url = new URL(result.path, window.location.origin).toString();
      setPublicLink(url);
      setExpiresAt(result.expiresAt);
      setPublishState('published');
      onAnnounce('A public link was created for the complete manuscript.');
      await shareLink(url);
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : 'The public link could not be created.';
      setError(message);
      setPublishState('failed');
      onAnnounce(message);
    }
  };

  return (
    <div className="ending-share">
      <p className="ending-kicker">Your complete manuscript</p>
      <h2>Keep it private, or publish one unlisted copy.</h2>
      <p>
        Creating a public link uploads the complete manuscript. Anyone with the
        link can read it for 30 days. It cannot be edited or continued.
      </p>
      <div className="ending-share-actions">
        <button type="button" onClick={() => void copyStory()}>
          Copy story
        </button>
        <button type="button" onClick={downloadStory}>
          Download .txt
        </button>
        <button
          className="share-button"
          disabled={publishState === 'publishing'}
          type="button"
          onClick={() => void publish()}
        >
          {publishState === 'publishing'
            ? 'Creating link…'
            : publicLink
              ? 'Share public link'
              : 'Create a public link'}
        </button>
      </div>
      {publicLink ? (
        <div className="public-link-result">
          <a href={publicLink}>{publicLink}</a>
          <p>
            Expires{' '}
            <time dateTime={expiresAt}>
              {new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(
                new Date(expiresAt),
              )}
            </time>
            .
          </p>
        </div>
      ) : null}
      {error ? <p className="share-feedback">{error}</p> : null}
    </div>
  );
}
