import { describe, expect, it } from "vitest";
import {
  AuthError,
  NotFoundError,
  OutOfCreditsError,
  RateLimitError,
  RequestValidationError,
  ServerError,
  WorldLabsError,
  mapHttpError,
} from "../src/errors.js";

const SECRET_VALUE = "sk-super-secret-value";
const URL = "https://api.worldlabs.ai/marble/v1/worlds:generate";

describe("mapHttpError", () => {
  it("maps 401/403 to AuthError", () => {
    expect(mapHttpError(401, { detail: "no" }, URL)).toBeInstanceOf(AuthError);
    expect(mapHttpError(403, { detail: "no" }, URL)).toBeInstanceOf(AuthError);
  });

  it("maps 402 to OutOfCreditsError and extracts detail", () => {
    const err = mapHttpError(402, { detail: "Add credits at https://platform.worldlabs.ai/billing" }, URL);
    expect(err).toBeInstanceOf(OutOfCreditsError);
    expect((err as OutOfCreditsError).detail).toBe("Add credits at https://platform.worldlabs.ai/billing");
    expect(err.status).toBe(402);
  });

  it("maps 404 to NotFoundError", () => {
    expect(mapHttpError(404, { detail: "not found" }, URL)).toBeInstanceOf(NotFoundError);
  });

  it("maps a well-formed 422 to RequestValidationError carrying the detail list", () => {
    const body = { detail: [{ loc: ["body", "world_prompt"], msg: "field required", type: "missing" }] };
    const err = mapHttpError(422, body, URL) as RequestValidationError;
    expect(err).toBeInstanceOf(RequestValidationError);
    expect(err.validation.detail).toHaveLength(1);
    expect(err.validation.detail[0]?.msg).toBe("field required");
  });

  it("falls back to an empty detail list for a malformed 422 body", () => {
    const err = mapHttpError(422, { unexpected: "shape" }, URL) as RequestValidationError;
    expect(err).toBeInstanceOf(RequestValidationError);
    expect(err.validation.detail).toEqual([]);
  });

  it("maps 429 to RateLimitError", () => {
    expect(mapHttpError(429, null, URL)).toBeInstanceOf(RateLimitError);
  });

  it("maps 5xx to ServerError", () => {
    expect(mapHttpError(500, null, URL)).toBeInstanceOf(ServerError);
    expect(mapHttpError(503, null, URL)).toBeInstanceOf(ServerError);
  });

  it("falls back to the base WorldLabsError for unmapped statuses", () => {
    const err = mapHttpError(418, null, URL);
    expect(err).toBeInstanceOf(WorldLabsError);
    expect(err).not.toBeInstanceOf(AuthError);
    expect(err.status).toBe(418);
  });

  it("redacts secret-looking keys from the error message", () => {
    const err = mapHttpError(500, { wlt_api_key: SECRET_VALUE, detail: "boom" }, URL);
    expect(err.message).not.toContain(SECRET_VALUE);
    expect(err.message).toContain("[redacted]");
  });

  it("redacts secret-looking keys from the attached body", () => {
    const err = mapHttpError(500, { authorization: SECRET_VALUE, detail: "boom" }, URL);
    const bodyJson = JSON.stringify(err.body);
    expect(bodyJson).not.toContain(SECRET_VALUE);
    expect(bodyJson).not.toContain("authorization");
    expect(bodyJson).toContain("[redacted]");
    // Non-secret fields survive redaction untouched.
    expect((err.body as Record<string, unknown>).detail).toBe("boom");
  });
});
