import type { BookFrameCopy } from '@/components/frames/book/types';
import type {
  Affordance,
  AttributeDescriptor,
  ExperienceSession,
} from '@/lib/runtime/types';
import type { AbilityId, EndingId, LocationId } from './types';

export const ATTRIBUTES: readonly AttributeDescriptor[] = [
  { id: 'wits', label: 'Wits', description: 'Notice what others miss.' },
  { id: 'nerve', label: 'Nerve', description: 'Stand firm when fear closes in.' },
  { id: 'grace', label: 'Grace', description: 'Move softly and win trust.' },
];

export const LOCATION_LABELS: Record<LocationId, string> = {
  main_hall: 'The Common Room',
  upstairs_room: "The Keeper's Room",
  cellar: 'The Cellar',
};

export const ITEM_LABELS: Record<string, string> = {
  lit_tin_lantern: 'Lit tin lantern',
  half_burnt_letter: 'Half-burnt letter',
  charred_key: 'Charred Key',
  black_mirror_shard: 'Black Mirror Shard',
};

export const CLUE_LABELS: Record<string, string> = {
  first_name_fragment: 'A name beginning: VES—',
  raven_trust: 'The raven trusts you',
  second_name_fragment: 'A name ending: —PER',
};

export const ABILITY_LABELS: Record<AbilityId, string> = {
  reveal_hidden_ink: 'Reveal hidden ink',
  ask_the_raven: 'Ask the Raven',
  speak_the_true_name: 'Speak the True Name',
};

export const ABILITY_DESCRIPTIONS: Record<AbilityId, string> = {
  reveal_hidden_ink:
    'ChatGPT can use the mirror shard to read concealed writing.',
  ask_the_raven: 'ChatGPT can ask the raven for the truth it has guarded.',
  speak_the_true_name: 'ChatGPT can carry the completed name into the cellar.',
};

export const ENDING_LABELS: Record<EndingId, string> = {
  escape: 'Escape',
  new_keeper: 'The New Keeper',
  true_name: 'The True Name',
};

export const BOOK_FRAME_COPY: BookFrameCopy = {
  tagline: 'Six pages before midnight',
  prologueTitle: 'The tavern before dawn',
  fallbackPageHeading: 'The tavern answers',
  defaultProtagonist: 'the traveler',
  preview: {
    prologueText:
      'The traveler woke beside a dying hearth. A raven watched from the rafters while something beneath the floor answered the clock.',
    sampleTitle: 'A key in the ashes',
    sampleProse:
      'The traveler sifted the cold hearth. Beneath the ash, a blackened key still held the warmth of a hand that had vanished years ago.',
    sampleResolution: {
      resolutionId: 'sample',
      actionId: 'search_hearth',
      intent: 'Search the hearth',
      turn: 1,
      createdAt: 0,
      roll: {
        die: 14,
        attribute: 'wits',
        modifier: 2,
        total: 16,
        dc: 13,
        tier: 'success',
      },
      canonicalEvents: [],
      representedEventIds: [],
      mustInclude: [],
      mustNotClaim: [],
      newAbilityIds: [],
    },
    sampleEvent: {
      id: 'sample-key',
      type: 'item',
      label: 'Charred Key',
      detail: 'A warm key surfaced from beneath the hearth.',
    },
  },
};

export const START_MESSAGE =
  'Play this mystery with me using the tools on the open page: get_story_state, perform_action, and commit_narration. Start by calling get_story_state, set the opening scene from the state it returns, and ask what I do first. For each action I describe, resolve it with perform_action, commit the pending result as a prose narration payload, then tell me what happened and ask what I do next. Do not reroll, skip pending narration, or invent items, clues, characters, exits, or endings. End every reply by asking what I do next, and if I seem unsure, suggest two of the currently available actions from the state.';

export const CONTINUE_MESSAGE =
  'Continue this story from the open page; you may have stopped mid-turn. Call get_story_state first. If a turn is waiting for narration, call commit_narration for that exact saved result before taking a new action. Do not reroll or change the saved facts.';

export function getAffordances(
  input: Pick<
    ExperienceSession,
    'inventoryIds' | 'clueIds' | 'unlockedAbilityIds' | 'usedAbilityIds'
  >,
): Affordance[] {
  const affordances: Affordance[] = [];

  if (!input.inventoryIds.includes('charred_key')) {
    affordances.push({
      id: 'search_hearth',
      label: 'Search the common-room hearth',
      description: 'Look through the dying hearth and the stones around it.',
      suggestedApproaches: ['wits', 'nerve'],
    });
  }
  if (!input.inventoryIds.includes('black_mirror_shard')) {
    affordances.push({
      id: 'search_upstairs_room',
      label: "Search the keeper's room",
      description: "Climb the stairs and inspect the former keeper's room.",
      suggestedApproaches: ['wits', 'grace'],
    });
  }
  if (
    input.inventoryIds.includes('charred_key') &&
    !input.clueIds.includes('raven_trust')
  ) {
    affordances.push({
      id: 'offer_charred_key_to_raven',
      label: 'Offer the Charred Key to the raven',
      description: 'Return what the bird has been waiting for.',
      suggestedApproaches: ['grace', 'nerve'],
    });
    affordances.push({
      id: 'escape_front_door',
      label: 'Unlock the chained door and leave',
      description: 'Escape into the night before the sixth bell sounds.',
      suggestedApproaches: ['nerve', 'grace'],
    });
  }
  affordances.push({
    id: 'enter_cellar_unprepared',
    label: 'Descend into the cellar',
    description:
      'Face what is breathing beneath the floor, whether you know its name or not. Safer once you know what waits below.',
    suggestedApproaches: ['nerve'],
  });
  affordances.push({
    id: 'improvise',
    label: 'Try something else',
    description:
      'Describe anything else you can see yourself trying. Improvising still spends one of your six pages and rarely uncovers a clue on its own.',
    suggestedApproaches: ['wits', 'nerve', 'grace'],
  });

  return affordances;
}
