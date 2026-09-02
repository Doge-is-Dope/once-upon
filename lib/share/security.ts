export const SHARE_SIGNING_SECRET_MIN_BYTES = 32;

export function hasSecureShareSigningSecret(
  value: string | undefined,
): value is string {
  return (
    typeof value === 'string' &&
    new TextEncoder().encode(value).byteLength >= SHARE_SIGNING_SECRET_MIN_BYTES
  );
}
