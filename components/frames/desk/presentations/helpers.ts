import type { ManuscriptEffect } from '@/lib/manuscript/read-model';
import { flattenParagraphBlocks } from '@/lib/manuscript/prose';

export function effectParagraphs(effect: ManuscriptEffect): string[] {
  return effect.facts.flatMap(({ value }) => factParagraphs(value));
}

export function factParagraphs(value: string): string[] {
  return flattenParagraphBlocks(value);
}

export function factLines(value: string): {
  lead: string;
  note: string | null;
} {
  const [lead, ...rest] = value.split('\n');
  const note = rest.join(' ').trim();
  return { lead: lead.trim(), note: note || null };
}
