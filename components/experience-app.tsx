'use client';

import { useState, useSyncExternalStore } from 'react';
import { AvailabilitySlip } from '@/components/frames/desk/availability-slip';
import { renderExperienceFrame } from '@/components/frames/registry';
import { getExperience } from '@/experiences/registry';
import { ExperienceController } from '@/lib/runtime/controller';

const DESKTOP_SUPPORT_QUERY = '(max-width: 40rem)';

type NavigatorWithUserAgentData = {
  userAgent: string;
  userAgentData?: { mobile: boolean };
};

export function ExperienceApp({ experienceId }: { experienceId: string }) {
  const experience = requireExperience(experienceId);
  const restricted = useSyncExternalStore(
    subscribeToSupportBoundary,
    readClientRestriction,
    readServerRestriction,
  );
  const [controllerHolder] = useState(() => new ExperienceControllerHolder());

  if (restricted) return <RestrictedExperience />;
  return renderExperienceFrame(experience, controllerHolder.get(experience));
}

class ExperienceControllerHolder {
  #controller: ExperienceController | null = null;

  get(experience: ReturnType<typeof requireExperience>) {
    this.#controller ??= new ExperienceController(experience);
    return this.#controller;
  }
}

function RestrictedExperience() {
  return (
    <main className="restricted-experience" data-support-restricted>
      <AvailabilitySlip
        className="restricted-experience-slip"
        headingLevel="h1"
        title="Access restricted"
        titleId="restricted-experience-title"
      >
        <p>Open this record on a larger desktop screen to continue.</p>
      </AvailabilitySlip>
    </main>
  );
}

function subscribeToSupportBoundary(onStoreChange: () => void) {
  const query = window.matchMedia(DESKTOP_SUPPORT_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function readClientRestriction() {
  return (
    window.matchMedia(DESKTOP_SUPPORT_QUERY).matches ||
    isMobileBrowser(navigator as NavigatorWithUserAgentData)
  );
}

function readServerRestriction() {
  return true;
}

export function isMobileBrowser(identity: NavigatorWithUserAgentData) {
  if (identity.userAgentData) return identity.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|IEMobile|Opera Mini/i.test(
    identity.userAgent,
  );
}

function requireExperience(experienceId: string) {
  const experience = getExperience(experienceId);
  if (!experience) throw new Error(`Unknown experience: ${experienceId}`);
  return experience;
}
