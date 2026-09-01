import {
  SHARE_LIMITS,
  ShareValidationError,
  validateSharedStorySubmission,
} from '@/lib/share/document';
import {
  publishSharedStory,
  ShareRepositoryError,
} from '@/lib/share/repository';

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin)
    return json({ error: 'Cross-origin publishing is not allowed.' }, 403);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > SHARE_LIMITS.maxBytes)
    return json({ error: 'The manuscript is larger than 100 KiB.' }, 413);

  try {
    const value = JSON.parse(text) as unknown;
    const now = Date.now();
    const share = validateSharedStorySubmission(value, now);
    const clientAddress =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'local-client';
    const published = await publishSharedStory(share, clientAddress, now);
    return json(
      {
        path: `/s/${published.token}`,
        expiresAt: published.expiresAt,
      },
      published.idempotent ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      return json({ error: 'Request body must be valid JSON.' }, 400);
    if (
      error instanceof ShareValidationError ||
      error instanceof ShareRepositoryError
    )
      return json({ error: error.message }, error.status);
    console.error('Could not publish shared story', error);
    return json({ error: 'The public link could not be created.' }, 500);
  }
}

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
