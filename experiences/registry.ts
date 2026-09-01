import { experienceDefinitions } from './catalog';
import type { ExperienceDefinition } from '@/lib/runtime/types';

export const DEFAULT_EXPERIENCE_ID = experienceDefinitions[0].id;
export type ExperienceId = (typeof experienceDefinitions)[number]['id'];

export function createExperienceRegistry(
  entries: readonly ExperienceDefinition[],
): ReadonlyMap<string, ExperienceDefinition> {
  const registry = new Map<string, ExperienceDefinition>();
  for (const definition of entries) {
    if (registry.has(definition.id))
      throw new Error(`Duplicate experience ID: ${definition.id}`);
    validateStoryDefinition(definition);
    registry.set(definition.id, definition);
  }
  return registry;
}

function validateStoryDefinition(definition: ExperienceDefinition): void {
  const { story } = definition;
  if (!definition.startMessage.trim() || definition.startMessage.length > 180)
    throw new Error(
      `Experience ${definition.id} requires a short player-facing start message.`,
    );
  if (
    !definition.agentContract.version.trim() ||
    !definition.agentContract.instructions.trim()
  )
    throw new Error(
      `Experience ${definition.id} requires a versioned agent contract.`,
    );
  if (!story.prologue.prose.trim())
    throw new Error(`Experience ${definition.id} declares no prologue.`);
  const discoveryIds = new Set(story.discoveryIds);
  if (discoveryIds.size !== story.discoveryIds.length)
    throw new Error(
      `Experience ${definition.id} declares duplicate discoveries.`,
    );
  const interactionIds = new Set<string>();
  const toolNames = new Set<string>();
  const factIds = new Set<string>();
  for (const interaction of story.interactions) {
    if (
      interactionIds.has(interaction.id) ||
      toolNames.has(interaction.toolName)
    )
      throw new Error(
        `Experience ${definition.id} declares duplicate interactions.`,
      );
    interactionIds.add(interaction.id);
    toolNames.add(interaction.toolName);
    for (const fact of interaction.sealedFacts) factIds.add(fact.id);
  }
  for (const interaction of story.interactions) {
    for (const id of interaction.requiredDiscoveryIds)
      if (!discoveryIds.has(id))
        throw new Error(
          `Interaction ${interaction.id} requires unknown discovery ${id}.`,
        );
    for (const id of interaction.requiredFactIds)
      if (!factIds.has(id))
        throw new Error(
          `Interaction ${interaction.id} requires unknown fact ${id}.`,
        );
    for (const id of interaction.requiredInteractionIds)
      if (!interactionIds.has(id))
        throw new Error(
          `Interaction ${interaction.id} requires unknown interaction ${id}.`,
        );
  }
  const discoveryRequirementIds = new Set<string>();
  for (const requirement of story.discoveryRequirements) {
    if (!discoveryIds.has(requirement.id))
      throw new Error(
        `Story ${story.id} configures unknown discovery ${requirement.id}.`,
      );
    if (discoveryRequirementIds.has(requirement.id))
      throw new Error(
        `Story ${story.id} configures duplicate requirements for discovery ${requirement.id}.`,
      );
    discoveryRequirementIds.add(requirement.id);
    for (const id of requirement.requiredInteractionIds)
      if (!interactionIds.has(id))
        throw new Error(
          `Discovery ${requirement.id} requires unknown interaction ${id}.`,
        );
    for (const id of requirement.requiredFactIds)
      if (!factIds.has(id))
        throw new Error(
          `Discovery ${requirement.id} requires unknown fact ${id}.`,
        );
  }
  for (const id of story.completionRequiredFactIds)
    if (!factIds.has(id))
      throw new Error(
        `Story ${story.id} requires unknown completion fact ${id}.`,
      );

  const completionFacts = new Set(story.completionRequiredFactIds);
  const terminalInteractions = story.interactions.filter(
    ({ completionPolicy }) => completionPolicy === 'must_complete',
  );
  if (terminalInteractions.length !== 1)
    throw new Error(
      `Story ${story.id} must declare exactly one must_complete interaction.`,
    );
  const terminalFactIds = new Set(
    terminalInteractions[0].sealedFacts.map(({ id }) => id),
  );
  for (const id of completionFacts)
    if (!terminalFactIds.has(id))
      throw new Error(
        `Story ${story.id} completion fact ${id} must be revealed by its must_complete interaction.`,
      );
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
