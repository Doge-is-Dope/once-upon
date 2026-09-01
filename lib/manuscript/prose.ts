const SECOND_PERSON_PRONOUN = /\b(?:you|your|yours|yourself|yourselves)\b/iu;

export function splitParagraphBlocks(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function flattenParagraphBlocks(text: string): string[] {
  return splitParagraphBlocks(text).map((paragraph) =>
    paragraph.replace(/\s*\n\s*/g, ' ').trim(),
  );
}

export function hasSecondPersonPronoun(text: string): boolean {
  return SECOND_PERSON_PRONOUN.test(text);
}

export function hasMatchingParagraphStructure(
  prose: string,
  recordProse: string,
): boolean {
  return (
    splitParagraphBlocks(prose).length ===
    splitParagraphBlocks(recordProse).length
  );
}

export function formatChapterLabel(index: number): string {
  return index === 0 ? 'Prologue' : `Chapter ${index}`;
}

export function resolveRecordedEnding(
  prose: readonly string[],
  recordProse: readonly string[],
): string[] {
  const lastIndex = prose.length - 1;
  return prose.map((paragraph, index) =>
    index === lastIndex ? (recordProse[index] ?? paragraph) : paragraph,
  );
}
