import { describe, expect, it } from 'vitest';
import { webMcpToolNames } from './registry';

describe('WebMCP registry', () => {
  it('exposes ten distinct atomic tools', () => {
    const names = webMcpToolNames();
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    expect(names).toEqual(expect.arrayContaining(['get_public_game_state', 'propose_learn_questions', 'propose_accusation']));
  });
});
