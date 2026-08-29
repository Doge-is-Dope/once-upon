import { BookExperience } from '@/components/frames/book/book-experience';
import type { ExperienceController } from '@/lib/runtime/controller';
import type { ExperienceDefinition } from '@/lib/runtime/types';

export function renderExperienceFrame(
  experience: ExperienceDefinition,
  controller: ExperienceController,
) {
  if (
    experience.frame.id === 'book' &&
    experience.narration.format === 'prose'
  ) {
    return <BookExperience controller={controller} experience={experience} />;
  }

  throw new Error(
    `Unsupported frame and narration pairing: ${experience.frame.id}/${experience.narration.format}`,
  );
}
