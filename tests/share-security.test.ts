import { describe, expect, it } from 'vitest';
import { readSharedStoryFromDatabase } from '@/lib/share/database';
import {
  hasSecureShareSigningSecret,
  SHARE_SIGNING_SECRET_MIN_BYTES,
} from '@/lib/share/security';

describe('shared story security', () => {
  it('requires at least 32 bytes of signing-secret entropy material', () => {
    expect(hasSecureShareSigningSecret(undefined)).toBe(false);
    expect(hasSecureShareSigningSecret('x'.repeat(31))).toBe(false);
    expect(hasSecureShareSigningSecret('x'.repeat(32))).toBe(true);
    expect(hasSecureShareSigningSecret('密'.repeat(11))).toBe(true);
    expect(SHARE_SIGNING_SECRET_MIN_BYTES).toBe(32);
  });

  it('reads an unexpired story without issuing a database write', async () => {
    const statements: string[] = [];
    const document = {
      version: 1 as const,
      title: 'Read-only record',
      createdAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-10-01T00:00:00.000Z',
      chapters: [],
    };
    const prepared = {
      bind: () => prepared,
      first: async () => ({
        document_json: JSON.stringify(document),
        expires_at: Date.parse(document.expiresAt),
      }),
    };
    const DB = {
      prepare: (statement: string) => {
        statements.push(statement);
        return prepared;
      },
      batch: () => {
        throw new Error('readSharedStory must not write or batch statements');
      },
    } as unknown as D1Database;

    await expect(
      readSharedStoryFromDatabase(
        DB,
        'a'.repeat(32),
        Date.parse('2026-09-02T00:00:00.000Z'),
      ),
    ).resolves.toEqual(document);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^SELECT /);
  });
});
