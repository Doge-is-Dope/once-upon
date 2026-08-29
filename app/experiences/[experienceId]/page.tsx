import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExperienceApp } from '@/components/experience-app';
import { ExperienceErrorBoundary } from '@/components/experience-error-boundary';
import { getExperience, listExperienceIds } from '@/experiences/registry';

type ExperienceRouteProps = {
  params: Promise<{ experienceId: string }>;
};

export function generateStaticParams() {
  return listExperienceIds().map((experienceId) => ({ experienceId }));
}

export async function generateMetadata({
  params,
}: ExperienceRouteProps): Promise<Metadata> {
  const { experienceId } = await params;
  const experience = getExperience(experienceId);
  if (!experience) return {};
  return { title: experience.title };
}

export default async function ExperienceRoute({
  params,
}: ExperienceRouteProps) {
  const { experienceId } = await params;
  const experience = getExperience(experienceId);
  if (!experience) notFound();

  return (
    <ExperienceErrorBoundary experienceTitle={experience.title}>
      <ExperienceApp experienceId={experience.id} />
    </ExperienceErrorBoundary>
  );
}
