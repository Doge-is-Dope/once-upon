'use client';

import { useEffect, useState } from 'react';
import type { TurnResolution } from '@/lib/runtime/types';
import { useExperience } from './experience-context';
import { tierLabel, titleCase } from './formatters';
import { prefersReducedMotion } from './motion';

export function RollCard({
  resolution,
  settle = false,
}: {
  resolution: TurnResolution;
  settle?: boolean;
}) {
  const roll = resolution.roll;
  const [shownDie, setShownDie] = useState(() =>
    settle && !prefersReducedMotion() ? null : roll.die,
  );

  useEffect(() => {
    if (!settle || prefersReducedMotion()) return;
    const startedAt = performance.now();
    let lastSwap = 0;
    let frame = 0;
    const spin = (now: number) => {
      if (now - startedAt >= 420) {
        setShownDie(roll.die);
        return;
      }
      if (now - lastSwap >= 55) {
        lastSwap = now;
        setShownDie(1 + Math.floor(Math.random() * 20));
      }
      frame = window.requestAnimationFrame(spin);
    };
    frame = window.requestAnimationFrame(spin);
    return () => {
      window.cancelAnimationFrame(frame);
      setShownDie(roll.die);
    };
  }, [settle, roll.die]);

  return (
    <div
      className={`roll-card${settle ? ' is-settling' : ''}`}
      data-settling={settle ? 'true' : 'false'}
      data-tier={roll.tier}
      aria-label={`D20 result: ${roll.die} plus ${titleCase(roll.attribute)} ${roll.modifier} equals ${roll.total} against ${roll.dc}. ${tierLabel(roll.tier)}.`}
    >
      <span className="die">{shownDie ?? roll.die}</span>
      <div>
        <strong>{tierLabel(roll.tier)}</strong>
        <span className="roll-math">
          {roll.die} + {titleCase(roll.attribute)} {roll.modifier} ={' '}
          {roll.total} vs {roll.dc}
        </span>
      </div>
    </div>
  );
}

export function AbilityCard({
  abilityId,
  celebrate = false,
}: {
  abilityId: string;
  celebrate?: boolean;
}) {
  const { story } = useExperience();
  return (
    <div
      className={`ability-card${celebrate ? ' is-unlocking' : ''}`}
      data-new={celebrate ? 'true' : 'false'}
    >
      <span className="ability-sigil" aria-hidden="true">
        ✦
      </span>
      <div>
        <small>The book learns a spell</small>
        <strong>{story.abilityLabel(abilityId)}</strong>
        <p>{story.abilityDescription(abilityId)}</p>
      </div>
    </div>
  );
}
