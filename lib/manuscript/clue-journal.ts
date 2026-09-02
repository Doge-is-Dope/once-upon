import { deriveInteractionSurface } from '../runtime/engine';
import type {
  ExperienceDefinition,
  ExperienceSession,
  StoryClueDefinition,
} from '../runtime/types';

export interface PlayerClueEntry {
  id: string;
  title: string;
  observation: string;
  revealedAt: number;
  lead: string | null;
}

export function derivePlayerClues(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): PlayerClueEntry[] {
  const discoveries = new Map(
    session.discoveries.map((discovery) => [discovery.id, discovery]),
  );
  const facts = new Map(session.facts.map((fact) => [fact.id, fact]));
  const interactions = new Map(
    deriveInteractionSurface(definition, session).map((surface) => [
      surface.interaction.id,
      surface,
    ]),
  );

  return definition.story.clues
    .map((clue, authoredIndex) => {
      const revealedAt = clueRevealedAt(clue, session, discoveries, facts);
      if (revealedAt === null) return null;
      return {
        authoredIndex,
        prologue: clue.revealedBy.kind === 'prologue',
        id: clue.id,
        title: clue.title,
        observation: clue.observation,
        revealedAt,
        lead: availableLead(
          clue,
          definition,
          session,
          discoveries,
          facts,
          interactions,
        ),
      };
    })
    .filter((clue): clue is NonNullable<typeof clue> => clue !== null)
    .sort(
      (left, right) =>
        right.revealedAt - left.revealedAt ||
        (left.prologue && right.prologue
          ? left.authoredIndex - right.authoredIndex
          : right.authoredIndex - left.authoredIndex),
    )
    .map(
      ({ authoredIndex: _authoredIndex, prologue: _prologue, ...clue }) => clue,
    );
}

function clueRevealedAt(
  clue: StoryClueDefinition,
  session: ExperienceSession,
  discoveries: Map<string, ExperienceSession['discoveries'][number]>,
  facts: Map<string, ExperienceSession['facts'][number]>,
): number | null {
  if (clue.revealedBy.kind === 'prologue')
    return session.chapters[0]?.createdAt ?? 0;
  if (clue.revealedBy.kind === 'discovery')
    return discoveries.get(clue.revealedBy.id)?.discoveredAt ?? null;
  return facts.get(clue.revealedBy.id)?.revealedAt ?? null;
}

function availableLead(
  clue: StoryClueDefinition,
  definition: ExperienceDefinition,
  session: ExperienceSession,
  discoveries: Map<string, ExperienceSession['discoveries'][number]>,
  facts: Map<string, ExperienceSession['facts'][number]>,
  interactions: Map<
    string,
    ReturnType<typeof deriveInteractionSurface>[number]
  >,
): string | null {
  if (!clue.lead || session.phase !== 'READY') return null;
  const target = clue.lead.target;
  if (target.kind === 'interaction')
    return interactions.get(target.id)?.callable ? clue.lead.text : null;

  if (discoveries.has(target.id)) return null;
  const requirement = definition.story.discoveryRequirements.find(
    ({ id }) => id === target.id,
  );
  if (!requirement) return clue.lead.text;
  const completedInteractions = new Set(
    session.interactionUses
      .filter(({ status }) => status === 'retired')
      .map(({ interactionId }) => interactionId),
  );
  const prerequisitesMet =
    requirement.requiredFactIds.every((id) => facts.has(id)) &&
    requirement.requiredInteractionIds.every((id) =>
      completedInteractions.has(id),
    );
  return prerequisitesMet ? clue.lead.text : null;
}
