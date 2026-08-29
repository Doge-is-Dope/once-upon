import type {
  CanonicalEvent,
  EndingId,
  ExperienceSession,
  NarrationEntry,
  TurnResolution,
} from '@/lib/runtime/types';

const ROMAN_PAGE_NUMBERS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const;

export type BookLeafKind =
  | 'bookplate'
  | 'prologue'
  | 'completed'
  | 'draft'
  | 'unwritten';

export interface BookLeaf {
  key: string;
  leafIndex: number;
  turn: number | null;
  kind: BookLeafKind;
  title: string;
  entry: NarrationEntry | null;
  resolution: TurnResolution | null;
  notes: CanonicalEvent[];
  endingId: EndingId | null;
}

export function buildBookLeaves(
  session: ExperienceSession,
  maxTurns: number,
): BookLeaf[] {
  const opening =
    session.narrationEntries.find((entry) => entry.turn === 0) ?? null;
  const entriesByTurn = new Map(
    session.narrationEntries
      .filter((entry) => entry.turn > 0)
      .map((entry) => [entry.turn, entry]),
  );

  const leaves: BookLeaf[] = [
    {
      key: 'bookplate',
      leafIndex: 0,
      turn: null,
      kind: 'bookplate',
      title: `${session.character.name}'s manuscript`,
      entry: null,
      resolution: null,
      notes: [],
      endingId: null,
    },
    {
      key: opening?.id ?? 'prologue',
      leafIndex: 1,
      turn: 0,
      kind: 'prologue',
      title: 'The tavern before dawn',
      entry: opening,
      resolution: null,
      notes: [],
      endingId: null,
    },
  ];

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const entry = entriesByTurn.get(turn) ?? null;
    const pending =
      session.pendingResolution?.turn === turn
        ? session.pendingResolution
        : null;
    const resolution = entry?.resolution ?? pending;
    const endingId =
      entry && session.phase === 'COMPLETE' && turn === session.turn
        ? session.endingId
        : null;

    leaves.push({
      key: entry?.id ?? pending?.resolutionId ?? `unwritten-${turn}`,
      leafIndex: turn + 1,
      turn,
      kind: entry ? 'completed' : pending ? 'draft' : 'unwritten',
      title: resolution
        ? resolutionHeading(resolution)
        : `Page ${formatPageNumber(turn)}`,
      entry,
      resolution,
      notes: resolution?.canonicalEvents ?? [],
      endingId,
    });
  }

  return leaves;
}

export function formatPageNumber(turn: number): string {
  return ROMAN_PAGE_NUMBERS[turn] ?? String(turn);
}

export function latestBookLeafIndex(
  session: ExperienceSession,
  maxTurns: number,
): number {
  const turn =
    session.pendingResolution?.turn ??
    session.narrationEntries.at(-1)?.turn ??
    0;
  return Math.min(maxTurns + 1, turn + 1);
}

export function resolutionHeading(resolution: TurnResolution): string {
  return (
    resolution.canonicalEvents.find((event) => event.type === 'ending')
      ?.label ??
    resolution.canonicalEvents.find((event) => event.type !== 'location')
      ?.label ??
    'The tavern answers'
  );
}

export function narrationText(entry: NarrationEntry): string {
  return entry.payload.format === 'prose' ? entry.payload.text : '';
}
