'use client';

import { createContext, useContext } from 'react';
import type { ExperienceDefinition } from '@/lib/runtime/types';
import { isBookFrameDefinition, type BookFrameCopy } from './types';

export const BookExperienceContext = createContext<ExperienceDefinition | null>(
  null,
);

export function useExperience(): ExperienceDefinition {
  const experience = useContext(BookExperienceContext);
  if (!experience)
    throw new Error('Book frame components need a BookExperienceContext.');
  return experience;
}

export function useBookFrameCopy(): BookFrameCopy {
  const { frame } = useExperience();
  if (!isBookFrameDefinition(frame))
    throw new Error('The book frame needs a BookFrameDefinition with copy.');
  return frame.copy;
}
