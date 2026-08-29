import { describe, expect, it } from 'vitest';
import { renderExperienceFrame } from '../components/frames/registry';
import {
  createExperienceRegistry,
  DEFAULT_EXPERIENCE_ID,
  getExperience,
  listExperienceIds,
} from '../experiences/registry';
import { fixtureExperience } from './fixtures';
import { ExperienceController } from '../lib/runtime/controller';

describe('experience registry', () => {
  it('resolves the default and formal experience route identity', () => {
    expect(DEFAULT_EXPERIENCE_ID).toBe('the-last-manuscript');
    expect(listExperienceIds()).toEqual(['the-last-manuscript']);
    expect(getExperience(DEFAULT_EXPERIENCE_ID)).toMatchObject({
      id: 'the-last-manuscript',
      title: 'The Last Manuscript',
      story: { id: 'last-tavern' },
      frame: { id: 'book', narrationFormat: 'prose' },
      narration: { format: 'prose' },
    });
    expect(getExperience('unknown-experience')).toBeNull();
  });

  it('rejects incompatible frame and narration contracts', () => {
    const invalid = fixtureExperience();
    invalid.frame = { id: 'fixture', narrationFormat: 'terminal' };
    expect(() => createExperienceRegistry([invalid])).toThrow(
      'incompatible frame and narration formats',
    );
  });

  it('rejects duplicate experience IDs', () => {
    expect(() =>
      createExperienceRegistry([
        fixtureExperience('same-id'),
        fixtureExperience('same-id'),
      ]),
    ).toThrow('Duplicate experience ID');
  });

  it('dispatches the configured renderer and rejects unsupported pairings', () => {
    const experience = getExperience(DEFAULT_EXPERIENCE_ID)!;
    const rendered = renderExperienceFrame(
      experience,
      new ExperienceController(experience),
    );
    expect(rendered.props.experience).toBe(experience);

    const unsupported = fixtureExperience('fixture-terminal', 'terminal');
    expect(() =>
      renderExperienceFrame(unsupported, new ExperienceController(unsupported)),
    ).toThrow('Unsupported frame and narration pairing');
  });
});
