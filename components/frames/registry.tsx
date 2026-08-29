import { BookExperience } from '@/components/frames/book/book-experience';
import type { ExperienceController } from '@/lib/runtime/controller';
import type { ExperienceDefinition } from '@/lib/runtime/types';

type FrameRenderer = (
  experience: ExperienceDefinition,
  controller: ExperienceController,
) => React.ReactElement<Record<string, unknown>>;

// One entry per frame. The experience registry already validates that a
// definition pairs its frame with a compatible narration format.
const FRAME_RENDERERS: Record<string, FrameRenderer | undefined> = {
  book: (experience, controller) => (
    <BookExperience controller={controller} experience={experience} />
  ),
};

export function renderExperienceFrame(
  experience: ExperienceDefinition,
  controller: ExperienceController,
) {
  const render = FRAME_RENDERERS[experience.frame.id];
  if (!render) {
    throw new Error(
      `Unsupported frame and narration pairing: ${experience.frame.id}/${experience.narration.format}`,
    );
  }
  return render(experience, controller);
}
