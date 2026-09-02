import { splitParagraphBlocks } from './prose';

/**
 * Typing cadence shared by the page (which animates the reveal) and the
 * WebMCP layer (which tells the agent how long the page will take), so
 * chat and page pace themselves from one schedule.
 */
export const TYPE_MS = 14;
export const PARAGRAPH_PAUSE_MS = 300;

export type WordTiming = {
  start: number;
  duration: number;
  chars: number;
};

export type TypingPlan = {
  title: WordTiming[];
  paragraphs: WordTiming[][];
  completionParagraphs: WordTiming[][];
  total: number;
};

/**
 * Splits text into word tokens, each carrying its trailing whitespace,
 * so the rendered tokens joined back together equal the original text.
 */
export function splitTypingTokens(text: string): string[] {
  return text.split(/(?<=\s)(?=\S)/);
}

/**
 * Schedules a committed entry at reading-typing speed (~70 characters a
 * second), with an uneven hand and pauses after punctuation and between
 * paragraphs. The cadence is computed per character but emitted per
 * word: each word records its start, its stepped duration, and how many
 * glyphs it reveals.
 */
export function buildTypingPlan(
  title: string,
  paragraphs: readonly string[],
  completionParagraphs: readonly string[],
): TypingPlan {
  let elapsed = 0;
  let index = 0;
  const scheduleToken = (token: string): WordTiming => {
    const start = elapsed;
    let chars = 0;
    for (const character of token) {
      elapsed += TYPE_MS + ((index * 7919) % 9) + pauseAfter(character);
      index += 1;
      chars += 1;
    }
    return { start, duration: Math.max(elapsed - start, 1), chars };
  };
  const schedule = (text: string) => splitTypingTokens(text).map(scheduleToken);
  const titleWords = schedule(title);
  elapsed += PARAGRAPH_PAUSE_MS;
  const paragraphWords = paragraphs.map((paragraph) => {
    const words = schedule(paragraph);
    elapsed += PARAGRAPH_PAUSE_MS;
    return words;
  });
  const completionWords = completionParagraphs.map((paragraph) => {
    const words = schedule(paragraph);
    elapsed += PARAGRAPH_PAUSE_MS;
    return words;
  });
  return {
    title: titleWords,
    paragraphs: paragraphWords,
    completionParagraphs: completionWords,
    total: elapsed,
  };
}

/** Milliseconds the page will spend revealing a committed chapter. */
export function estimateTypingMs(
  title: string,
  prose: string,
  completionProse = '',
): number {
  return buildTypingPlan(
    title,
    splitParagraphBlocks(prose),
    completionProse ? splitParagraphBlocks(completionProse) : [],
  ).total;
}

/** Rounds a duration up to whole seconds for agent-facing text. */
export function describeTypingSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function pauseAfter(character: string): number {
  if ('.?!'.includes(character)) return 200;
  if (',;:'.includes(character)) return 100;
  return 0;
}
