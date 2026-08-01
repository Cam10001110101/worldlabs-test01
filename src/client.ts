/**
 * Marble / World Labs client — request core + one method per endpoint.
 *
 * The wire format is snake_case; the public surface is camelCase. Every
 * request body is validated with {@link import("./schemas.js").toWire} and
 * every response is validated with {@link import("./schemas.js").fromWire}.
 * The API key is stored in a closure-local variable and is never placed in
 * error messages, stack traces, or the {@link WorldLabsError.body} payload.
 */

import {
  CreditsResponseSchema,
  DeleteWorldResponseSchema,
  GenerateWorldResponseSchema,
  GetOperationResponseSchema,
  ListWorldsResponseSchema,
  MediaAssetPrepareUploadRequestSchema,
  MediaAssetPrepareUploadResponseSchema,
  MediaAssetSchema,
  PanoDepthToRgbRequestSchema,
  WorldSchema,
  WorldsGenerateRequestSchema,
  buildListWorldsBody,
  fromWire,
  toWire,
} from "./schemas.js";
import {
  MissingApiKeyError,
  NetworkError,
  OperationFailedError,
  OperationTimeoutError,
  mapHttpError,
} from "./errors.js";
import type {
  ClientOptions,
  CreditsResponse,
  DeleteWorldResponse,
  GenerateWorldResponse,
  GetOperationResponse,
  ListWorldsRequest,
  ListWorldsResponse,
  MediaAsset,
  MediaAssetPrepareUploadRequest,
  MediaAssetPrepareUploadResponse,
  PanoDepthToRgbRequest,
  PanoDepthToRgbResult,
  WorldsGenerateRequest,
  World,
} from "./types.js";
import type { z } from "zod";

const DEFAULT_BASE_URL = "https://api.worldlabs.ai";
const DEFAULT_TIMEOUT_MS = 30_000;
const API_PREFIX = "/marble/v1";
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000;

