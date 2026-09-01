import type { CSSProperties, ReactNode } from 'react';
import { diffText } from '@/lib/manuscript/text-diff';

const RUN_DELAY_MS = 90;

export function RevisedText({
  animate = false,
  delayOffset = 0,
  original,
  record,
}: {
  animate?: boolean;
  delayOffset?: number;
  original: string;
  record: string;
}) {
  const runs = diffText(original, record);
  let changedIndex = 0;
  const visual: ReactNode[] = runs.map((run, index) => {
    if (run.type === 'equal') return run.text;
    const style = animate
      ? ({
          '--revision-delay': `${delayOffset + changedIndex++ * RUN_DELAY_MS}ms`,
        } as CSSProperties)
      : undefined;
    return run.type === 'delete' ? (
      <del key={index} style={style}>
        {run.text}
      </del>
    ) : (
      <ins key={index} style={style}>
        {run.text}
      </ins>
    );
  });

  return (
    <>
      <span
        aria-hidden="true"
        className={`record-revision${animate ? ' is-animating' : ''}`}
      >
        {visual}
      </span>
      <span className="sr-only">{record}</span>
    </>
  );
}

export function revisionDuration(original: string, record: string): number {
  const changedRuns = diffText(original, record).filter(
    ({ type }) => type !== 'equal',
  ).length;
  return Math.max(500, changedRuns * RUN_DELAY_MS + 420);
}
