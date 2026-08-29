import type {
  AbilityId as RuntimeAbilityId,
  CanonicalEvent,
  EndingId as RuntimeEndingId,
  ExperienceSession,
  RollResult,
  StoryActionResult,
  StoryDefinition,
} from '@/lib/runtime/types';
import {
  ABILITY_DESCRIPTIONS,
  ABILITY_LABELS,
  CLUE_LABELS,
  ENDING_LABELS,
  getAffordances,
  ITEM_LABELS,
  LOCATION_LABELS,
} from './content';
import {
  isAttributeId,
  type AbilityId,
  type AttributeId,
  type EndingId,
  type LocationId,
} from './types';

const DYNAMIC_ABILITY_IDS: AbilityId[] = [
  'reveal_hidden_ink',
  'ask_the_raven',
  'speak_the_true_name',
];

export const lastTavernStory: StoryDefinition = {
  id: 'last-tavern',
  attributeIds: ['wits', 'nerve', 'grace'],

  createInitialState(name, specialty, _context) {
    const displayName = name.trim().slice(0, 40) || 'the traveler';
    const selected: AttributeId = isAttributeId(specialty) ? specialty : 'wits';
    const stats: Record<AttributeId, number> = {
      wits: 1,
      nerve: 1,
      grace: 1,
    };
    stats[selected] = 2;
    return {
      clock: 0,
      resolve: 3,
      character: { name: displayName, specialty: selected },
      stats,
      locationId: 'main_hall',
      inventoryIds: ['lit_tin_lantern', 'half_burnt_letter'],
      clueIds: [],
      unlockedAbilityIds: [],
      usedAbilityIds: [],
      opening: {
        format: 'prose',
        text: `${displayName === 'the traveler' ? 'The traveler' : displayName} woke beside a dying hearth. A raven watched from the rafters while the chained door breathed cold air around its frame. Beneath the floor, something answered the clock.`,
      },
    };
  },

  isAttribute: isAttributeId,
  getAffordances,

  scenePrompt(session) {
    if (session.phase === 'COMPLETE' && session.endingId)
      return `The manuscript is complete: ${endingLabel(session.endingId)}.`;
    if (session.pendingResolution)
      return 'A saved roll is waiting for its manuscript entry. Write it before taking another action.';
    if (
      session.clueIds.includes('first_name_fragment') &&
      session.clueIds.includes('second_name_fragment')
    )
      return 'The two fragments form VESPER. The breathing waits below the floor.';
    if (session.locationId === 'upstairs_room')
      return 'Rain scratches the upstairs window. The black mirror frame is empty except for one sharp fragment.';
    return 'The hearth fades, the raven watches, and the chained entrance moves in the draft.';
  },

  locationLabel(id) {
    return LOCATION_LABELS[id as LocationId] ?? id;
  },
  itemLabel(id) {
    return ITEM_LABELS[id] ?? id;
  },
  clueLabel(id) {
    return CLUE_LABELS[id] ?? id;
  },
  abilityLabel(id) {
    return ABILITY_LABELS[id as AbilityId] ?? id;
  },
  abilityDescription(id) {
    return ABILITY_DESCRIPTIONS[id as AbilityId] ?? id;
  },
  endingLabel,

  actionDc(actionId) {
    if (actionId === 'speak_the_true_name') return 11;
    if (actionId === 'ask_the_raven' || actionId === 'enter_cellar_unprepared')
      return 14;
    if (actionId === 'improvise') return 15;
    return 13;
  },

  validateAction(session, actionId) {
    if (getAffordances(session).some((action) => action.id === actionId))
      return null;
    if (DYNAMIC_ABILITY_IDS.includes(actionId as AbilityId)) {
      if (!session.unlockedAbilityIds.includes(actionId))
        return {
          code: 'ABILITY_LOCKED',
          message: `${ABILITY_LABELS[actionId as AbilityId]} has not been unlocked. Follow the current affordances.`,
        };
      if (
        session.usedAbilityIds.includes(actionId) &&
        actionId !== 'speak_the_true_name'
      )
        return {
          code: 'ACTION_UNAVAILABLE',
          message: `${ABILITY_LABELS[actionId as AbilityId]} has already been used.`,
        };
      return null;
    }
    return {
      code: 'ACTION_UNAVAILABLE',
      message: `"${actionId}" is not available. Choose one of the returned affordance IDs; no roll occurred.`,
    };
  },

  applyAction(session, actionId, roll, resolutionId) {
    return applyLastTavernAction(session, actionId, roll, resolutionId);
  },
};

