export type TextDiffRun = {
  type: 'equal' | 'delete' | 'insert';
  text: string;
};

/**
 * Produces a stable word-and-punctuation diff without interpreting grammar.
 * Whitespace is retained as tokens so joining every run recreates each source
 * exactly; a longest-common-subsequence walk keeps repeated words predictable.
 */
export function diffText(original: string, record: string): TextDiffRun[] {
  if (original === record)
    return original ? [{ type: 'equal', text: original }] : [];

  const before = tokenize(original);
  const after = tokenize(record);
  const rows = Array.from(
    { length: before.length + 1 },
    () => new Uint16Array(after.length + 1),
  );

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      rows[left]![right] =
        before[left] === after[right]
          ? rows[left + 1]![right + 1]! + 1
          : Math.max(rows[left + 1]![right]!, rows[left]![right + 1]!);
    }
  }

  const runs: TextDiffRun[] = [];
  let left = 0;
  let right = 0;
  while (left < before.length || right < after.length) {
    if (
      left < before.length &&
      right < after.length &&
      before[left] === after[right]
    ) {
      append(runs, 'equal', before[left]!);
      left += 1;
      right += 1;
    } else if (
      left < before.length &&
      (right >= after.length ||
        rows[left + 1]![right]! >= rows[left]![right + 1]!)
    ) {
      append(runs, 'delete', before[left]!);
      left += 1;
    } else {
      append(runs, 'insert', after[right]!);
      right += 1;
    }
  }
  return runs;
}

function tokenize(value: string): string[] {
  return (
    value.match(
      /(?:[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*|[^\s\p{L}\p{N}\p{M}])\s*|\s+/gu,
    ) ?? []
  );
}

function append(
  runs: TextDiffRun[],
  type: TextDiffRun['type'],
  text: string,
): void {
  const previous = runs.at(-1);
  if (previous?.type === type) previous.text += text;
  else runs.push({ type, text });
}
