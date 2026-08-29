import { experienceDefinitions } from './catalog';
import type { ExperienceDefinition } from '@/lib/runtime/types';

export const DEFAULT_EXPERIENCE_ID = experienceDefinitions[0].id;
export type ExperienceId = (typeof experienceDefinitions)[number]['id'];

export function createExperienceRegistry(
  entries: readonly ExperienceDefinition[],
): ReadonlyMap<string, ExperienceDefinition> {
  const registry = new Map<string, ExperienceDefinition>();
  for (const definition of entries) {
    if (definition.frame.narrationFormat !== definition.narration.format) {
      throw new Error(
        `Experience ${definition.id} pairs incompatible frame and narration formats.`,
      );
    }
    if (registry.has(definition.id))
      throw new Error(`Duplicate experience ID: ${definition.id}`);
    registry.set(definition.id, definition);
  }
  return registry;
}

const registry = createExperienceRegistry(experienceDefinitions);

export function getExperience(
  experienceId: string,
): ExperienceDefinition | null {
  return registry.get(experienceId) ?? null;
}

export function listExperienceIds(): ExperienceId[] {
  return experienceDefinitions.map((definition) => definition.id);
}
