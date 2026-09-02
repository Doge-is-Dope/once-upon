import {
  parseSharedStoryDocument,
  SHARE_LIMITS,
  type SharedStoryDocument,
  type ValidatedShare,
} from './document';

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

export async function publishSharedStoryToDatabase(
  DB: D1Database,
  secret: string,
  share: ValidatedShare,
  clientAddress: string,
  now: number,
): Promise<PublishResult> {
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
    const document = parseSharedStoryDocument(existing.document_json);
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

  await cleanupExpiredRows(DB, now);
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

export async function readSharedStoryFromDatabase(
  DB: D1Database,
  token: string,
  now: number,
): Promise<SharedStoryDocument | null> {
  const tokenHash = await sha256Hex(token);
  const row = await DB.prepare(
    'SELECT document_json, expires_at FROM shared_stories WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<Pick<StoredStoryRow, 'document_json' | 'expires_at'>>();
  if (!row || row.expires_at <= now) return null;
  return parseSharedStoryDocument(row.document_json);
}

async function cleanupExpiredRows(DB: D1Database, now: number): Promise<void> {
  await DB.batch([
    DB.prepare('DELETE FROM shared_stories WHERE expires_at <= ?').bind(now),
    DB.prepare('DELETE FROM share_publish_windows WHERE window_start < ?').bind(
      now - 2 * 3_600_000,
    ),
  ]);
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
