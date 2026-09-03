'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, RefObject } from 'react';
import {
  deriveManuscriptReadModel,
  effectFromReceipt,
  type ManuscriptEffect,
} from '@/lib/manuscript/read-model';
import {
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
import { resolveBookCopy } from '@/lib/frames/book';
import type {
  BookFrameCopy,
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { BackspaceText } from './backspace-text';
import { CopyButton } from './copy-button';
import { resolvePresentation } from './presentations';
import { StoryShare } from './share-row';
import { usePagination } from './use-sheet-pages';
import type { AgentFailure, WebMCPSetupHint } from './use-webmcp-connection';
import { WebMCPAvailability } from './availability-slip';

type EndingStage = 'original' | 'rewriting' | 'complete';

export function StoryScroll({
  agentActive,
  agentFailure = null,
  agentQuiet = false,
  agentRunning = false,
  experience,
  onAnnounce,
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
  const copy = useMemo(() => resolveBookCopy(experience.frame), [experience]);
  const recordLayer = experience.story.narration === 'record';
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
  // True while the reader is still on the page the typing head occupies;
  // any explicit page turn hands control back to the reader.
  const followingHead = useRef(true);
  const stopFollowingHead = useCallback(() => {
    followingHead.current = false;
  }, []);
  const contentKey = [
    manuscript.chapters.length,
    session.phase,
    endingStage,
    pendingReceiptId ?? '',
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
  } = usePagination({
    navigationEnabled: pageNavigationEnabled && !availabilityVisible,
    onManualNavigation: stopFollowingHead,
  });
  const freshArticleRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const firstContentKey = useRef(true);
  const previousLatestId = useRef<string | null>(null);
  const previousReceiptId = useRef<string | null>(null);
  const previousPhase = useRef(session.phase);
  const previousTypingActive = useRef(typingActive);
  const rewriteDelayTimer = useRef<number | null>(null);

  useEffect(() => {
    onTypingChange?.(typingActive);
  }, [onTypingChange, typingActive]);

  useEffect(() => {
    if (page >= pageCount - 1) setNewPagesAhead(false);
  }, [page, pageCount]);

  const clearRewriteDelay = useCallback(() => {
    if (rewriteDelayTimer.current !== null)
      window.clearTimeout(rewriteDelayTimer.current);
    rewriteDelayTimer.current = null;
  }, []);

  const beginRewrite = useCallback(() => {
    clearRewriteDelay();
    setEndingStage('rewriting');
    onAnnounce('The record revises its wording.');
  }, [clearRewriteDelay, onAnnounce]);

  const finishRewrite = useCallback(() => {
    clearRewriteDelay();
    setEndingStage('complete');
  }, [clearRewriteDelay]);
  // A record story rewrites its ending after the typing settles; a prose
  // story simply settles.
  const settleEnding = recordLayer ? beginRewrite : finishRewrite;

  useEffect(() => {
    const enteredComplete =
      previousPhase.current !== 'COMPLETE' && session.phase === 'COMPLETE';
    previousPhase.current = session.phase;
    if (session.phase !== 'COMPLETE') {
      clearRewriteDelay();
      setEndingStage('original');
      return;
    }
    if (!enteredComplete) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reducedMotion || !typingPlan) {
      setEndingStage('complete');
      if (recordLayer) onAnnounce('The record revises its wording.');
      return;
    }
    setEndingStage('original');
    clearRewriteDelay();
    rewriteDelayTimer.current = window.setTimeout(
      settleEnding,
      typingPlan.total + 900,
    );
    return clearRewriteDelay;
  }, [
    clearRewriteDelay,
    onAnnounce,
    recordLayer,
    session.phase,
    settleEnding,
    typingPlan,
  ]);

  // Lets the reader finish a chapter at their own pace: the words settle
  // at once, the caret stops, and the ending moves on to its rewrite.
  const finishTyping = useCallback(() => {
    if (!typingActive) return;
    settleFreshChapter();
    if (followingHead.current) goToLastPage();
    if (session.phase === 'COMPLETE' && endingStage === 'original')
      settleEnding();
  }, [
    endingStage,
    goToLastPage,
    session.phase,
    settleEnding,
    settleFreshChapter,
    typingActive,
  ]);

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
    goToPage(startPage, 'feed');
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
            goToPage(nextPage, 'feed');
            turnSettlesAt = now + 800;
          } else setNewPagesAhead(true);
          headPage = nextPage;
        }
      }
      if (elapsed > typingPlan.total + 400) {
        hideCaret();
        if (followingHead.current) goToLastPage('feed');
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
  useLayoutEffect(() => {
    measure();
    const chapterArrived = latestChapterId !== previousLatestId.current;
    const effectArrived =
      pendingReceiptId !== null &&
      pendingReceiptId !== previousReceiptId.current;
    const typingEnded = previousTypingActive.current && !typingActive;
    previousLatestId.current = latestChapterId;
    previousReceiptId.current = pendingReceiptId;
    previousTypingActive.current = typingActive;
    if (firstContentKey.current) {
      firstContentKey.current = false;
      return;
    }
    if (effectArrived) {
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
        <span>{copy.runningHead}</span>
        <span className="sheet-page-indicator">
          Page {page + 1} of {pageCount}
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
          tabIndex={availabilityVisible ? -1 : 0}
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
                  redacted={availabilityVisible && recordLayer}
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
                onRewriteComplete={finishRewrite}
                passage={manuscript.completionPassage}
                plan={
                  freshChapterId && endingStage === 'original'
                    ? typingPlan?.completionParagraphs
                    : null
                }
                stage={endingStage}
              />
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
      <footer
        className="sheet-footer"
        data-navigation-disabled={availabilityVisible || undefined}
        data-new-pages={newPagesAhead || undefined}
      >
        <div className="sheet-footer-status">
          {!availabilityVisible && typingActive ? (
            <div className="sheet-typing-status" id="your-turn">
              <p>The record is typing…</p>
              <button
                className="sheet-finish-typing"
                onClick={finishTyping}
                type="button"
              >
                Finish typing
              </button>
            </div>
          ) : null}
          {!availabilityVisible &&
          !typingActive &&
          session.phase === 'READY' ? (
            <TurnGuide
              agentActive={agentActive}
              copy={copy}
              agentFailure={agentFailure}
              experience={experience}
              onAnnounce={onAnnounce}
              session={session}
            />
          ) : null}
          {!availabilityVisible &&
          !typingActive &&
          session.phase === 'AWAITING_CHAPTER' ? (
            <PendingTurnGuide
              agentActive={agentActive}
              agentFailure={agentFailure}
              agentQuiet={agentQuiet}
              copy={copy}
              agentRunning={agentRunning}
              experience={experience}
              onAnnounce={onAnnounce}
              session={session}
            />
          ) : null}
          {recordLayer &&
          !availabilityVisible &&
          !typingActive &&
          session.phase === 'COMPLETE' &&
          endingStage !== 'complete' ? (
            <div className="sheet-rewrite-status" id="your-turn">
              <p>
                {endingStage === 'rewriting'
                  ? 'The record is revising its wording…'
                  : 'The record is preparing its revision…'}
              </p>
            </div>
          ) : null}
          {!availabilityVisible &&
          !typingActive &&
          session.phase === 'COMPLETE' &&
          endingStage === 'complete' ? (
            <StoryShare
              experience={experience}
              onAnnounce={onAnnounce}
              session={session}
            />
          ) : null}
        </div>
        <div className="sheet-controls">
          <button
            aria-label="Previous page"
            disabled={availabilityVisible || page === 0}
            onClick={goToPrevious}
            type="button"
          >
            <span aria-hidden="true">←</span>
            <span className="sheet-control-label">Previous</span>
          </button>
          <button
            aria-label={
              newPagesAhead ? 'Next page, new writing ahead' : 'Next page'
            }
            disabled={availabilityVisible || page >= pageCount - 1}
            onClick={goToNext}
            type="button"
          >
            <span className="sheet-control-label">Next</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </footer>
    </section>
  );
}

function TurnGuide({
  agentActive,
  agentFailure,
  copy,
  experience,
  onAnnounce,
  session,
}: {
  agentActive: boolean;
  agentFailure: AgentFailure | null;
  copy: BookFrameCopy;
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
            ? copy.turnPrompt.opening
            : copy.turnPrompt.next
          : opening
            ? copy.turnPrompt.openingWaiting
            : copy.turnPrompt.nextWaiting}
      </h2>
      {agentFailure ? <AgentFailureNote failure={agentFailure} /> : null}
      {!agentActive ? (
        <AgentHandoff
          copy={copy}
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
  copy,
  experience,
  onAnnounce,
  session,
}: {
  agentActive: boolean;
  agentFailure: AgentFailure | null;
  agentQuiet: boolean;
  copy: BookFrameCopy;
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
            copy={copy}
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
  copy,
  experience,
  mode,
  onAnnounce,
}: {
  copy: BookFrameCopy;
  experience: ExperienceDefinition;
  mode: 'start' | 'resume' | 'recover';
  onAnnounce: (message: string) => void;
}) {
  const message = handoffMessage(experience, copy, mode);
  return (
    <div className="agent-handoff">
      <p className="agent-handoff-instruction">
        {mode === 'recover'
          ? 'Your move is on the page but nothing followed it. Copy a message asking your agent to finish the saved turn.'
          : mode === 'start'
            ? 'No agent has spoken yet. Copy a starter message for your agent.'
            : 'Your agent has not continued yet. Copy a message to resume.'}
      </p>
      <div className="agent-handoff-example">
        <CopyButton
          className="handoff-copy-button"
          copiedLabel="Starter copied"
          iconOnly
          idleLabel="Copy starter"
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
  copy: BookFrameCopy,
  mode: 'start' | 'resume' | 'recover',
): string {
  if (mode === 'start') return experience.startMessage;
  if (mode === 'recover')
    return `Resume ${experience.title} with me through this page. Finish the saved turn first.`;
  return `Resume ${experience.title} with me through this page. ${copy.resumeMove}`;
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
  onRewriteComplete,
  passage,
  plan,
  stage,
}: {
  onRewriteComplete: () => void;
  passage: { prose: string; recordProse?: string };
  plan: WordTiming[][] | null | undefined;
  stage: EndingStage;
}) {
  const paragraphs = splitParagraphBlocks(passage.prose);
  const recordParagraphs =
    passage.recordProse !== undefined
      ? splitParagraphBlocks(passage.recordProse)
      : null;
  const completedParagraphs = recordParagraphs
    ? resolveRecordedEnding(paragraphs, recordParagraphs)
    : paragraphs;
  const lastIndex = paragraphs.length - 1;
  return (
    <section
      aria-label="Completion"
      className={`completion-passage${plan ? ' is-fresh' : ''}`}
    >
      {paragraphs.map((original, index) => (
        <p key={index}>
          {index === lastIndex && stage === 'rewriting' && recordParagraphs ? (
            <BackspaceText
              onComplete={onRewriteComplete}
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
  return resolvePresentation(effect.presentation).render(effect, fresh);
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
