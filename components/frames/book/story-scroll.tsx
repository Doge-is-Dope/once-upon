'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import {
  deriveManuscriptReadModel,
  effectFromReceipt,
  type ManuscriptEffect,
} from '@/lib/manuscript/read-model';
import {
  flattenParagraphBlocks,
  resolveRecordedEnding,
  splitParagraphBlocks,
} from '@/lib/manuscript/prose';
import { redactParagraphs } from '@/lib/manuscript/redaction';
import {
  buildTypingPlan,
  splitTypingTokens,
  type TypingPlan,
  type WordTiming,
} from '@/lib/manuscript/typing-plan';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { BackspaceText, backspaceDuration } from './backspace-text';
import { CopyButton } from './copy-button';
import { StoryShare } from './story-share';
import { usePagination } from './use-pagination';
import type { AgentFailure, WebMCPSetupHint } from './use-webmcp-connection';
import { WebMCPAvailability } from './webmcp-notices';

type EndingStage = 'original' | 'rewriting' | 'complete';

export function StoryScroll({
  agentActive,
  agentFailure = null,
  agentQuiet = false,
  agentRunning = false,
  experience,
  onAnnounce,
  onPageChange,
  onTypingChange,
  pageNavigationEnabled,
  onRetryConnection,
  session,
  webMCPSetupHint,
  webMCPStatus,
}: {
  agentActive: boolean;
  agentFailure?: AgentFailure | null;
  agentQuiet?: boolean;
  agentRunning?: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  onPageChange: (page: number) => void;
  onTypingChange?: (typing: boolean) => void;
  pageNavigationEnabled: boolean;
  onRetryConnection: () => void;
  session: ExperienceSession;
  webMCPSetupHint: WebMCPSetupHint;
  webMCPStatus: WebMCPStatus;
}) {
  const manuscript = useMemo(
    () => deriveManuscriptReadModel(experience, session),
    [experience, session],
  );
  const availabilityVisible =
    session.phase !== 'COMPLETE' && webMCPStatus !== 'connected';
  const pendingEffect = resolvePendingEffect(experience, session);
  const pendingReceiptId = pendingEffect?.receiptId ?? null;
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
      splitParagraphBlocks(latestChapterProse),
      session.phase === 'COMPLETE'
        ? splitParagraphBlocks(manuscript.completionPassage.prose)
        : [],
    );
  }, [
    latestChapterId,
    latestChapterProse,
    latestChapterTitle,
    manuscript.completionPassage.prose,
    session.phase,
  ]);
  const { key: freshReceiptId } = useFreshKey(pendingReceiptId, 1200);
  const { key: freshChapterId, clear: settleFreshChapter } = useFreshKey(
    latestChapterId,
    (typingPlan?.total ?? 0) + 1200,
  );
  // The page is "typing" while the newest entry is still being revealed.
  // The next-move prompt, the hint, and the ending choreography all wait
  // for this to end so chat and page do not compete for the reader.
  const typingActive =
    freshChapterId !== null &&
    typingPlan !== null &&
    endingStage === 'original';
  const [newPagesAhead, setNewPagesAhead] = useState(false);
  const contentKey = [
    manuscript.chapters.length,
    session.phase,
    endingStage,
    pendingReceiptId ?? '',
    webMCPStatus,
    typingActive ? 'typing' : 'settled',
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
  } = usePagination({
    navigationEnabled: pageNavigationEnabled && !availabilityVisible,
  });
  const handlePaginatedLayoutChange = useCallback(
    (anchor: Element | null) => reflowTo(anchor),
    [reflowTo],
  );
  const freshArticleRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const firstContentKey = useRef(true);
  const previousLatestId = useRef<string | null>(null);
  const previousReceiptId = useRef<string | null>(null);
  const previousWebMCPStatus = useRef(webMCPStatus);
  const previousPhase = useRef(session.phase);
  const previousTypingActive = useRef(typingActive);
  const previousTurnPhase = useRef(session.phase);
  // True while the reader is still on the page the typing head occupies;
  // a manual turn away hands control back to the reader.
  const followingHead = useRef(true);
  const endingTimers = useRef<number[]>([]);

  useEffect(() => {
    onPageChange(page);
  }, [onPageChange, page]);

  useEffect(() => {
    onTypingChange?.(typingActive);
  }, [onTypingChange, typingActive]);

  useEffect(() => {
    if (page >= pageCount - 1) setNewPagesAhead(false);
  }, [page, pageCount]);

  const clearEndingTimers = useCallback(() => {
    for (const timer of endingTimers.current) window.clearTimeout(timer);
    endingTimers.current = [];
  }, []);

  const beginRewrite = useCallback(() => {
    const paragraphs = splitParagraphBlocks(manuscript.completionPassage.prose);
    const recordParagraphs = splitParagraphBlocks(
      manuscript.completionPassage.recordProse,
    );
    const originalEnding = paragraphs.at(-1) ?? '';
    const replacementEnding = recordParagraphs.at(-1) ?? originalEnding;
    clearEndingTimers();
    setEndingStage('rewriting');
    onAnnounce('The record revises its wording.');
    endingTimers.current.push(
      window.setTimeout(
        () => setEndingStage('complete'),
        backspaceDuration(originalEnding, replacementEnding) + 100,
      ),
    );
  }, [
    clearEndingTimers,
    manuscript.completionPassage.prose,
    manuscript.completionPassage.recordProse,
    onAnnounce,
  ]);

  useEffect(() => {
    const enteredComplete =
      previousPhase.current !== 'COMPLETE' && session.phase === 'COMPLETE';
    previousPhase.current = session.phase;
    if (session.phase !== 'COMPLETE') {
      clearEndingTimers();
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
    setEndingStage('original');
    clearEndingTimers();
    endingTimers.current.push(
      window.setTimeout(beginRewrite, typingPlan.total + 900),
    );
    return clearEndingTimers;
  }, [beginRewrite, clearEndingTimers, onAnnounce, session.phase, typingPlan]);

  // Lets the reader finish a chapter at their own pace: the words settle
  // at once, the caret stops, and the ending moves on to its rewrite.
  const finishTyping = useCallback(() => {
    if (!typingActive) return;
    settleFreshChapter();
    if (session.phase === 'COMPLETE' && endingStage === 'original')
      beginRewrite();
  }, [
    beginRewrite,
    endingStage,
    session.phase,
    settleFreshChapter,
    typingActive,
  ]);

  // Swapping the trailing guide widgets (availability notice, turn guide)
  // changes the flow's width but is no reason to turn the page under the
  // reader; refresh the page count only.
  useEffect(() => {
    measure();
  }, [agentActive, measure, typingActive, webMCPStatus]);

  // The typing follower: a newly typed entry is followed like paper feeding
  // through the machine — start at the entry's first page, ride the typing
  // head with a single block caret, advance when the head crosses onto the
  // next page, and finish on the last page where the next prompt waits. It
  // keys only on the fresh entry, so receipts or connection changes that
  // arrive mid-pass never restart it.
  useEffect(() => {
    if (!freshChapterId || !typingPlan || endingStage !== 'original') return;
    const article = freshArticleRef.current;
    if (!article) return;
    const startPage = pageAt(article);
    goToPage(startPage);
    followingHead.current = true;
    const caret = caretRef.current;
    const pager = pagerRef.current;
    const sheet = pager?.closest('.manuscript');
    const startedAt = performance.now();
    // The schedule is parsed once; the frame loop below never reads
    // styles. Layout reads happen only when the head enters a new word
    // or a page turn is settling — within a word the caret advances
    // arithmetically (monospace glyphs share one width).
    const words = Array.from(
      article.parentElement?.querySelectorAll<HTMLElement>(
        '.story-chapter.is-fresh .tw-word, .completion-passage.is-fresh .tw-word',
      ) ?? [],
      (span) => ({
        span,
        start: parseFloat(span.style.getPropertyValue('--td')) || 0,
        duration: parseFloat(span.style.getPropertyValue('--wd')) || 1,
        chars: Number(span.style.getPropertyValue('--chars')) || 1,
      }),
    );
    let frame = 0;
    let headPage = startPage;
    let head: (typeof words)[number] | null = null;
    let cursor = 0;
    let lastPageCheck = 0;
    let turnSettlesAt = startedAt + 800;
    let headRect: DOMRect | null = null;
    let pagerRect: DOMRect | null = null;
    let sheetRect: DOMRect | null = null;
    let glyphWidth = 0;

    const hideCaret = () => {
      if (caret) caret.hidden = true;
    };

    const loop = (now: number) => {
      const elapsed = performance.now() - startedAt;
      while (cursor < words.length && words[cursor].start <= elapsed) {
        head = words[cursor];
        cursor += 1;
        headRect = null;
      }
      if (head && caret && pager && sheet) {
        if (!headRect || now < turnSettlesAt) {
          headRect = head.span.getBoundingClientRect();
          pagerRect = pager.getBoundingClientRect();
          sheetRect = sheet.getBoundingClientRect();
          glyphWidth = headRect.width / head.chars;
        }
        if (pagerRect && sheetRect) {
          const stepMs = head.duration / head.chars;
          const revealed = Math.min(
            head.chars,
            Math.max(0, Math.floor((elapsed - head.start) / stepMs)),
          );
          const x = headRect.left + revealed * glyphWidth;
          const onScreen = x >= pagerRect.left - 1 && x <= pagerRect.right + 1;
          caret.hidden = !onScreen;
          if (onScreen) {
            caret.style.transform = `translate(${x - sheetRect.left}px, ${headRect.top - sheetRect.top}px)`;
          }
        }
      }
      if (head && now - lastPageCheck > 500) {
        lastPageCheck = now;
        if (now > turnSettlesAt)
          followingHead.current = getCurrentPage() === headPage;
        const nextPage = pageAt(head.span);
        if (nextPage !== headPage) {
          // Follow only while the reader is still on the page the typing
          // head just left; a manual turn takes priority.
          if (followingHead.current) {
            goToPage(nextPage);
            turnSettlesAt = now + 800;
          } else setNewPagesAhead(true);
          headPage = nextPage;
        }
      }
      if (elapsed > typingPlan.total + 400) {
        hideCaret();
        if (followingHead.current) goToLastPage();
        else setNewPagesAhead(true);
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
  }, [freshChapterId, endingStage]);

  // One place decides where the record turns to when content arrives
  // outside a typing pass: the reader's own move and the objects they use
  // always come into view; a chapter that lands while they are reading
  // earlier pages is flagged instead of yanking them forward.
  useEffect(() => {
    measure();
    const chapterArrived = latestChapterId !== previousLatestId.current;
    const effectArrived =
      pendingReceiptId !== null &&
      pendingReceiptId !== previousReceiptId.current;
    const webMCPStatusChanged = webMCPStatus !== previousWebMCPStatus.current;
    const enteredAwaiting =
      previousTurnPhase.current !== 'AWAITING_CHAPTER' &&
      session.phase === 'AWAITING_CHAPTER';
    const typingEnded = previousTypingActive.current && !typingActive;
    previousLatestId.current = latestChapterId;
    previousReceiptId.current = pendingReceiptId;
    previousWebMCPStatus.current = webMCPStatus;
    previousTurnPhase.current = session.phase;
    previousTypingActive.current = typingActive;
    if (firstContentKey.current) {
      firstContentKey.current = false;
      return;
    }
    if (webMCPStatusChanged && !chapterArrived && !effectArrived) return;
    if (endingStage !== 'original') {
      goToLastPage();
      return;
    }
    if (enteredAwaiting || effectArrived) {
      // The reader's own move or the object they just used: they are done
      // with the chapter, so settle any typing and bring the change into
      // view (the settled pass re-enters below as typingEnded).
      followingHead.current = true;
      if (typingActive) settleFreshChapter();
      else goToLastPage();
      return;
    }
    if (typingActive) return;
    if (typingEnded) {
      if (followingHead.current) goToLastPage();
      return;
    }
    if (chapterArrived) {
      // A brand-new chapter renders its fresh typing pass one commit
      // later; wait for that run instead of turning to the end now.
      if (typingPlan && !freshChapterId) return;
      if (getCurrentPage() >= pageCount - 1) goToLastPage();
      else setNewPagesAhead(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  return (
    <section className="manuscript" aria-label="The living manuscript">
      {/* Pre-rendered light layers; state changes crossfade their opacity
          instead of transitioning the sheet's own heavy shadows. */}
      <div aria-hidden="true" className="manuscript-light-agent" />
      <div aria-hidden="true" className="manuscript-light-shift" />
      <header className="sheet-head">
        <span>Record of proceedings</span>
        <span
          className="sheet-page-indicator"
          data-new-pages={newPagesAhead || undefined}
        >
          Sheet {String(page + 1).padStart(2, '0')} of{' '}
          {String(pageCount).padStart(2, '0')}
          {newPagesAhead ? (
            <span className="sheet-new-pages"> · New</span>
          ) : null}
        </span>
      </header>
      {/* The window clips the rolling pager so sheets feed through the
          platen instead of sliding over the running head or off the paper. */}
      <div
        className="sheet-window"
        data-restricted={availabilityVisible ? webMCPStatus : undefined}
      >
        <div
          aria-hidden={availabilityVisible || undefined}
          className="sheet-pager"
          inert={availabilityVisible}
          ref={pagerRef}
        >
          <div className="sheet-flow">
            {manuscript.chapters.map((chapter) => {
              const fresh = chapter.id === freshChapterId;
              return (
                <ChapterBlock
                  articleRef={fresh ? freshArticleRef : undefined}
                  chapter={chapter}
                  key={chapter.id}
                  plan={fresh && endingStage === 'original' ? typingPlan : null}
                  redacted={availabilityVisible}
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

            {session.phase === 'READY' &&
            webMCPStatus === 'connected' &&
            !typingActive ? (
              <TurnGuide
                agentActive={agentActive}
                agentFailure={agentFailure}
                experience={experience}
                onAnnounce={onAnnounce}
                session={session}
              />
            ) : null}
            {session.phase === 'AWAITING_CHAPTER' &&
            webMCPStatus === 'connected' ? (
              <PendingTurnGuide
                agentActive={agentActive}
                agentFailure={agentFailure}
                agentQuiet={agentQuiet}
                agentRunning={agentRunning}
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
        data-new-pages={newPagesAhead || undefined}
      >
        <button
          className="sheet-finish-typing"
          hidden={!typingActive}
          onClick={finishTyping}
          type="button"
        >
          Finish typing
        </button>
        <button
          aria-label="Previous page"
          disabled={availabilityVisible || page === 0}
          onClick={goToPrevious}
          type="button"
        >
          ‹
        </button>
        <button
          aria-label={
            newPagesAhead ? 'Next page, new writing ahead' : 'Next page'
          }
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
  agentFailure,
  experience,
  onAnnounce,
  session,
}: {
  agentActive: boolean;
  agentFailure: AgentFailure | null;
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
      {agentFailure ? <AgentFailureNote failure={agentFailure} /> : null}
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
  agentFailure,
  agentQuiet,
  agentRunning,
  experience,
  onAnnounce,
  session,
}: {
  agentActive: boolean;
  agentFailure: AgentFailure | null;
  agentQuiet: boolean;
  agentRunning: boolean;
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  session: ExperienceSession;
}) {
  const pending = session.pendingTurn;
  const interactionTurn = pending?.kind === 'interaction';
  const markerText = interactionTurn
    ? agentRunning
      ? 'The record has changed. Your agent is writing what follows…'
      : 'The record has changed. Waiting for your agent to write what follows…'
    : agentRunning
      ? 'Your agent is writing the next chapter…'
      : 'Waiting for your agent to write the next chapter…';

  return (
    <div className="pending-turn" id="your-turn">
      {pending?.playerChoice ? (
        <p className="pending-move">
          <span aria-hidden="true">— </span>
          <span className="sr-only">Your move: </span>
          {pending.playerChoice}
        </p>
      ) : null}
      {agentActive ? (
        <div
          className="writing-marker"
          data-running={agentRunning || undefined}
        >
          <span aria-hidden="true" />
          <p>{markerText}</p>
        </div>
      ) : null}
      {agentFailure ? <AgentFailureNote failure={agentFailure} /> : null}
      {!agentActive || agentQuiet ? (
        <div className="turn-guide pending-turn-guide">
          <h2 className="turn-guide-prompt">
            {agentActive
              ? 'Your agent has gone quiet.'
              : 'The chapter is unwritten.'}
          </h2>
          <AgentHandoff
            experience={experience}
            mode="recover"
            onAnnounce={onAnnounce}
          />
        </div>
      ) : null}
    </div>
  );
}

function AgentFailureNote({ failure }: { failure: AgentFailure }) {
  return (
    <output className="agent-failure-note" data-code={failure.code}>
      The record refused the last entry. Ask your agent to try again.
    </output>
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
          ? 'Your move is on the page but nothing followed it. Ask your agent to finish it:'
          : mode === 'start'
            ? 'No agent has spoken yet. Send this to your agent to begin:'
            : 'Your agent has not continued yet. Send this to resume:'}
      </p>
      <div className="agent-handoff-example">
        <p>{message}</p>
        <CopyButton
          className="inline-copy-action handoff-copy-button"
          iconOnly
          idleLabel="Copy example message"
          onCopied={() =>
            onAnnounce(
              mode === 'recover'
                ? 'Resume message copied.'
                : 'Starter copied. Change the last sentence to your own move before sending.',
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
  plan = null,
  redacted = false,
}: {
  articleRef?: RefObject<HTMLElement | null>;
  chapter: ReturnType<typeof deriveManuscriptReadModel>['chapters'][number];
  plan?: TypingPlan | null;
  redacted?: boolean;
}) {
  const paragraphs = splitParagraphBlocks(chapter.prose);
  // A restricted sheet keeps the real prose on the page and inks over
  // runs of it, so the bars follow the actual lines; nothing is typed
  // in while the gate is up, so the typed path stays unredacted.
  const redactions = redacted ? redactParagraphs(paragraphs) : null;
  return (
    <article
      className={`story-chapter${plan ? ' is-fresh' : ''}`}
      ref={articleRef}
    >
      <p className="chapter-number">{chapter.label}</p>
      <h2>
        {plan ? (
          <TypedText text={chapter.title} words={plan.title} />
        ) : (
          chapter.title
        )}
      </h2>
      {chapter.effect ? <EffectPresentation effect={chapter.effect} /> : null}
      {paragraphs.map((paragraph, index) => (
        <p key={`${chapter.id}-paragraph-${index}`}>
          {plan?.paragraphs[index] ? (
            <TypedText text={paragraph} words={plan.paragraphs[index]} />
          ) : redactions ? (
            redactions[index].map((run, runIndex) =>
              run.redacted ? (
                <span className="redacted-run" key={runIndex}>
                  {run.text}
                </span>
              ) : (
                run.text
              ),
            )
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
  plan: WordTiming[][] | null | undefined;
  stage: EndingStage;
}) {
  const paragraphs = splitParagraphBlocks(passage.prose);
  const recordParagraphs = splitParagraphBlocks(passage.recordProse);
  const completedParagraphs = resolveRecordedEnding(
    paragraphs,
    recordParagraphs,
  );
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
            completedParagraphs[index]
          ) : plan?.[index] ? (
            <TypedText text={original} words={plan[index]} />
          ) : (
            original
          )}
        </p>
      ))}
    </section>
  );
}

/**
 * Renders text as one span per word so a committed entry can be hammered
 * onto the page at typing speed. The full text is in the DOM from the
 * first frame; each word reveals its glyphs with a stepped clip-path on
 * the schedule carried by its custom properties. Courier Prime is
 * monospace, so per-word steps are pixel-identical to per-glyph opacity
 * at a fraction of the node and animation count.
 */
function TypedText({
  text,
  words,
}: {
  text: string;
  words: ReadonlyArray<WordTiming>;
}) {
  return (
    <>
      {splitTypingTokens(text).map((token, index) => (
        <span
          className="tw-word"
          key={index}
          style={
            {
              '--td': `${words[index]?.start ?? 0}ms`,
              '--wd': `${words[index]?.duration ?? 1}ms`,
              '--chars': `${words[index]?.chars ?? 1}`,
            } as CSSProperties
          }
        >
          {token}
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

function useFreshKey(
  key: string | null,
  ttl: number,
): { key: string | null; clear: () => void } {
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

  const clear = useCallback(() => setFreshKey(null), []);

  return { key: freshKey, clear };
}

function effectParagraphs(effect: ManuscriptEffect): string[] {
  return effect.facts.flatMap(({ value }) => factParagraphs(value));
}

function factParagraphs(value: string): string[] {
  return flattenParagraphBlocks(value);
}

function factLines(value: string): { lead: string; note: string | null } {
  const [lead, ...rest] = value.split('\n');
  const note = rest.join(' ').trim();
  return { lead: lead.trim(), note: note || null };
}
