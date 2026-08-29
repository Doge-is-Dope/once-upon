import { describe, expect, it } from 'vitest';
import { createExperienceSession } from '../lib/runtime/engine';
import {
  activeExperienceKey,
  SessionStore,
  type SessionPersistence,
} from '../lib/runtime/store';
import { fixtureExperience, testContext } from './fixtures';

class MemoryPersistence implements SessionPersistence {
  readonly records = new Map<string, unknown>();

  async read(key: string) {
    return this.records.get(key);
  }

  async write(key: string, value: unknown) {
    this.records.set(key, structuredClone(value));
  }

  async mutate(key: string, transform: (value: unknown) => unknown) {
    const next = transform(structuredClone(this.records.get(key)));
    if (next != null) this.records.set(key, structuredClone(next));
    return next;
  }

  async delete(key: string) {
    this.records.delete(key);
  }

  async move(fromKey: string, toKey: string) {
    if (this.records.has(fromKey))
      this.records.set(toKey, this.records.get(fromKey));
    this.records.delete(fromKey);
  }
}

describe('experience session storage isolation', () => {
  it('uses a distinct active key for every experience', () => {
    expect(activeExperienceKey('fixture-alpha')).toBe('active:fixture-alpha');
    expect(activeExperienceKey('fixture-beta')).toBe('active:fixture-beta');
  });

  it('keeps save, restart, and quarantine operations scoped to one experience', async () => {
    const persistence = new MemoryPersistence();
    const alphaDefinition = fixtureExperience('fixture-alpha');
    const betaDefinition = fixtureExperience('fixture-beta');
    const alpha = new SessionStore(
      { experienceId: alphaDefinition.id, storyId: alphaDefinition.story.id },
      persistence,
    );
    const beta = new SessionStore(
      { experienceId: betaDefinition.id, storyId: betaDefinition.story.id },
      persistence,
    );

    await alpha.write(
      createExperienceSession(alphaDefinition, 'Alpha', 'focus', testContext()),
    );
    await beta.write(
      createExperienceSession(
        betaDefinition,
        'Beta',
        'composure',
        testContext(),
      ),
    );

    await alpha.clear();
    expect(await alpha.read()).toBeNull();
    expect((await beta.read())?.character.name).toBe('Beta');

    await beta.quarantineCorrupt();
    expect(await beta.read()).toBeNull();
    expect(
      [...persistence.records.keys()].some((key) =>
        key.startsWith('corrupt:fixture-beta:'),
      ),
    ).toBe(true);
    expect(
      [...persistence.records.keys()].some((key) =>
        key.startsWith('corrupt:fixture-alpha:'),
      ),
    ).toBe(false);
  });

  it('rejects a session saved under the wrong experience identity', async () => {
    const persistence = new MemoryPersistence();
    const alphaDefinition = fixtureExperience('fixture-alpha');
    const betaDefinition = fixtureExperience('fixture-beta');
    const alphaSession = createExperienceSession(
      alphaDefinition,
      'Alpha',
      'focus',
      testContext(),
    );
    persistence.records.set(
      activeExperienceKey(betaDefinition.id),
      alphaSession,
    );

    await expect(
      new SessionStore(
        { experienceId: betaDefinition.id, storyId: betaDefinition.story.id },
        persistence,
      ).read(),
    ).rejects.toThrow('SAVE_CORRUPT');
  });

  it('rejects a save written by a different story under the same experience', async () => {
    const persistence = new MemoryPersistence();
    const definition = fixtureExperience('fixture-alpha');
    const session = createExperienceSession(
      definition,
      'Alpha',
      'focus',
      testContext(),
    );
    persistence.records.set(activeExperienceKey(definition.id), session);

    const swappedStory = new SessionStore(
      { experienceId: definition.id, storyId: 'signal-station-v2' },
      persistence,
    );
    await expect(swappedStory.read()).rejects.toThrow(
      'SAVE_CORRUPT: The saved story belongs to a different story version.',
    );

    const sameStory = new SessionStore(
      { experienceId: definition.id, storyId: definition.story.id },
      persistence,
    );
    expect((await sameStory.read())?.character.name).toBe('Alpha');
  });
});
