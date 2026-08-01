/**
 * Public entry point for `@worldlabs/marble-client`.
 *
 * Wire-format internals (Zod schemas, `toWire`/`fromWire`, the snake_case
 * conversion layer in `./schemas.js`) are intentionally not re-exported —
 * they are implementation details of the camelCase↔snake_case boundary, not
 * part of the supported public API.
 */

export { createClient } from "./client.js";
export type { Client, WaitForOperationOptions } from "./client.js";

// All public request/response/entity types (camelCase surface).
export type * from "./types.js";

// Error hierarchy — the only runtime values re-exported besides createClient.
export {
  WorldLabsError,
  MissingApiKeyError,
  AuthError,
  OutOfCreditsError,
  RequestValidationError,
  NotFoundError,
  RateLimitError,
  ServerError,
  NetworkError,
  OperationFailedError,
  OperationTimeoutError,
} from "./errors.js";
