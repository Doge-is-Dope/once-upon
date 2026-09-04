import { env } from 'cloudflare:workers';
import type { SharedStoryDocument, ValidatedShare } from './document';
import {
  publishSharedStoryToDatabase,
  readSharedStoryFromDatabase,
  ShareRepositoryError,
  type PublishResult,
} from './database';
import { hasSecureShareSigningSecret } from './security';

type ShareEnvironment = {
  DB: D1Database;
  SHARE_SIGNING_SECRET?: string;
};

export { ShareRepositoryError } from './database';

export async function publishSharedStory(
  share: ValidatedShare,
  clientAddress: string,
  now: number,
): Promise<PublishResult> {
  const { DB, secret } = bindings();
  return publishSharedStoryToDatabase(DB, secret, share, clientAddress, now);
}

export async function readSharedStory(
  token: string,
  now = Date.now(),
): Promise<SharedStoryDocument | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { DB } = bindings();
  return readSharedStoryFromDatabase(DB, token, now);
}

function bindings(): { DB: D1Database; secret: string } {
  const bindings = env as unknown as ShareEnvironment;
  if (!bindings.DB) throw new ShareRepositoryError('D1 is unavailable.', 503);
  if (!hasSecureShareSigningSecret(bindings.SHARE_SIGNING_SECRET))
    throw new ShareRepositoryError(
      'Sharing is not securely configured on this deployment.',
      503,
    );
  return { DB: bindings.DB, secret: bindings.SHARE_SIGNING_SECRET };
}
