/**
 * Error hierarchy for the World Labs / Marble client.
 *
 * All errors extend {@link WorldLabsError}. Messages are constructed from
 * the HTTP status, the request URL, and a **redacted** summary of the response
 * body — the API key is never inspected, stored, or included in any message
 * or stack trace.
 */

import type { HttpValidationError } from "./types.js";

/** Base class for every error thrown by the SDK. */
export class WorldLabsError extends Error {
  /** HTTP status, or `undefined` for non-HTTP failures (network, timeout). */
  readonly status?: number;
  /** Raw parsed response body (already redacted of secrets), if any. */
  readonly body: unknown;

  constructor(message: string, opts: { status?: number; body?: unknown; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    // exactOptionalPropertyTypes: optional fields cannot be assigned undefined.
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.body !== undefined) this.body = opts.body;
    // Maintain a proper stack trace where supported.
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }
}

/** No API key was supplied and `WLT_API_KEY` is unset. */
export class MissingApiKeyError extends WorldLabsError {
  constructor() {
    super(
      "Missing World Labs API key. Set ClientOptions.apiKey or the WLT_API_KEY environment variable.",
    );
  }
}

/** 401 / 403 — authentication or authorization failure. */
export class AuthError extends WorldLabsError {}

/** 402 — account is out of credits. `detail` from the body is surfaced. */
export class OutOfCreditsError extends WorldLabsError {
  /** Human-readable detail from the API (e.g. a billing link / message). */
  readonly detail?: string;
  constructor(body: unknown, url: string) {
    const detail = extractDetail(body);
    super(`Out of credits (402) at ${url}${detail ? `: ${detail}` : ""}`, {
      status: 402,
      body: redactBody(body),
    });
    // exactOptionalPropertyTypes: optional field cannot be assigned undefined.
    if (detail !== undefined) this.detail = detail;
  }
}

/** 422 — request body failed server-side validation. Carries the full error list. */
export class RequestValidationError extends WorldLabsError {
  readonly validation: HttpValidationError;
  constructor(validation: HttpValidationError, url: string) {
    super(`Request validation failed (422) at ${url}`, { status: 422, body: validation });
    this.validation = validation;
  }
}

/** 404 — resource not found (or caller lacks access to it). */
export class NotFoundError extends WorldLabsError {}

/** 429 — rate limited. Retry after backing off. */
export class RateLimitError extends WorldLabsError {}

/** 5xx — server-side failure. */
export class ServerError extends WorldLabsError {}

/** The `fetch` call threw or was aborted before a response arrived. */
export class NetworkError extends WorldLabsError {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

/** A polled operation completed with `done=true` and a non-null `error`. */
export class OperationFailedError extends WorldLabsError {
  constructor(message: string, body: unknown) {
    super(message, { body });
  }
}

/** A polled operation did not complete within the configured timeout. */
export class OperationTimeoutError extends WorldLabsError {
  /** The last operation snapshot observed before timing out. */
  readonly lastSnapshot: unknown;
  constructor(timeoutMs: number, lastSnapshot: unknown) {
    super(`Operation did not complete within ${timeoutMs}ms`);
    this.lastSnapshot = lastSnapshot;
  }
}

/**
 * Header / body keys that must never appear in redacted error output.
 * The redaction regex is built from this set so the two stay in sync.
 */
const SECRET_KEYS = [
  "wlt-api-key",
  "wlt_api_key",
  "api_key",
  "apikey",
  "authorization",
  "x-api-key",
  "cookie",
];

/** Case-insensitive regex matching any secret key, built from SECRET_KEYS. */
const SECRET_KEY_RE = new RegExp(
  `"(${SECRET_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})"\\s*:\\s*"[^"]*"`,
  "gi",
);

/** Pull the `detail` string out of a 402 body, if present. */
function extractDetail(body: unknown): string | undefined {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as Record<string, unknown>).detail;
    if (typeof d === "string") return d;
  }
  return undefined;
}

/**
 * Produce a short, secret-free string summary of an arbitrary response body.
 * Used only for error messages.
 */
function redactedSummary(body: unknown): string {
  if (body === null || body === undefined) return "";
  try {
    const json = JSON.stringify(body);
    if (json === undefined) return "";
    // Defensive: strip any accidental secret-looking header keys.
    return json.replace(SECRET_KEY_RE, '"[redacted]":"[redacted]"');
  } catch {
    return String(body).slice(0, 200);
  }
}

/**
 * Redact secret-looking keys from a parsed response body before attaching it
 * to an error instance via {@link WorldLabsError.body}. Round-trips through
 * JSON so the redaction regex applies uniformly; falls back to the original
 * value if the body isn't JSON-serializable.
 */
function redactBody(body: unknown): unknown {
  if (body === null || body === undefined || typeof body !== "object") return body;
  try {
    const json = JSON.stringify(body);
    if (json === undefined) return body;
    return JSON.parse(json.replace(SECRET_KEY_RE, '"[redacted]":"[redacted]"'));
  } catch {
    return body;
  }
}

/**
 * Map a non-2xx HTTP response to a typed SDK error.
 *
 * @param status HTTP status code.
 * @param body   Parsed JSON body (or null if the body was empty / unparseable).
 * @param url    Request URL (for diagnostics).
 */
export function mapHttpError(status: number, body: unknown, url: string): WorldLabsError {
  const summary = redactedSummary(body);
  const tail = summary ? `: ${summary}` : "";
  const safeBody = redactBody(body);

  switch (status) {
    case 401:
    case 403:
      return new AuthError(`Authentication failed (${status}) at ${url}${tail}`, {
        status,
        body: safeBody,
      });
    case 402:
      return new OutOfCreditsError(body, url);
    case 404:
      return new NotFoundError(`Not found (404) at ${url}${tail}`, { status, body: safeBody });
    case 422: {
      // HttpValidationError: { detail: [{ loc, msg, type }, ...] }
      if (
        body &&
        typeof body === "object" &&
        "detail" in body &&
        Array.isArray((body as Record<string, unknown>).detail)
      ) {
        return new RequestValidationError(body as HttpValidationError, url);
      }
      // Fallback if the server returned 422 without the expected shape.
      return new RequestValidationError({ detail: [] }, url);
    }
    case 429:
      return new RateLimitError(`Rate limited (429) at ${url}${tail}`, { status, body: safeBody });
    default:
      if (status >= 500) {
        return new ServerError(`Server error (${status}) at ${url}${tail}`, { status, body: safeBody });
      }
      return new WorldLabsError(`Unexpected response (${status}) at ${url}${tail}`, {
        status,
        body: safeBody,
      });
  }
}