function applyLastTavernAction(
  session: ExperienceSession,
  actionId: string,
  roll: RollResult,
  resolutionId: string,
): StoryActionResult {
  const events: CanonicalEvent[] = [];
  const newAbilities: RuntimeAbilityId[] = [];
  session.clock = Math.min(6, session.clock + 1);

  switch (actionId) {
    case 'search_hearth':
      move(session, 'main_hall', events, resolutionId);
      addUnique(session.inventoryIds, 'charred_key');
      addEvent(
        events,
        resolutionId,
        'item',
        'Charred Key found',
        roll.total >= roll.dc
          ? 'A Charred Key waits beneath the loose hearthstone.'
          : "The key is found, but hot ash burns the traveler's hand.",
      );
      break;
    case 'search_upstairs_room':
      move(session, 'upstairs_room', events, resolutionId);
      addUnique(session.inventoryIds, 'black_mirror_shard');
      unlock(session, 'reveal_hidden_ink', events, newAbilities, resolutionId);
      addEvent(
        events,
        resolutionId,
        'item',
        'Black Mirror Shard found',
        roll.total >= roll.dc
          ? 'A Black Mirror Shard lies inside the empty frame.'
          : "The shard is recovered as the room's reflection moves a moment too late.",
      );
      break;
    case 'reveal_hidden_ink':
      markUsed(session, 'reveal_hidden_ink');
      addUnique(session.clueIds, 'first_name_fragment');
      addEvent(
        events,
        resolutionId,
        'clue',
        'First name fragment',
        'Hidden ink on the half-burnt letter reveals the first fragment: VES—.',
      );
      break;
    case 'offer_charred_key_to_raven':
      move(session, 'main_hall', events, resolutionId);
      remove(session.inventoryIds, 'charred_key');
      addUnique(session.clueIds, 'raven_trust');
      unlock(session, 'ask_the_raven', events, newAbilities, resolutionId);
      addEvent(
        events,
        resolutionId,
        'story',
        'The raven accepts the key',
        'The raven takes the Charred Key and chooses to trust the traveler.',
      );
      break;
    case 'ask_the_raven':
      markUsed(session, 'ask_the_raven');
      addUnique(session.clueIds, 'second_name_fragment');
      unlock(
        session,
        'speak_the_true_name',
        events,
        newAbilities,
        resolutionId,
      );
      addEvent(
        events,
        resolutionId,
        'clue',
        'Second name fragment',
        'The raven speaks the second fragment: —PER. Together the hidden name is VESPER.',
      );
      break;
    case 'speak_the_true_name':
      move(session, 'cellar', events, resolutionId);
      markUsed(session, 'speak_the_true_name');
      addEvent(
        events,
        resolutionId,
        'story',
        'The name is spoken',
        'In the cellar, the traveler speaks VESPER and the breathing beneath the tavern stops.',
      );
      break;
    case 'escape_front_door':
      move(session, 'main_hall', events, resolutionId);
      addEvent(
        events,
        resolutionId,
        'story',
        'The chain opens',
        'The Charred Key opens the chained entrance, and the traveler escapes before dawn.',
      );
      break;
    case 'enter_cellar_unprepared':
      move(session, 'cellar', events, resolutionId);
      addEvent(
        events,
        resolutionId,
        'story',
        'The cellar takes its due',
        "Without the complete True Name, the traveler descends and the old keeper's chair turns toward them.",
      );
      break;
    default:
      addEvent(
        events,
        resolutionId,
        'story',
        'The tavern answers',
        roll.total >= roll.dc
          ? 'The attempt reveals how closely the tavern is listening, but no new key or clue appears.'
          : 'The attempt changes nothing except the nearness of the sixth bell.',
      );
  }

  const costly =
    roll.tier === 'costly_success' ||
    roll.tier === 'setback' ||
    roll.tier === 'critical_setback';
  if (costly && !events.some((event) => event.type === 'resolve'))
    loseResolve(
      session,
      events,
      resolutionId,
      'The effort lets the darkness close in.',
    );

  let ending = session.endingId as EndingId | null;
  if (actionId === 'speak_the_true_name') ending = 'true_name';
  else if (actionId === 'escape_front_door') ending = 'escape';
  else if (actionId === 'enter_cellar_unprepared') ending = 'new_keeper';
  else if (session.resolve <= 0 || session.clock >= 6) ending = 'new_keeper';

  if (ending) {
    addEvent(
      events,
      resolutionId,
      'ending',
      ENDING_LABELS[ending],
      endingDetail(ending),
    );
  }

  return {
    canonicalEvents: events,
    newAbilityIds: newAbilities,
    endingId: ending,
  };
}

function move(
  session: ExperienceSession,
  locationId: LocationId,
  events: CanonicalEvent[],
  resolutionId: string,
): void {
  if (session.locationId === locationId) return;
  session.locationId = locationId;
  addEvent(
    events,
    resolutionId,
    'location',
    `Moved to ${LOCATION_LABELS[locationId]}`,
    `The action carries the traveler to the ${LOCATION_LABELS[locationId]}.`,
  );
}

function unlock(
  session: ExperienceSession,
  abilityId: AbilityId,
  events: CanonicalEvent[],
  newAbilities: RuntimeAbilityId[],
  resolutionId: string,
): void {
  if (session.unlockedAbilityIds.includes(abilityId)) return;
  session.unlockedAbilityIds.push(abilityId);
  newAbilities.push(abilityId);
  addEvent(
    events,
    resolutionId,
    'ability',
    `${ABILITY_LABELS[abilityId]} unlocked`,
    `${ABILITY_LABELS[abilityId]} is now an available page ability for ChatGPT.`,
  );
}

function markUsed(session: ExperienceSession, abilityId: AbilityId): void {
  addUnique(session.usedAbilityIds, abilityId);
}

function loseResolve(
  session: ExperienceSession,
  events: CanonicalEvent[],
  resolutionId: string,
  detail: string,
): void {
  session.resolve = Math.max(0, session.resolve - 1);
  addEvent(
    events,
    resolutionId,
    'resolve',
    'Resolve lost',
    `${detail} Resolve falls to ${session.resolve}.`,
  );
}

function addEvent(
  events: CanonicalEvent[],
  resolutionId: string,
  type: CanonicalEvent['type'],
  label: string,
  detail: string,
): void {
  events.push({
    id: `${resolutionId}_event_${events.length + 1}`,
    type,
    label,
    detail,
  });
}

function endingLabel(ending: RuntimeEndingId): string {
  return ENDING_LABELS[ending as EndingId] ?? ending;
}

function endingDetail(ending: EndingId): string {
  if (ending === 'true_name')
    return 'The True Name breaks the cycle. Dawn enters the tavern for the first time in years.';
  if (ending === 'escape')
    return 'The traveler escapes, but the curse remains for whoever opens the tavern next.';
  return "The sixth bell claims the traveler as the tavern's new keeper.";
}

function addUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function remove<T>(values: T[], value: T): void {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}
