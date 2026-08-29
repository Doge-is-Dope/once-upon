import type { Metadata } from 'next';
import { ExperienceApp } from '@/components/experience-app';
import { ExperienceErrorBoundary } from '@/components/experience-error-boundary';
import { DEFAULT_EXPERIENCE_ID, getExperience } from '@/experiences/registry';

const experience = getExperience(DEFAULT_EXPERIENCE_ID)!;

export const metadata: Metadata = {
  title: experience.title,
};

export default function Home() {
  return (
    <ExperienceErrorBoundary experienceTitle={experience.title}>
      <ExperienceApp experienceId={experience.id} />
    </ExperienceErrorBoundary>
  );
}
