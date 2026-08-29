import { describe, expect, it } from 'vitest';
import type {
  EngineContext,
  ExperienceSession,
  RollResult,
  StoryDefinition,
} from '../lib/runtime/types';
import { testContext } from './fixtures';

// Reusable contract suite: every StoryDefinition wired into the catalog
// should pass these checks. Register a new story here (or call this helper
// from its own test file) to validate it before it ships.
export function describeStoryContract(story: StoryDefinition): void {
  describe(`story contract: ${story.id}`, () => {
    it('declares non-empty, unique attributes with labels', () => {
      expect(story.attributes.length).toBeGreaterThan(0);
      const ids = story.attributes.map((attribute) => attribute.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const attribute of story.attributes) {
        expect(attribute.label).not.toBe('');
        expect(story.isAttribute(attribute.id)).toBe(true);
      }
      expect(story.isAttribute('__not_an_attribute__')).toBe(false);
    });

    it('declares positive integer limits', () => {
      for (const value of Object.values(story.limits)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    });

    it('creates an initial state consistent with its declarations', () => {
      const initial = story.createInitialState(
        'Contract Tester',
        story.attributes[0].id,
        testContext(),
      );
      expect(initial.clock).toBeLessThanOrEqual(story.limits.maxClock);
      expect(initial.resolve).toBeLessThanOrEqual(story.limits.maxResolve);
      for (const attribute of story.attributes)
        expect(typeof initial.stats[attribute.id]).toBe('number');
      expect(story.locationLabel(initial.locationId)).not.toBe('');
      for (const itemId of initial.inventoryIds)
        expect(story.itemLabel(itemId)).not.toBe('');
      for (const clueId of initial.clueIds)
        expect(story.clueLabel(clueId)).not.toBe('');
      for (const abilityId of initial.unlockedAbilityIds)
        expect(story.abilityLabel(abilityId)).not.toBe('');
    });

    it('accepts and applies every initial affordance', () => {
      const context = testContext();
      const affordances = story.getAffordances(contractSession(story, context));
      expect(affordances.length).toBeGreaterThan(0);
      for (const affordance of affordances) {
        expect(affordance.label).not.toBe('');
        for (const approach of affordance.suggestedApproaches)
          expect(story.isAttribute(approach)).toBe(true);
        expect(story.actionDc(affordance.id)).toBeGreaterThan(0);

        const session = contractSession(story, context);
        expect(story.validateAction(session, affordance.id)).toBeNull();
        const result = story.applyAction(
          session,
          affordance.id,
          contractRoll(affordance.suggestedApproaches[0]),
          `${affordance.id}_resolution`,
        );
        for (const event of result.canonicalEvents) {
          expect(event.label).not.toBe('');
          expect(event.detail).not.toBe('');
        }
        if (result.endingId)
          expect(story.endingLabel(result.endingId)).not.toBe('');
      }
    });

    it('rejects an unknown action without throwing', () => {
      const session = contractSession(story, testContext());
      const failure = story.validateAction(session, '__unknown_action__');
      expect(failure).not.toBeNull();
      expect(failure?.message).not.toBe('');
    });
  });
}

function contractSession(
  story: StoryDefinition,
  context: EngineContext,
): ExperienceSession {
  const initial = story.createInitialState(
    'Contract Tester',
    story.attributes[0].id,
    context,
  );
  return {
    schemaVersion: 2,
    experienceId: 'contract-test',
    storyId: story.id,
    sessionId: 'contract-session',
    revision: 1,
    phase: 'READY_FOR_ACTION',
    turn: 0,
    clock: initial.clock,
    resolve: initial.resolve,
    character: initial.character,
    stats: { ...initial.stats },
    locationId: initial.locationId,
    inventoryIds: [...initial.inventoryIds],
    clueIds: [...initial.clueIds],
    unlockedAbilityIds: [...initial.unlockedAbilityIds],
    usedAbilityIds: [...initial.usedAbilityIds],
    narrationEntries: [],
    pendingResolution: null,
    endingId: null,
    operationLedger: [],
  };
}

function contractRoll(attribute: string): RollResult {
  return {
    die: 10,
    attribute,
    modifier: 1,
    total: 11,
    dc: 10,
    tier: 'success',
  };
}
