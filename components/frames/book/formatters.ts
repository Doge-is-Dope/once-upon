import type {
  Affordance,
  CanonicalEvent,
  ExperienceSession,
  StoryDefinition,
  TurnResolution,
} from '@/lib/runtime/types';

export function tierLabel(tier: TurnResolution['roll']['tier']): string {
  return {
    critical_success: 'Critical success',
    success: 'Success',
    costly_success: 'Success at a cost',
    setback: 'Setback',
    critical_setback: 'Critical setback',
  }[tier];
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function eventTypeLabel(type: CanonicalEvent['type']): string {
  return {
    location: 'Location',
    item: 'Item',
    clue: 'Clue',
    ability: 'Ability',
    resolve: 'Resolve',
    story: 'Story',
    ending: 'Ending',
  }[type];
}

export function affordanceMessage(affordance: Affordance): string {
  const label = affordance.label;
  return `I ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
}

export function statusAnnouncement(
  session: ExperienceSession,
  story: StoryDefinition,
): string {
  if (session.pendingResolution)
    return `Roll saved: ${session.pendingResolution.roll.total} against ${session.pendingResolution.roll.dc}. ChatGPT is writing the manuscript.`;
  if (session.phase === 'COMPLETE')
    return `The manuscript is complete: ${session.endingId ? story.endingLabel(session.endingId) : 'ending saved'}.`;
  const remaining = story.limits.maxClock - session.clock;
  return `Page ${session.turn} is saved. ${remaining === 1 ? 'One page remains' : `${remaining} pages remain`} before midnight. It is your turn.`;
}