/** Options for {@link Client.waitForOperation}. */
export type WaitForOperationOptions = {
  /** Poll interval in ms (default 2000). */
  intervalMs?: number;
  /** Max total wall-clock time to wait before throwing {@link OperationTimeoutError} (default 600000 = 10 min). */
  timeoutMs?: number;
  /** Injectable sleep, for deterministic tests (default: `setTimeout`-based). */
  sleep?: (ms: number) => Promise<void>;
  /** Called with each polled operation snapshot, before the done-check. */
  onProgress?: (op: GetOperationResponse) => void;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Build a URL query string from a params record (drops null/undefined). */
function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** Parse a response body as JSON, falling back to raw text or null. */
async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Internal options for a single request. */
type RequestOptions = {
  body?: unknown;
  params?: Record<string, unknown>;
  schema: z.ZodSchema<unknown>;
};

/** The public client returned by {@link createClient}. */
export type Client = {
  /** `POST /worlds:generate` — starts an async generation; returns the operation. */
  generateWorld: (req: WorldsGenerateRequest) => Promise<GenerateWorldResponse>;
  /** `GET /operations/{id}` — fetch the current state of a long-running operation. */
  getOperation: (operationId: string) => Promise<GetOperationResponse>;
  /**
   * Poll `GET /operations/{id}` until it completes. Resolves with the
   * operation's `response` on success; throws {@link OperationFailedError}
   * if the operation completed with an error, or {@link OperationTimeoutError}
   * if `timeoutMs` elapses first.
   */
  waitForOperation: (
    operationId: string,
    opts?: WaitForOperationOptions,
  ) => Promise<World | PanoDepthToRgbResult>;
  /** `GET /worlds/{id}` — fetch a fully-realized world. */
  getWorld: (worldId: string) => Promise<World>;
  /** `POST /worlds:list` — page through worlds. */
  listWorlds: (req?: ListWorldsRequest) => Promise<ListWorldsResponse>;
  /** `DELETE /worlds/{id}` — delete a world. */
  deleteWorld: (worldId: string) => Promise<DeleteWorldResponse>;
  /** `POST /media-assets:prepare_upload` — get a signed upload URL + asset record. */
  prepareMediaUpload: (req: MediaAssetPrepareUploadRequest) => Promise<MediaAssetPrepareUploadResponse>;
  /** `GET /media-assets/{id}` — fetch a registered media asset. */
  getMediaAsset: (mediaAssetId: string) => Promise<MediaAsset>;
  /** `POST /pano:depth_to_rgb` — async pano depth→RGB; returns an operation. */
  panoDepthToRgb: (req: PanoDepthToRgbRequest) => Promise<GetOperationResponse>;
  /** `GET /credits` — remaining credit balance. */
  getCredits: () => Promise<CreditsResponse>;
};

/**
 * Create a Marble client.
 *
 * The API key resolves from `options.apiKey` → `process.env.WLT_API_KEY`. If
 * neither is present a {@link MissingApiKeyError} is thrown. The key is held
 * in a closure and never logged.
 */
export function createClient(options: ClientOptions = {}): Client {
  const apiKey = resolveApiKey(options.apiKey);
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * Core request routine. Validates the body, sends it snake_case, parses the
   * response camelCase, and maps non-2xx statuses to typed SDK errors.
   */
  async function request<T>(
    method: string,
    path: string,
    { body, params, schema }: RequestOptions,
  ): Promise<T> {
    const url = `${baseUrl}${API_PREFIX}${path}${params ? buildQuery(params) : ""}`;

    const headers: Record<string, string> = {
      "WLT-Api-Key": apiKey,
      Accept: "application/json",
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new NetworkError(`Request to ${url} aborted after ${timeoutMs}ms`, err);
      }
      throw new NetworkError(`Network error requesting ${url}: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timer);
    }

    const raw = await parseBody(response);

    if (!response.ok) {
      throw mapHttpError(response.status, raw, url);
    }

    return fromWire(schema, raw) as T;
  }

  function getOperationImpl(operationId: string): Promise<GetOperationResponse> {
    return request("GET", `/operations/${encodeURIComponent(operationId)}`, {
      schema: GetOperationResponseSchema,
    });
  }

  async function waitForOperation(
    operationId: string,
    opts: WaitForOperationOptions = {},
  ): Promise<World | PanoDepthToRgbResult> {
    const intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const pollTimeoutMs = opts.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const sleep = opts.sleep ?? defaultSleep;
    const deadline = Date.now() + pollTimeoutMs;
    let last: GetOperationResponse;

    for (;;) {
      last = await getOperationImpl(operationId);
      opts.onProgress?.(last);

      if (last.done) {
        if (last.error) {
          throw new OperationFailedError(
            `Operation ${operationId} failed: ${last.error.message ?? "unknown error"}`,
            last,
          );
        }
        if (last.response) return last.response;
        // Defensive: the API contract says done + !error implies a response.
        throw new OperationFailedError(
          `Operation ${operationId} completed without an error or a response`,
          last,
        );
      }

      if (Date.now() + intervalMs > deadline) {
        throw new OperationTimeoutError(pollTimeoutMs, last);
      }
      await sleep(intervalMs);
    }
  }

  return {
    generateWorld(req) {
      return request("POST", "/worlds:generate", {
        body: toWire(WorldsGenerateRequestSchema, req),
        schema: GenerateWorldResponseSchema,
      });
    },
    getOperation: getOperationImpl,
    waitForOperation,
    getWorld(worldId) {
      return request("GET", `/worlds/${encodeURIComponent(worldId)}`, {
        schema: WorldSchema,
      });
    },
    listWorlds(req = {}) {
      return request("POST", "/worlds:list", {
        body: buildListWorldsBody(req),
        schema: ListWorldsResponseSchema,
      });
    },
    deleteWorld(worldId) {
      return request("DELETE", `/worlds/${encodeURIComponent(worldId)}`, {
        schema: DeleteWorldResponseSchema,
      });
    },
    prepareMediaUpload(req) {
      return request("POST", "/media-assets:prepare_upload", {
        body: toWire(MediaAssetPrepareUploadRequestSchema, req),
        schema: MediaAssetPrepareUploadResponseSchema,
      });
    },
    getMediaAsset(mediaAssetId) {
      return request("GET", `/media-assets/${encodeURIComponent(mediaAssetId)}`, {
        schema: MediaAssetSchema,
      });
    },
    panoDepthToRgb(req) {
      return request("POST", "/pano:depth_to_rgb", {
        body: toWire(PanoDepthToRgbRequestSchema, req),
        schema: GetOperationResponseSchema,
      });
    },
    getCredits() {
      return request("GET", "/credits", { schema: CreditsResponseSchema });
    },
  };
}

/** Resolve the API key from options or the environment. */
function resolveApiKey(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit;
  // `process` may be undefined in non-Node runtimes (Workers); guard access.
  const envKey = typeof process !== "undefined" ? process.env.WLT_API_KEY : undefined;
  if (envKey && envKey.trim()) return envKey;
  throw new MissingApiKeyError();
}