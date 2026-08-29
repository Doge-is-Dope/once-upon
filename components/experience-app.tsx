'use client';

import { useState } from 'react';
import { renderExperienceFrame } from '@/components/frames/registry';
import { getExperience } from '@/experiences/registry';
import { ExperienceController } from '@/lib/runtime/controller';

export function ExperienceApp({ experienceId }: { experienceId: string }) {
  const experience = requireExperience(experienceId);

  const [controller] = useState(() => new ExperienceController(experience));
  return renderExperienceFrame(experience, controller);
}

function requireExperience(experienceId: string) {
  const experience = getExperience(experienceId);
  if (!experience) throw new Error(`Unknown experience: ${experienceId}`);
  return experience;
}
