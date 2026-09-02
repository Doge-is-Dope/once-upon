/**
 * Which words of a restricted sheet stay legible. The gate keeps the
 * manuscript itself on the page and inks over runs of its real text, so
 * the bars end where the lines end and wrap with the sheet; this decides
 * the runs. Deterministic: the same prose always censors the same words.
 */
export type RedactionRun = {
  text: string;
  redacted: boolean;
};

/* How many leading words each censored paragraph keeps, cycled so the
   bars start at uneven positions like a hand-marked record. */
const LEAD_WORDS = [4, 3, 6, 2, 5] as const;

export function redactParagraphs(
  paragraphs: readonly string[],
): RedactionRun[][] {
  const lastIndex = paragraphs.length - 1;
  return paragraphs.map((paragraph, index) => {
    // The speaker's question is the one thing the reader may keep.
    if (index === 0) return [{ text: paragraph, redacted: false }];
    if (index === lastIndex) return [{ text: paragraph, redacted: true }];
    return redactAfterLead(
      paragraph,
      LEAD_WORDS[(index - 1) % LEAD_WORDS.length],
    );
  });
}

function redactAfterLead(paragraph: string, lead: number): RedactionRun[] {
  const tokens = paragraph.split(/(\s+)/);
  let words = 0;
  let cut = 0;
  for (const [tokenIndex, token] of tokens.entries()) {
    if (!token || /^\s+$/.test(token)) continue;
    words += 1;
    if (words === lead) {
      // Keep the trailing space with the visible lead so the bar starts
      // on a word boundary.
      cut = tokens.slice(0, tokenIndex + 2).join('').length;
      break;
    }
  }
  const visible = paragraph.slice(0, cut);
  const hidden = paragraph.slice(cut);
  if (!hidden) return [{ text: paragraph, redacted: false }];
  const runs: RedactionRun[] = [];
  if (visible) runs.push({ text: visible, redacted: false });
  runs.push({ text: hidden, redacted: true });
  return runs;
}
