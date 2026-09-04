import { describe, expect, it } from 'vitest';
import {
  createExperienceRegistry,
  DEFAULT_EXPERIENCE_ID,
  getExperience,
} from '@/experiences/registry';
import { experienceDefinition } from '@/experiences/the-last-manuscript/definition';

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
      version: 'last-manuscript-agent-v3',
      instructions: expect.not.stringContaining('recordProse'),
    });
    // The agent writes prose only; the fixed ending still carries the
    // official wording it rewrites itself into.
    expect(experienceDefinition.story.narration).toBe('prose');
    expect(experienceDefinition.story.prologue.recordProse).toBeUndefined();
    expect(experienceDefinition.story.completionPassage.recordProse).toContain(
      'The subject continues walking.',
    );
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

  it('keeps the approved account visible and its branch agent-only', () => {
    const memory = experienceDefinition.story.interactions.find(
      ({ id }) => id === 'north_station_memory',
    )!;
    const approved = memory.sealedFacts.find(
      ({ id }) => id === 'approved_north_station_account',
    )!;
    expect(approved.heading).toBe('The speaker');
    expect(approved.value).toContain('It asks you to repeat it.');
    expect(approved.value).not.toContain('Words correct');
    expect(approved.agentNote).toContain(
      'Words correct. Memory response inconsistent.',
    );
  });

  it('hands the agent the physical canon the notebook describes', () => {
    const { instructions } = experienceDefinition.agentContract;
    expect(instructions).toContain('sewn into one volume with thread');
    expect(instructions).toContain('coil');
    expect(instructions).toContain('table’s edge');
    // Sent with every get_story_state, so it stays bounded.
    expect(instructions.length).toBeLessThan(2400);

    const pencil = experienceDefinition.story.clues.find(
      ({ id }) => id === 'pencil',
    )!;
    expect(pencil.observation).toContain('edge of the table');
    expect(pencil.observation).not.toContain('beneath the desk');
    const manuscript = experienceDefinition.story.clues.find(
      ({ id }) => id === 'sewn-manuscript',
    )!;
    expect(manuscript.observation).toContain('sewn together with thread');
  });

  it('rejects an empty fact heading or agent note', () => {
    const withFact = (patch: { heading?: string; agentNote?: string }) => ({
      ...experienceDefinition,
      id: 'bad-fact-fields',
      story: {
        ...experienceDefinition.story,
        id: 'bad-fact-fields-v1',
        interactions: experienceDefinition.story.interactions.map(
          (interaction, index) =>
            index === 0
              ? {
                  ...interaction,
                  sealedFacts: interaction.sealedFacts.map((fact) => ({
                    ...fact,
                    ...patch,
                  })),
                }
              : interaction,
        ),
      },
    });
    expect(() =>
      createExperienceRegistry([withFact({ heading: '   ' })]),
    ).toThrow('needs a short, non-empty heading');
    expect(() =>
      createExperienceRegistry([withFact({ heading: 'x'.repeat(41) })]),
    ).toThrow('needs a short, non-empty heading');
    expect(() =>
      createExperienceRegistry([withFact({ agentNote: '' })]),
    ).toThrow('declares an empty agent note');
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
