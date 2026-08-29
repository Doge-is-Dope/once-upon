'use client';

import { createContext, useContext } from 'react';
import type { ExperienceDefinition } from '@/lib/runtime/types';

export const BookExperienceContext = createContext<ExperienceDefinition | null>(
  null,
);

export function useExperience(): ExperienceDefinition {
  const experience = useContext(BookExperienceContext);
  if (!experience)
    throw new Error('Book frame components need a BookExperienceContext.');
  return experience;
}
