'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import {
  deriveManuscriptReadModel,
  effectFromReceipt,
  type ManuscriptEffect,
} from '@/lib/manuscript/read-model';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { BackspaceText, backspaceDuration } from './backspace-text';
import { CopyButton } from './copy-button';
import { StoryShare } from './story-share';
import { usePagination } from './use-pagination';
import type { WebMCPSetupHint } from './use-webmcp-connection';
import { WebMCPAvailability } from './webmcp-notices';

export function StoryScroll({
  agentActive,
  experience,
  onAnnounce,
  onPageChange,
  onRetryConnection,
  session,
  webMCPSetupHint,
  webMCPStatus,
}: {
  agentActive: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  onPageChange: (page: number) => void;
  onRetryConnection: () => void;
  session: ExperienceSession;
  webMCPSetupHint: WebMCPSetupHint;
  webMCPStatus: WebMCPStatus;
}) {
  const manuscript = deriveManuscriptReadModel(experience, session);
  const availabilityVisible =
    session.phase !== 'COMPLETE' && webMCPStatus !== 'connected';
  const pendingEffect = resolvePendingEffect(experience, session);
  const latestChapter = manuscript.chapters.at(-1) ?? null;
  const latestChapterId = latestChapter?.id ?? null;
  const latestChapterProse = latestChapter?.prose ?? '';
  const latestChapterTitle = latestChapter?.title ?? '';
  const [endingStage, setEndingStage] = useState<EndingStage>(
    session.phase === 'COMPLETE' ? 'complete' : 'original',
  );
  const typingPlan = useMemo(() => {
    if (!latestChapterId) return null;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return null;
    return buildTypingPlan(
      latestChapterTitle,
      splitProse(latestChapterProse),
      session.phase === 'COMPLETE'
        ? splitProse(manuscript.completionPassage.prose)
        : [],
    );
  }, [
    latestChapterId,
    latestChapterProse,
    latestChapterTitle,
    manuscript.completionPassage.prose,
    session.phase,
  ]);
  const freshReceiptId = useFreshKey(pendingEffect?.receiptId ?? null, 1200);
  const freshChapterId = useFreshKey(
    latestChapterId,
    (typingPlan?.total ?? 0) + 1200,
  );
  const contentKey = [
    manuscript.chapters.length,
    session.phase,
    endingStage,
    pendingEffect?.receiptId ?? '',
    webMCPStatus,
  ].join(':');
  const {
    pagerRef,
    page,
    pageCount,
    goToPage,
    goToLastPage,
    goToPrevious,
    goToNext,
    getCurrentPage,
    pageAt,
    reflowTo,
    measure,
  } = usePagination({ navigationEnabled: !availabilityVisible });
  const handlePaginatedLayoutChange = useCallback(
    (anchor: Element | null) => reflowTo(anchor),
    [reflowTo],
  );
  const freshArticleRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const firstContentKey = useRef(true);
  const previousLatestId = useRef<string | null>(null);
  const previousWebMCPStatus = useRef(webMCPStatus);
  const previousPhase = useRef(session.phase);

  useEffect(() => {
    onPageChange(page);
  }, [onPageChange, page]);

  useEffect(() => {
    const enteredComplete =
      previousPhase.current !== 'COMPLETE' && session.phase === 'COMPLETE';
    previousPhase.current = session.phase;
    if (session.phase !== 'COMPLETE') {
      setEndingStage('original');
      return;
    }
    if (!enteredComplete) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reducedMotion || !typingPlan) {
      setEndingStage('complete');
      onAnnounce('The record revises its wording.');
      return;
    }

    const paragraphs = splitProse(manuscript.completionPassage.prose);
    const recordParagraphs = splitProse(
      manuscript.completionPassage.recordProse,
    );
    const originalEnding = paragraphs.at(-1) ?? '';
    const replacementEnding = recordParagraphs.at(-1) ?? originalEnding;
    setEndingStage('original');
    const rewriteAt = typingPlan.total + 900;
    const rewriteTimer = window.setTimeout(() => {
      setEndingStage('rewriting');
      onAnnounce('The record revises its wording.');
    }, rewriteAt);
    const completeTimer = window.setTimeout(
      () => setEndingStage('complete'),
      rewriteAt + backspaceDuration(originalEnding, replacementEnding) + 100,
    );
    return () => {
      window.clearTimeout(rewriteTimer);
      window.clearTimeout(completeTimer);
    };
  }, [
    manuscript.completionPassage.prose,
    manuscript.completionPassage.recordProse,
    onAnnounce,
    session.phase,
    typingPlan,
  ]);

  // Swapping the trailing guide widgets (availability notice, turn guide)
  // changes the flow's width but is no reason to turn the page under the
  // reader; refresh the page count only.
  useEffect(() => {
    measure();
  }, [agentActive, measure, webMCPStatus]);

  // One place decides where the record turns to. A newly typed entry is
  // followed like paper feeding through the machine: start at the entry's
  // first page, ride the typing head with a single block caret, advance
  // when the head crosses onto the next page, and finish on the last page
  // where the next prompt waits. Everything else turns straight to the end.
  useEffect(() => {
    measure();
    const chapterArrived = latestChapter?.id !== previousLatestId.current;
    const webMCPStatusChanged = webMCPStatus !== previousWebMCPStatus.current;
    previousLatestId.current = latestChapter?.id ?? null;
    previousWebMCPStatus.current = webMCPStatus;
    if (firstContentKey.current) {
      firstContentKey.current = false;
      return;
    }
    if (webMCPStatusChanged && !chapterArrived) return;
    if (endingStage !== 'original') {
      goToLastPage();
      return;
    }
    const article = freshArticleRef.current;
    if (!freshChapterId || !typingPlan || !article) {
      // A brand-new chapter renders its fresh typing pass one commit
      // later; wait for that run instead of turning to the end now.
      if (!(chapterArrived && typingPlan)) goToLastPage();
      return;
    }
    const startPage = pageAt(article);
    goToPage(startPage);
    const caret = caretRef.current;
    const pager = pagerRef.current;
    const sheet = pager?.closest('.manuscript');
    const startedAt = performance.now();
    const spans =
      article.parentElement?.querySelectorAll<HTMLElement>(
        '.story-chapter.is-fresh .tw-char, .completion-passage.is-fresh .tw-char',
      ) ?? [];
    let frame = 0;
    let headPage = startPage;
    let head: HTMLElement | null = null;
    let cursor = 0;
    let lastPageCheck = 0;
    let placedHead: HTMLElement | null = null;
    let turnSettlesAt = 0;

    const hideCaret = () => {
      if (caret) caret.hidden = true;
    };

    const loop = (now: number) => {
      const elapsed = performance.now() - startedAt;
      while (cursor < spans.length) {
        const next = spans[cursor];
        if (parseFloat(next.style.getPropertyValue('--td')) > elapsed) break;
        head = next;
        cursor += 1;
      }
      // Layout reads only when the head moved or a page turn is still
      // settling; idle frames (punctuation pauses) cost nothing.
      if (
        head &&
        caret &&
        pager &&
        sheet &&
        (head !== placedHead || now < turnSettlesAt)
      ) {
        placedHead = head;
        const headRect = head.getBoundingClientRect();
        const pagerRect = pager.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const onScreen =
          headRect.right >= pagerRect.left - 1 &&
          headRect.right <= pagerRect.right + 1;
        caret.hidden = !onScreen;
        if (onScreen) {
          caret.style.transform = `translate(${headRect.right - sheetRect.left}px, ${headRect.top - sheetRect.top}px)`;
        }
      }
      if (head && now - lastPageCheck > 500) {
        lastPageCheck = now;
        const nextPage = pageAt(head);
        if (nextPage !== headPage) {
          // Follow only while the reader is still on the page the typing
          // head just left; a manual turn takes priority.
          if (getCurrentPage() === headPage) {
            goToPage(nextPage);
            turnSettlesAt = now + 800;
          }
          headPage = nextPage;
        }
      }
      if (elapsed > typingPlan.total + 400) {
        hideCaret();
        goToLastPage();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      hideCaret();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, freshChapterId]);

  return (
    <section className="manuscript" aria-label="The living manuscript">
      <header className="sheet-head">
        <span>Record of proceedings</span>
        <span className="sheet-page-indicator">
          Sheet {String(page + 1).padStart(2, '0')} of{' '}
          {String(pageCount).padStart(2, '0')}
        </span>
      </header>
      {/* The window clips the rolling pager so sheets feed through the
          platen instead of sliding over the running head or off the paper. */}
      <div className="sheet-window">
        <div
          aria-hidden={availabilityVisible || undefined}
          className="sheet-pager"
          inert={availabilityVisible}
          ref={pagerRef}
        >
          <div className="sheet-flow">
            {manuscript.chapters.map((chapter, index) => {
              const fresh = chapter.id === freshChapterId;
              return (
                <ChapterBlock
                  articleRef={fresh ? freshArticleRef : undefined}
                  chapter={chapter}
                  chapterIndex={index}
                  key={chapter.id}
                  plan={fresh && endingStage === 'original' ? typingPlan : null}
                />
              );
            })}

            {pendingEffect ? (
              <EffectPresentation
                effect={pendingEffect}
                fresh={pendingEffect.receiptId === freshReceiptId}
              />
            ) : null}

            {session.phase === 'COMPLETE' ? (
              <CompletionPassageBlock
                passage={manuscript.completionPassage}
                plan={
                  freshChapterId && endingStage === 'original'
                    ? typingPlan?.completionParagraphs
                    : null
                }
                stage={endingStage}
              />
            ) : null}

            {session.phase === 'READY' && webMCPStatus === 'connected' ? (
              <TurnGuide
                agentActive={agentActive}
                experience={experience}
                onAnnounce={onAnnounce}
                session={session}
              />
            ) : null}
            {session.phase === 'AWAITING_CHAPTER' &&
            webMCPStatus === 'connected' ? (
              <PendingTurnGuide
                agentActive={agentActive}
                experience={experience}
                onAnnounce={onAnnounce}
                session={session}
              />
            ) : null}
            {session.phase === 'COMPLETE' && endingStage === 'complete' ? (
              <footer className="manuscript-ending">
                <StoryShare
                  experience={experience}
                  onAnnounce={onAnnounce}
                  onLayoutChange={handlePaginatedLayoutChange}
                  session={session}
                />
              </footer>
            ) : null}
          </div>
          {/* Multicol column boxes are anonymous and cannot carry
            scroll-snap-align; these invisible rails give the pager one
            native snap area per page instead. */}
          <div aria-hidden="true" className="snap-rails">
            {Array.from({ length: pageCount }, (_, index) => (
              <div
                key={index}
                style={{ '--page-index': index } as CSSProperties}
              />
            ))}
          </div>
        </div>
        {availabilityVisible ? (
          <WebMCPAvailability
            onAnnounce={onAnnounce}
            onRetry={onRetryConnection}
            setupHint={webMCPSetupHint}
            status={webMCPStatus}
          />
        ) : null}
      </div>
      <div aria-hidden="true" className="typing-caret" hidden ref={caretRef} />
      <div
        className="sheet-controls"
        data-navigation-disabled={availabilityVisible || undefined}
      >
        <button
          aria-label="Previous page"
          disabled={availabilityVisible || page === 0}
          onClick={goToPrevious}
          type="button"
        >
          ‹
        </button>
        <button
          aria-label="Next page"
          disabled={availabilityVisible || page >= pageCount - 1}
          onClick={goToNext}
          type="button"
        >
          ›
        </button>
      </div>
    </section>
  );
}

function TurnGuide({
  agentActive,
  experience,
  onAnnounce,
  session,
}: {
  agentActive: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  session: ExperienceSession;
}) {
  const opening = session.chapters.length === 1;

  return (
    <div className="turn-guide" id="your-turn">
      <h2 className="turn-guide-prompt">
        {agentActive
          ? opening
            ? 'What do you inspect first?'
            : 'What do you do next?'
          : opening
            ? 'The speaker is waiting.'
            : 'The room is waiting.'}
      </h2>
      {!agentActive ? (
        <AgentHandoff
          experience={experience}
          mode={opening ? 'start' : 'resume'}
          onAnnounce={onAnnounce}
        />
      ) : null}
    </div>
  );
}

function PendingTurnGuide({
  agentActive,
  experience,
  onAnnounce,
  session,
}: {
  agentActive: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  session: ExperienceSession;
}) {
  if (agentActive)
    return (
      <div className="writing-marker">
        <span aria-hidden="true" />
        <p>
          {session.pendingTurn?.kind === 'interaction'
            ? 'The page has changed. Waiting for your agent to add the next chapter…'
            : 'Your move is saved. Waiting for your agent to add the next chapter…'}
        </p>
      </div>
    );

  return (
    <div className="turn-guide pending-turn-guide" id="your-turn">
      <h2 className="turn-guide-prompt">The page is unfinished.</h2>
      <AgentHandoff
        experience={experience}
        mode="recover"
        onAnnounce={onAnnounce}
      />
    </div>
  );
}

function AgentHandoff({
  experience,
  mode,
  onAnnounce,
}: {
  experience: ExperienceDefinition;
  mode: 'start' | 'resume' | 'recover';
  onAnnounce: (message: string) => void;
}) {
  const message = handoffMessage(experience, mode);
  return (
    <div className="agent-handoff">
      <p className="agent-handoff-instruction">
        {mode === 'recover'
          ? 'Your move is already here. Ask your agent to finish the chapter.'
          : mode === 'start'
            ? 'Tell your agent what you inspect before you answer.'
            : 'Tell your agent what you do next.'}
      </p>
      <div className="agent-handoff-example">
        <p>{message}</p>
        <CopyButton
          className="handoff-copy-button"
          iconOnly
          idleLabel="Copy example message"
          onCopied={() =>
            onAnnounce(
              mode === 'recover'
                ? 'Resume message copied.'
                : 'Story starter copied. You can replace its final move when you message your agent.',
            )
          }
          onCopyFailed={() =>
            onAnnounce(
              'Copy failed. The message is selected for manual copying.',
            )
          }
          text={message}
        />
      </div>
    </div>
  );
}

function handoffMessage(
  experience: ExperienceDefinition,
  mode: 'start' | 'resume' | 'recover',
): string {
  if (mode === 'start') return experience.startMessage;
  if (mode === 'recover')
    return `Resume ${experience.title} with me through this page. Finish the saved turn first.`;
  return `Resume ${experience.title} with me through this page. I inspect what has changed in the room.`;
}

function ChapterBlock({
  articleRef,
  chapter,
  chapterIndex,
  plan = null,
}: {
  articleRef?: RefObject<HTMLElement | null>;
  chapter: ReturnType<typeof deriveManuscriptReadModel>['chapters'][number];
  chapterIndex: number;
  plan?: TypingPlan | null;
}) {
  const paragraphs = splitProse(chapter.prose);
  return (
    <article
      className={`story-chapter${plan ? ' is-fresh' : ''}`}
      ref={articleRef}
    >
      <p className="chapter-number">
        {chapterIndex === 0 ? 'Prologue' : `Chapter ${chapterIndex}`}
      </p>
      <h2>
        {plan ? (
          <TypedText chars={plan.title} text={chapter.title} />
        ) : (
          chapter.title
        )}
      </h2>
      {chapter.effect ? <EffectPresentation effect={chapter.effect} /> : null}
      {paragraphs.map((paragraph, index) => (
        <p key={`${chapter.id}-paragraph-${index}`}>
          {plan?.paragraphs[index] ? (
            <TypedText chars={plan.paragraphs[index]} text={paragraph} />
          ) : (
            paragraph
          )}
        </p>
      ))}
    </article>
  );
}

function CompletionPassageBlock({
  passage,
  plan,
  stage,
}: {
  passage: { prose: string; recordProse: string };
  plan: number[][] | null | undefined;
  stage: EndingStage;
}) {
  const paragraphs = splitProse(passage.prose);
  const recordParagraphs = splitProse(passage.recordProse);
  const lastIndex = paragraphs.length - 1;
  return (
    <section
      aria-label="Completion"
      className={`completion-passage${plan ? ' is-fresh' : ''}`}
    >
      {paragraphs.map((original, index) => (
        <p key={index}>
          {index === lastIndex && stage === 'rewriting' ? (
            <BackspaceText
              original={original}
              replacement={recordParagraphs[index] ?? original}
            />
          ) : index === lastIndex && stage === 'complete' ? (
            (recordParagraphs[index] ?? original)
          ) : plan?.[index] ? (
            <TypedText chars={plan[index]} text={original} />
          ) : (
            original
          )}
        </p>
      ))}
    </section>
  );
}

/**
 * Renders text as one span per character so a committed entry can be
 * hammered onto the page at typing speed. The full text is in the DOM
 * from the first frame; only its visibility is scheduled.
 */
function TypedText({
  chars,
  text,
}: {
  chars: ReadonlyArray<number>;
  text: string;
}) {
  return (
    <>
      {Array.from(text).map((character, index) => (
        <span
          className="tw-char"
          key={index}
          style={{ '--td': `${chars[index] ?? 0}ms` } as CSSProperties}
        >
          {character}
        </span>
      ))}
    </>
  );
}

function EffectPresentation({
  effect,
  fresh = false,
}: {
  effect: ManuscriptEffect;
  fresh?: boolean;
}) {
  if (effect.presentation === 'memory_flashback')
    return <MemoryFlashback effect={effect} fresh={fresh} />;
  if (effect.presentation === 'pressed_writing')
    return <PressedWritingArtifact effect={effect} fresh={fresh} />;
  if (effect.presentation === 'world_shift')
    return <WorldShift effect={effect} />;
  return <GenericStoryEffect effect={effect} />;
}

function MemoryFlashback({
  effect,
  fresh,
}: {
  effect: ManuscriptEffect;
  fresh: boolean;
}) {
  const memory = effect.facts.find(
    ({ id }) => id === 'north_station_flashback',
  );
  if (!memory) return null;
  return (
    <section
      className={`memory-flashback${fresh ? ' is-fresh' : ''}`}
      data-effect-receipt={effect.receiptId}
    >
      <h3>Memory</h3>
      <div className="memory-flashback-prose">
        {factParagraphs(memory.value).map((paragraph, index) => (
          <p key={`${effect.receiptId}-memory-${index}`}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

function PressedWritingArtifact({
  effect,
  fresh = false,
}: {
  effect: ManuscriptEffect;
  fresh?: boolean;
}) {
  return (
    <figure
      className={`story-artifact notepad-artifact${fresh ? ' is-revealed' : ''}`}
    >
      <figcaption>{effect.title}</figcaption>
      {effect.facts.map((fact) => {
        const { lead, note } = factLines(fact.value);
        return (
          <div key={fact.id}>
            <p className="revealed-fragment">{lead}</p>
            {note ? <p>{note}</p> : null}
          </div>
        );
      })}
    </figure>
  );
}

function WorldShift({ effect }: { effect: ManuscriptEffect }) {
  return (
    <section className="world-shift" data-effect-receipt={effect.receiptId}>
      <h3>{effect.title}</h3>
      {effect.facts.flatMap((fact) => {
        return factParagraphs(fact.value).map((paragraph, index) => (
          <p key={`${fact.id}-paragraph-${index}`}>{paragraph}</p>
        ));
      })}
    </section>
  );
}

function GenericStoryEffect({ effect }: { effect: ManuscriptEffect }) {
  return (
    <section className="story-artifact generic-story-effect">
      <h3>{effect.title}</h3>
      {effectParagraphs(effect).map((paragraph, index) => (
        <p key={`${effect.receiptId}-effect-${index}`}>{paragraph}</p>
      ))}
    </section>
  );
}

function resolvePendingEffect(
  experience: ExperienceDefinition,
  session: ExperienceSession,
): ManuscriptEffect | null {
  const receipt = session.pendingTurn?.effectReceipt;
  if (!receipt) return null;
  return effectFromReceipt(experience, receipt);
}

function useFreshKey(key: string | null, ttl: number): string | null {
  const previousKey = useRef(key);
  const ttlRef = useRef(ttl);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  useEffect(() => {
    ttlRef.current = ttl;
  }, [ttl]);

  useEffect(() => {
    if (key && key !== previousKey.current) setFreshKey(key);
    previousKey.current = key;
  }, [key]);

  useEffect(() => {
    if (!freshKey) return;
    // Keep the class on until this key's arrival animation finishes.
    const timeout = window.setTimeout(() => setFreshKey(null), ttlRef.current);
    return () => window.clearTimeout(timeout);
  }, [freshKey]);

  return freshKey;
}

const TYPE_MS = 22;

type TypingPlan = {
  title: number[];
  paragraphs: number[][];
  completionParagraphs: number[][];
  total: number;
};

type EndingStage = 'original' | 'rewriting' | 'complete';

function splitProse(prose: string): string[] {
  return prose.split(/\n\s*\n/);
}

/**
 * Schedules every character of a committed entry at real typing speed
 * (~45 characters a second), with an uneven hand and pauses after
 * punctuation and between paragraphs.
 */
function buildTypingPlan(
  title: string,
  paragraphs: string[],
  completionParagraphs: string[],
): TypingPlan {
  let elapsed = 0;
  let index = 0;
  const schedule = (text: string) => {
    const chars: number[] = [];
    for (const character of text) {
      chars.push(elapsed);
      elapsed += TYPE_MS + ((index * 7919) % 13) + pauseAfter(character);
      index += 1;
    }
    return chars;
  };
  const titleChars = schedule(title);
  elapsed += 450;
  const paragraphChars = paragraphs.map((paragraph) => {
    const chars = schedule(paragraph);
    elapsed += 450;
    return chars;
  });
  const completionChars = completionParagraphs.map((paragraph) => {
    const chars = schedule(paragraph);
    elapsed += 450;
    return chars;
  });
  return {
    title: titleChars,
    paragraphs: paragraphChars,
    completionParagraphs: completionChars,
    total: elapsed,
  };
}

function pauseAfter(character: string): number {
  if ('.?!'.includes(character)) return 260;
  if (',;:'.includes(character)) return 130;
  return 0;
}

function effectParagraphs(effect: ManuscriptEffect): string[] {
  return effect.facts.flatMap(({ value }) => factParagraphs(value));
}

function factParagraphs(value: string): string[] {
  return value
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

function factLines(value: string): { lead: string; note: string | null } {
  const [lead, ...rest] = value.split('\n');
  const note = rest.join(' ').trim();
  return { lead: lead.trim(), note: note || null };
}
