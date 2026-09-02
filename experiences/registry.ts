import { experienceDefinitions } from './catalog';
import {
  hasMatchingParagraphStructure,
  hasSecondPersonPronoun,
} from '@/lib/manuscript/prose';
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
  if (!story.prologue.prose.trim() || !story.prologue.recordProse.trim())
    throw new Error(`Experience ${definition.id} declares no prologue.`);
  validateRecordText(
    definition.id,
    story.prologue.prose,
    story.prologue.recordProse,
  );
  validateRecordText(
    definition.id,
    story.completionPassage.prose,
    story.completionPassage.recordProse,
  );
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
    for (const fact of interaction.sealedFacts) {
      factIds.add(fact.id);
      validateRecordText(definition.id, fact.value, fact.recordValue);
    }
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
  const clueIds = new Set<string>();
  for (const clue of story.clues) {
    if (clueIds.has(clue.id))
      throw new Error(`Story ${story.id} declares duplicate clue ${clue.id}.`);
    clueIds.add(clue.id);
    if (!clue.id.trim() || !clue.title.trim() || !clue.observation.trim())
      throw new Error(`Story ${story.id} declares an incomplete clue.`);

    if (
      clue.revealedBy.kind === 'discovery' &&
      !discoveryIds.has(clue.revealedBy.id)
    )
      throw new Error(
        `Clue ${clue.id} reveals from unknown discovery ${clue.revealedBy.id}.`,
      );
    if (clue.revealedBy.kind === 'fact' && !factIds.has(clue.revealedBy.id))
      throw new Error(
        `Clue ${clue.id} reveals from unknown fact ${clue.revealedBy.id}.`,
      );
    if (!clue.lead) continue;
    if (!clue.lead.text.trim())
      throw new Error(`Clue ${clue.id} declares an empty lead.`);
    if (
      clue.lead.target.kind === 'discovery' &&
      !discoveryIds.has(clue.lead.target.id)
    )
      throw new Error(
        `Clue ${clue.id} leads to unknown discovery ${clue.lead.target.id}.`,
      );
    if (
      clue.lead.target.kind === 'interaction' &&
      !interactionIds.has(clue.lead.target.id)
    )
      throw new Error(
        `Clue ${clue.id} leads to unknown interaction ${clue.lead.target.id}.`,
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

function validateRecordText(
  experienceId: string,
  prose: string,
  recordProse: string,
): void {
  if (!prose.trim() || !recordProse.trim())
    throw new Error(
      `Experience ${experienceId} requires both authored text versions.`,
    );
  if (!hasMatchingParagraphStructure(prose, recordProse))
    throw new Error(
      `Experience ${experienceId} record text must preserve paragraph structure.`,
    );
  if (hasSecondPersonPronoun(recordProse))
    throw new Error(
      `Experience ${experienceId} record text contains second person.`,
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
