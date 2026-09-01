import { env } from 'cloudflare:workers';
import { SCHEMA_STATEMENTS } from '@/db/schema';
import {
  parseSharedStoryDocument,
  SHARE_LIMITS,
  type SharedStoryDocument,
  type ValidatedShare,
} from './document';

type ShareEnvironment = {
  DB: D1Database;
  SHARE_SIGNING_SECRET?: string;
};

type StoredStoryRow = {
  token_hash: string;
  request_hash: string;
  payload_hash: string;
  document_json: string;
  expires_at: number;
};

export type PublishResult = {
  token: string;
  expiresAt: string;
  idempotent: boolean;
};

export class ShareRepositoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let schemaReady: Promise<void> | null = null;

export async function publishSharedStory(
  share: ValidatedShare,
  clientAddress: string,
  now: number,
): Promise<PublishResult> {
  const { DB, secret } = bindings();
  await ensureSchema(DB);
  await cleanup(DB, now);

  const payload = JSON.stringify(share.submission);
  const requestHash = await hmacHex(secret, share.submission.requestId);
  const payloadHash = await sha256Hex(payload);
  const existing = await DB.prepare(
    'SELECT token_hash, request_hash, payload_hash, document_json, expires_at FROM shared_stories WHERE request_hash = ?',
  )
    .bind(requestHash)
    .first<StoredStoryRow>();
  const token = await shareToken(secret, share.submission.requestId);

  if (existing && existing.expires_at > now) {
    if (existing.payload_hash !== payloadHash)
      throw new ShareRepositoryError(
        'This requestId was already used for a different manuscript.',
        409,
      );
    const document = parseStoredDocument(existing.document_json);
    return { token, expiresAt: document.expiresAt, idempotent: true };
  }

  const clientHash = await hmacHex(secret, clientAddress || 'anonymous');
  const windowStart = Math.floor(now / 3_600_000) * 3_600_000;
  await DB.prepare(
    `INSERT INTO share_publish_windows (client_hash, window_start, publish_count)
     VALUES (?, ?, 1)
     ON CONFLICT(client_hash, window_start)
     DO UPDATE SET publish_count = publish_count + 1`,
  )
    .bind(clientHash, windowStart)
    .run();
  const window = await DB.prepare(
    'SELECT publish_count FROM share_publish_windows WHERE client_hash = ? AND window_start = ?',
  )
    .bind(clientHash, windowStart)
    .first<{ publish_count: number }>();
  if ((window?.publish_count ?? 0) > SHARE_LIMITS.publishesPerHour)
    throw new ShareRepositoryError(
      'Too many manuscripts were published from this client. Try again later.',
      429,
    );

  const tokenHash = await sha256Hex(token);
  await DB.prepare(
    `INSERT INTO shared_stories
     (token_hash, request_hash, payload_hash, document_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      requestHash,
      payloadHash,
      JSON.stringify(share.document),
      now,
      Date.parse(share.document.expiresAt),
    )
    .run();

  return {
    token,
    expiresAt: share.document.expiresAt,
    idempotent: false,
  };
}

export async function readSharedStory(
  token: string,
  now = Date.now(),
): Promise<SharedStoryDocument | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { DB } = bindings();
  await ensureSchema(DB);
  await cleanup(DB, now);
  const tokenHash = await sha256Hex(token);
  const row = await DB.prepare(
    'SELECT document_json, expires_at FROM shared_stories WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<Pick<StoredStoryRow, 'document_json' | 'expires_at'>>();
  if (!row || row.expires_at <= now) return null;
  return parseStoredDocument(row.document_json);
}

function bindings(): { DB: D1Database; secret: string } {
  const bindings = env as unknown as ShareEnvironment;
  if (!bindings.DB) throw new ShareRepositoryError('D1 is unavailable.', 503);
  if (!bindings.SHARE_SIGNING_SECRET)
    throw new ShareRepositoryError(
      'Sharing is not configured on this deployment.',
      503,
    );
  return { DB: bindings.DB, secret: bindings.SHARE_SIGNING_SECRET };
}

async function ensureSchema(DB: D1Database): Promise<void> {
  schemaReady ??= DB.batch(
    SCHEMA_STATEMENTS.map((statement) => DB.prepare(statement)),
  ).then(() => undefined);
  await schemaReady;
}

async function cleanup(DB: D1Database, now: number): Promise<void> {
  await DB.batch([
    DB.prepare('DELETE FROM shared_stories WHERE expires_at <= ?').bind(now),
    DB.prepare('DELETE FROM share_publish_windows WHERE window_start < ?').bind(
      now - 2 * 3_600_000,
    ),
  ]);
}

function parseStoredDocument(value: string): SharedStoryDocument {
  return parseSharedStoryDocument(value);
}

async function shareToken(secret: string, requestId: string): Promise<string> {
  const signature = await hmacBytes(secret, `story:${requestId}`);
  return base64Url(signature.slice(0, 24));
}

async function hmacHex(secret: string, value: string): Promise<string> {
  return hex(await hmacBytes(secret, value));
}

async function hmacBytes(secret: string, value: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(value)),
  );
}

async function sha256Hex(value: string): Promise<string> {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  );
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
