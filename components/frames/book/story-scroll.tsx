'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { availableInteractions } from '@/lib/runtime/engine';
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
import { CopyButton } from './copy-button';
import { RevisedText, revisionDuration } from './revised-text';
import { StoryShare } from './story-share';
import { usePagination } from './use-pagination';
import { WebMCPAvailability } from './webmcp-notices';

export function StoryScroll({
  agentActive,
  experience,
  onAnnounce,
  onRetryConnection,
  session,
  webMCPStatus,
}: {
  agentActive: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  onRetryConnection: () => void;
  session: ExperienceSession;
  webMCPStatus: WebMCPStatus;
}) {
  const manuscript = deriveManuscriptReadModel(experience, session);
  const pendingEffect = resolvePendingEffect(experience, session);
  const latestChapter = manuscript.chapters.at(-1) ?? null;
  const latestChapterId = latestChapter?.id ?? null;
  const latestChapterProse = latestChapter?.prose ?? '';
  const latestChapterTitle = latestChapter?.title ?? '';
  const [revisionStage, setRevisionStage] = useState<RevisionStage>(
    session.phase === 'COMPLETE' ? 'all' : 'original',
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
    revisionStage,
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
    measure,
  } = usePagination();
  const freshArticleRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const firstContentKey = useRef(true);
  const previousLatestId = useRef<string | null>(null);
  const previousWebMCPStatus = useRef(webMCPStatus);
  const previousPhase = useRef(session.phase);

  useEffect(() => {
    const enteredComplete =
      previousPhase.current !== 'COMPLETE' && session.phase === 'COMPLETE';
    previousPhase.current = session.phase;
    if (session.phase !== 'COMPLETE') {
      setRevisionStage('original');
      return;
    }
    if (!enteredComplete) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reducedMotion || !typingPlan) {
      setRevisionStage('all');
      onAnnounce('The record revises its wording.');
      return;
    }

    setRevisionStage('original');
    const reviseAt = typingPlan.total + 900;
    const currentTimer = window.setTimeout(() => {
      setRevisionStage('current');
      onAnnounce('The record revises its wording.');
    }, reviseAt);
    const allTimer = window.setTimeout(
      () => setRevisionStage('all'),
      reviseAt +
        passageRevisionDuration(
          manuscript.completionPassage.prose,
          manuscript.completionPassage.recordProse,
        ),
    );
    return () => {
      window.clearTimeout(currentTimer);
      window.clearTimeout(allTimer);
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
    if (revisionStage !== 'original') {
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
        <div className="sheet-pager" ref={pagerRef}>
        <div className="sheet-flow">
          {manuscript.chapters.map((chapter, index) => {
            const fresh = chapter.id === freshChapterId;
            return (
              <ChapterBlock
                articleRef={fresh ? freshArticleRef : undefined}
                chapter={chapter}
                chapterIndex={index}
                key={chapter.id}
                plan={fresh && revisionStage === 'original' ? typingPlan : null}
                revised={revisionStage === 'all'}
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
              animateRevision={revisionStage === 'current'}
              passage={manuscript.completionPassage}
              plan={
                freshChapterId && revisionStage === 'original'
                  ? typingPlan?.completionParagraphs
                  : null
              }
              revised={revisionStage !== 'original'}
            />
          ) : null}

          {session.phase !== 'COMPLETE' && webMCPStatus !== 'connected' ? (
            <WebMCPAvailability
              onRetry={onRetryConnection}
              status={webMCPStatus}
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
          {session.phase === 'COMPLETE' && revisionStage === 'all' ? (
            <footer className="manuscript-ending">
              <StoryShare
                experience={experience}
                onAnnounce={onAnnounce}
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
      <div aria-hidden="true" className="typing-caret" hidden ref={caretRef} />
      <div className="sheet-controls">
        <button
          aria-label="Previous page"
          disabled={page === 0}
          onClick={goToPrevious}
          type="button"
        >
          ‹
        </button>
        <button
          aria-label="Next page"
          disabled={page >= pageCount - 1}
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
  const interaction = availableInteractions(experience, session)[0];
  const hint = interaction
    ? interaction.cue
    : opening
      ? 'Look closer at something already on the page, speak to someone, or test a way forward.'
      : 'Follow a detail from the latest chapter, revisit an earlier clue, or try something unexpected.';

  return (
    <div className="turn-guide" id="your-turn">
      <p className="turn-guide-kicker">Your turn</p>
      <p className="turn-guide-prompt">
        {agentActive
          ? opening
            ? 'What do you do?'
            : 'What do you do next?'
          : opening
            ? 'Start with one move.'
            : 'Continue with one move.'}
      </p>
      {!agentActive ? (
        <AgentHandoff
          experience={experience}
          mode={opening ? 'start' : 'resume'}
          onAnnounce={onAnnounce}
        />
      ) : null}
      <details className="story-hint">
        <summary>Need a hint?</summary>
        <p>{hint}</p>
      </details>
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
      <p className="turn-guide-kicker">Saved turn</p>
      <p className="turn-guide-prompt">Resume the unfinished chapter.</p>
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
          ? 'Send one short message to your agent to finish the turn already saved on this page.'
          : 'Tell your agent what you do in one message. The page handles the story rules.'}
      </p>
      <blockquote className="agent-handoff-example">
        <p>{message}</p>
      </blockquote>
      <div className="agent-handoff-actions">
        <CopyButton
          className="handoff-copy-button"
          idleLabel="Copy this example"
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
        <p>Copying is optional — the same idea works in your own words.</p>
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
  revised = false,
}: {
  articleRef?: RefObject<HTMLElement | null>;
  chapter: ReturnType<typeof deriveManuscriptReadModel>['chapters'][number];
  chapterIndex: number;
  plan?: TypingPlan | null;
  revised?: boolean;
}) {
  const paragraphs = splitProse(chapter.prose);
  const recordParagraphs = splitProse(chapter.recordProse);
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
      {chapter.effect ? (
        <EffectPresentation effect={chapter.effect} revised={revised} />
      ) : null}
      {paragraphs.map((paragraph, index) => (
        <p key={`${chapter.id}-paragraph-${index}`}>
          {revised ? (
            <RevisedText
              original={paragraph}
              record={recordParagraphs[index] ?? paragraph}
            />
          ) : plan?.paragraphs[index] ? (
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
  animateRevision,
  passage,
  plan,
  revised,
}: {
  animateRevision: boolean;
  passage: { prose: string; recordProse: string };
  plan: number[][] | null | undefined;
  revised: boolean;
}) {
  const paragraphs = splitProse(passage.prose);
  const recordParagraphs = splitProse(passage.recordProse);
  const revisions = paragraphs.map((original, index) => {
    const record = recordParagraphs[index] ?? original;
    const delayOffset = animateRevision
      ? paragraphs
          .slice(0, index)
          .reduce(
            (duration, preceding, beforeIndex) =>
              duration +
              revisionDuration(
                preceding,
                recordParagraphs[beforeIndex] ?? preceding,
              ),
            0,
          )
      : 0;
    return { original, record, delayOffset };
  });
  return (
    <section
      aria-label="Completion"
      className={`completion-passage${plan ? ' is-fresh' : ''}`}
    >
      {revisions.map(({ original, record, delayOffset: delay }, index) => (
        <p key={index}>
          {revised ? (
            <RevisedText
              animate={animateRevision}
              delayOffset={delay}
              original={original}
              record={record}
            />
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
  revised = false,
}: {
  effect: ManuscriptEffect;
  fresh?: boolean;
  revised?: boolean;
}) {
  if (effect.presentation === 'memory_flashback')
    return <MemoryFlashback effect={effect} fresh={fresh} revised={revised} />;
  if (effect.presentation === 'pressed_writing')
    return (
      <PressedWritingArtifact effect={effect} fresh={fresh} revised={revised} />
    );
  if (effect.presentation === 'world_shift')
    return <WorldShift effect={effect} revised={revised} />;
  return <GenericStoryEffect effect={effect} revised={revised} />;
}

function MemoryFlashback({
  effect,
  fresh,
  revised,
}: {
  effect: ManuscriptEffect;
  fresh: boolean;
  revised: boolean;
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
          <p key={`${effect.receiptId}-memory-${index}`}>
            {revised ? (
              <RevisedText
                original={paragraph}
                record={factParagraphs(memory.recordValue)[index] ?? paragraph}
              />
            ) : (
              paragraph
            )}
          </p>
        ))}
      </div>
    </section>
  );
}

function PressedWritingArtifact({
  effect,
  fresh = false,
  revised = false,
}: {
  effect: ManuscriptEffect;
  fresh?: boolean;
  revised?: boolean;
}) {
  return (
    <figure
      className={`story-artifact notepad-artifact${fresh ? ' is-revealed' : ''}`}
    >
      <figcaption>{effect.title}</figcaption>
      {effect.facts.map((fact) => {
        const { lead, note } = factLines(fact.value);
        const record = factLines(fact.recordValue);
        return (
          <div key={fact.id}>
            <p className="revealed-fragment">
              {revised ? (
                <RevisedText original={lead} record={record.lead} />
              ) : (
                lead
              )}
            </p>
            {note ? (
              <p>
                {revised ? (
                  <RevisedText original={note} record={record.note ?? note} />
                ) : (
                  note
                )}
              </p>
            ) : null}
          </div>
        );
      })}
    </figure>
  );
}

function WorldShift({
  effect,
  revised,
}: {
  effect: ManuscriptEffect;
  revised: boolean;
}) {
  return (
    <section className="world-shift" data-effect-receipt={effect.receiptId}>
      <h3>{effect.title}</h3>
      {effect.facts.flatMap((fact) => {
        const recordParagraphs = factParagraphs(fact.recordValue);
        return factParagraphs(fact.value).map((paragraph, index) => (
          <p key={`${fact.id}-paragraph-${index}`}>
            {revised ? (
              <RevisedText
                original={paragraph}
                record={recordParagraphs[index] ?? paragraph}
              />
            ) : (
              paragraph
            )}
          </p>
        ));
      })}
    </section>
  );
}

function GenericStoryEffect({
  effect,
  revised,
}: {
  effect: ManuscriptEffect;
  revised: boolean;
}) {
  return (
    <section className="story-artifact generic-story-effect">
      <h3>{effect.title}</h3>
      {effectParagraphs(effect).map((paragraph, index) => (
        <p key={`${effect.receiptId}-effect-${index}`}>
          {revised ? (
            <RevisedText
              original={paragraph.original}
              record={paragraph.record}
            />
          ) : (
            paragraph.original
          )}
        </p>
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

type RevisionStage = 'original' | 'current' | 'all';

function splitProse(prose: string): string[] {
  return prose.split(/\n\s*\n/);
}

function passageRevisionDuration(prose: string, recordProse: string): number {
  const recordParagraphs = splitProse(recordProse);
  return splitProse(prose).reduce(
    (duration, paragraph, index) =>
      duration +
      revisionDuration(paragraph, recordParagraphs[index] ?? paragraph),
    0,
  );
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

function effectParagraphs(
  effect: ManuscriptEffect,
): Array<{ original: string; record: string }> {
  return effect.facts.flatMap(({ value, recordValue }) => {
    const record = factParagraphs(recordValue);
    return factParagraphs(value).map((original, index) => ({
      original,
      record: record[index] ?? original,
    }));
  });
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
