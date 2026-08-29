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
    validateStoryDefinition(definition);
    registry.set(definition.id, definition);
  }
  return registry;
}

function validateStoryDefinition(definition: ExperienceDefinition): void {
  const { story } = definition;
  if (story.attributes.length === 0)
    throw new Error(`Experience ${definition.id} declares no attributes.`);
  const attributeIds = new Set(
    story.attributes.map((attribute) => attribute.id),
  );
  if (attributeIds.size !== story.attributes.length)
    throw new Error(
      `Experience ${definition.id} declares duplicate attribute IDs.`,
    );
  const { maxTurns, maxClock, maxResolve } = story.limits;
  for (const [name, value] of Object.entries({
    maxTurns,
    maxClock,
    maxResolve,
  })) {
    if (!Number.isInteger(value) || value <= 0)
      throw new Error(
        `Experience ${definition.id} has an invalid limit ${name}: ${value}.`,
      );
  }
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
