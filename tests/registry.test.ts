import { describe, expect, it } from 'vitest';
import {
  createExperienceRegistry,
  DEFAULT_EXPERIENCE_ID,
  getExperience,
} from '../experiences/registry';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';

describe('experience registry', () => {
  it('resolves the curated living manuscript', () => {
    expect(DEFAULT_EXPERIENCE_ID).toBe('the-last-manuscript');
    expect(getExperience(DEFAULT_EXPERIENCE_ID)).toBe(experienceDefinition);
  });

  it('keeps the player kickoff short and the internal agent contract versioned', () => {
    expect(experienceDefinition.startMessage.length).toBeLessThanOrEqual(180);
    expect(experienceDefinition.startMessage).not.toMatch(
      /get_story_state|begin_story_turn|commit_story_chapter|revision|receipt/,
    );
    expect(experienceDefinition.agentContract).toMatchObject({
      version: 'last-manuscript-agent-v2',
      instructions: expect.stringContaining('recordProse'),
    });
    expect(experienceDefinition.agentContract.instructions).toContain(
      'interaction receipt is already visible prose',
    );
    const memory = experienceDefinition.story.interactions.find(
      ({ id }) => id === 'north_station_memory',
    );
    expect(memory?.description).toContain(
      'explicitly chooses to close their eyes',
    );
    expect(memory?.description).toContain('remembered announcement');
  });

  it('rejects an empty agent contract', () => {
    expect(() =>
      createExperienceRegistry([
        {
          ...experienceDefinition,
          id: 'missing-agent-contract',
          agentContract: { version: '', instructions: '' },
        },
      ]),
    ).toThrow('requires a versioned agent contract');
  });

  it('rejects a presentation the frame cannot render', () => {
    const unsupported = {
      ...experienceDefinition,
      id: 'unsupported-presentation',
      story: {
        ...experienceDefinition.story,
        interactions: experienceDefinition.story.interactions.map(
          (interaction, index) =>
            index === 0
              ? { ...interaction, presentation: 'hologram' }
              : interaction,
        ),
      },
    };
    expect(() => createExperienceRegistry([unsupported])).toThrow(
      'uses presentation hologram, which frame book cannot render',
    );
  });

  it('rejects duplicate authored interaction or tool identities', () => {
    const duplicate = {
      ...experienceDefinition,
      id: 'duplicate-tools',
      story: {
        ...experienceDefinition.story,
        interactions: [
          experienceDefinition.story.interactions[0],
          experienceDefinition.story.interactions[0],
        ],
      },
    };
    expect(() => createExperienceRegistry([duplicate])).toThrow(
      'duplicate interactions',
    );
  });

  it('rejects duplicate or incomplete authored clues', () => {
    const clue = experienceDefinition.story.clues[0]!;
    const duplicate = {
      ...experienceDefinition,
      id: 'duplicate-clues',
      story: {
        ...experienceDefinition.story,
        clues: [clue, clue],
      },
    };
    expect(() => createExperienceRegistry([duplicate])).toThrow(
      `duplicate clue ${clue.id}`,
    );

    const incomplete = {
      ...experienceDefinition,
      id: 'incomplete-clue',
      story: {
        ...experienceDefinition.story,
        clues: [{ ...clue, observation: ' ' }],
      },
    };
    expect(() => createExperienceRegistry([incomplete])).toThrow(
      'incomplete clue',
    );
  });

  it('rejects clue references outside the authored story graph', () => {
    const clue = experienceDefinition.story.clues[0]!;
    const unknownFact = {
      ...experienceDefinition,
      id: 'unknown-clue-fact',
      story: {
        ...experienceDefinition.story,
        clues: [
          {
            ...clue,
            revealedBy: { kind: 'fact' as const, id: 'invented_fact' },
          },
        ],
      },
    };
    expect(() => createExperienceRegistry([unknownFact])).toThrow(
      'unknown fact invented_fact',
    );

    const unknownLead = {
      ...experienceDefinition,
      id: 'unknown-clue-lead',
      story: {
        ...experienceDefinition.story,
        clues: [
          {
            ...clue,
            lead: {
              text: 'Follow it.',
              target: {
                kind: 'interaction' as const,
                id: 'invented_interaction',
              },
            },
          },
        ],
      },
    };
    expect(() => createExperienceRegistry([unknownLead])).toThrow(
      'unknown interaction invented_interaction',
    );
  });

  it('rejects interaction prerequisites outside the authored allowlist', () => {
    const invalid = {
      ...experienceDefinition,
      id: 'invalid-prerequisite',
      story: {
        ...experienceDefinition.story,
        interactions: [
          {
            ...experienceDefinition.story.interactions[0],
            requiredDiscoveryIds: ['prompt_injected_discovery'],
          },
        ],
      },
    };
    expect(() => createExperienceRegistry([invalid])).toThrow(
      'unknown discovery',
    );
  });

  it('rejects fact prerequisites that no interaction declares', () => {
    const invalid = {
      ...experienceDefinition,
      id: 'invalid-fact-prerequisite',
      story: {
        ...experienceDefinition.story,
        interactions: [
          {
            ...experienceDefinition.story.interactions[0],
            requiredFactIds: ['invented_fact'],
          },
        ],
      },
    };
    expect(() => createExperienceRegistry([invalid])).toThrow(
      'unknown fact invented_fact',
    );
  });

  it('rejects discovery requirements outside the authored story graph', () => {
    const unknownDiscovery = {
      ...experienceDefinition,
      id: 'invalid-discovery-requirement',
      story: {
        ...experienceDefinition.story,
        discoveryRequirements: [
          {
            id: 'invented_discovery',
            requiredInteractionIds: [],
            requiredFactIds: [],
          },
        ],
      },
    };
    expect(() => createExperienceRegistry([unknownDiscovery])).toThrow(
      'unknown discovery invented_discovery',
    );

    const unknownInteraction = {
      ...experienceDefinition,
      id: 'invalid-discovery-interaction',
      story: {
        ...experienceDefinition.story,
        discoveryRequirements: [
          {
            id: 'manuscript_found',
            requiredInteractionIds: ['invented_interaction'],
            requiredFactIds: [],
          },
        ],
      },
    };
    expect(() => createExperienceRegistry([unknownInteraction])).toThrow(
      'unknown interaction invented_interaction',
    );
  });

  it('rejects completion facts that no interaction declares', () => {
    const invalid = {
      ...experienceDefinition,
      id: 'invalid-completion-fact',
      story: {
        ...experienceDefinition.story,
        completionRequiredFactIds: ['invented_ending'],
      },
    };
    expect(() => createExperienceRegistry([invalid])).toThrow(
      'unknown completion fact invented_ending',
    );
  });
});
