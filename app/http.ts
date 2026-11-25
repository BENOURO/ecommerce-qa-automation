/** Small shared helpers for the app under test: error type and input validation. */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Parses a route parameter like "12" into a positive 32-bit integer, or null if invalid. */
export function parseId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return n <= 2147483647 ? n : null;
}

export function isQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function isNonEmptyString(value: unknown, maxLength = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/** Request bodies are untrusted: treat them as unknown fields, never as typed data. */
export function bodyOf(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}
