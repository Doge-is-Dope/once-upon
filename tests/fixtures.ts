import {
  PROSE_NARRATION_CONTRACT,
  TERMINAL_NARRATION_CONTRACT,
} from '../lib/runtime/narration';
import type {
  EngineContext,
  ExperienceDefinition,
  ExperienceSession,
  NarrationFormat,
  StoryDefinition,
} from '../lib/runtime/types';

export function testContext(): EngineContext {
  let sequence = 0;
  return {
    now: () => 1_700_000_000_000 + sequence,
    id: (prefix) => `${prefix}_test_${++sequence}`,
  };
}

const fixtureStory: StoryDefinition = {
  id: 'signal-station',
  attributeIds: ['focus', 'composure'],
  createInitialState(name, specialty) {
    return {
      clock: 0,
      resolve: 3,
      character: { name: name.trim() || 'the visitor', specialty },
      stats: { focus: specialty === 'focus' ? 2 : 1, composure: 1 },
      locationId: 'arrival',
      inventoryIds: ['receiver'],
      clueIds: [],
      unlockedAbilityIds: [],
      usedAbilityIds: [],
      opening: {
        format: 'prose',
        text: 'A signal waits beyond the static while the visitor studies the quiet receiver and decides where to begin, certain that each confirmed detail will shape what comes next.',
      },
    };
  },
  isAttribute(value) {
    return this.attributeIds.includes(value);
  },
  getAffordances() {
    return [
      {
        id: 'inspect_signal',
        label: 'Inspect the signal',
        description: 'Trace the strongest frequency.',
        suggestedApproaches: ['focus'],
      },
    ];
  },
  scenePrompt(session) {
    return session.pendingResolution
      ? 'A saved result is waiting for narration.'
      : 'The receiver is ready.';
  },
  locationLabel: (id) => (id === 'arrival' ? 'Arrival' : id),
  itemLabel: (id) => (id === 'receiver' ? 'Receiver' : id),
  clueLabel: (id) => id,
  abilityLabel: (id) => id,
  abilityDescription: () => '',
  endingLabel: (id) => id,
  actionDc: () => 10,
  validateAction(_session, actionId) {
    return actionId === 'inspect_signal'
      ? null
      : { code: 'ACTION_UNAVAILABLE', message: 'Unknown action.' };
  },
  applyAction(session, _actionId, _roll, resolutionId) {
    session.clock += 1;
    session.clueIds.push('frequency');
    return {
      canonicalEvents: [
        {
          id: `${resolutionId}:frequency`,
          type: 'clue',
          label: 'Frequency',
          detail: 'A repeating frequency is now confirmed.',
        },
      ],
      newAbilityIds: [],
      endingId: null,
    };
  },
};

export function fixtureExperience(
  id = 'fixture-alpha',
  format: NarrationFormat = 'prose',
): ExperienceDefinition {
  const story: StoryDefinition =
    format === 'terminal'
      ? {
          ...fixtureStory,
          createInitialState(name, specialty, context) {
            return {
              ...fixtureStory.createInitialState(name, specialty, context),
              opening: {
                format: 'terminal',
                lines: [{ kind: 'system', text: 'signal receiver online' }],
              },
            };
          },
        }
      : fixtureStory;
  return {
    id,
    title: `Fixture ${id}`,
    story,
    frame: { id: `fixture-${format}`, narrationFormat: format },
    narration:
      format === 'prose'
        ? PROSE_NARRATION_CONTRACT
        : TERMINAL_NARRATION_CONTRACT,
    startMessage: 'Start.',
    continueMessage: 'Continue.',
  };
}

export function validProse() {
  return {
    format: 'prose' as const,
    text: 'The visitor follows the confirmed frequency through the static, keeping every saved fact intact while the receiver settles into a steady pulse and the next choice comes into view.',
  };
}

export function cloneSession(session: ExperienceSession): ExperienceSession {
  return structuredClone(session);
}
