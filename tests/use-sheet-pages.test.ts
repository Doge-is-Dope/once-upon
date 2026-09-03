import { describe, expect, it } from 'vitest';
import { pageCountFromExtent } from '@/components/frames/desk/use-sheet-pages';

describe('sheet page count', () => {
  it('uses only the real multicol content extent', () => {
    expect(pageCountFromExtent(1000, 1100, 100)).toBe(1);
    expect(pageCountFromExtent(2100, 1100, 100)).toBe(2);
    expect(pageCountFromExtent(3200, 1100, 100)).toBe(3);
  });

  it('allows page count to shrink with content', () => {
    expect(pageCountFromExtent(3200, 1100, 100)).toBe(3);
    expect(pageCountFromExtent(1000, 1100, 100)).toBe(1);
  });
});
