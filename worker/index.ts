/**
 * Thin Hono-on-Workers proxy over the Marble client SDK. No D1/DO/KV
 * bindings — pure fetch proxy. Routes mirror the real Marble API 1:1 under
 * `/marble/v1` so this worker can act as a server-side-key-holding drop-in
 * for callers who already know the Marble API.
 *
 * Set the server-side key with: wrangler secret put WLT_API_KEY
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { ZodError } from "zod";
import { createClient } from "../src/client.js";
import type { Client } from "../src/client.js";
import {
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
} from "../src/errors.js";
import { pickSpzUrl, renderViewerHtml, renderViewerErrorHtml } from "./viewer.js";

/** Workers secret, set via `wrangler secret put WLT_API_KEY`. Not a binding/var. */
export type Env = {
  WLT_API_KEY: string;
};

type AppEnv = { Bindings: Env; Variables: { client: Client } };

const marble = new Hono<AppEnv>();

marble.use("*", async (c, next) => {
  c.set("client", createClient({ apiKey: c.env.WLT_API_KEY }));
  await next();
});

marble.post("/worlds:generate", async (c) => {
  const body = await c.req.json();
  return c.json(await c.get("client").generateWorld(body));
});

marble.get("/operations/:operationId", async (c) => {
  return c.json(await c.get("client").getOperation(c.req.param("operationId")));
});

marble.get("/worlds/:worldId", async (c) => {
  return c.json(await c.get("client").getWorld(c.req.param("worldId")));
});

marble.post("/worlds:list", async (c) => {
  const raw = await c.req.text();
  const body = raw ? JSON.parse(raw) : {};
  return c.json(await c.get("client").listWorlds(body));
});

marble.delete("/worlds/:worldId", async (c) => {
  return c.json(await c.get("client").deleteWorld(c.req.param("worldId")));
});

marble.post("/media-assets:prepare_upload", async (c) => {
  const body = await c.req.json();
  return c.json(await c.get("client").prepareMediaUpload(body));
});

marble.get("/media-assets/:mediaAssetId", async (c) => {
  return c.json(await c.get("client").getMediaAsset(c.req.param("mediaAssetId")));
});

marble.post("/pano:depth_to_rgb", async (c) => {
  const body = await c.req.json();
  return c.json(await c.get("client").panoDepthToRgb(body));
});

marble.get("/credits", async (c) => {
  return c.json(await c.get("client").getCredits());
});

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/marble/v1", marble);

function getClient(c: Context<AppEnv>): Client {
  return createClient({ apiKey: c.env.WLT_API_KEY });
}

/**
 * Server-rendered splat viewer for a Marble world. Resolves the world's
 * splat URL here (never exposing WLT_API_KEY to the browser) and hands the
 * browser a self-contained, CDN-only HTML page that renders it with Spark.
 */
app.get("/view/:worldId", async (c) => {
  const worldId = c.req.param("worldId");
  const world = await getClient(c).getWorld(worldId);
  const splatUrl = pickSpzUrl(world.assets?.splats?.spzUrls, c.req.query("res"));
  if (!splatUrl) {
    return c.html(
      renderViewerErrorHtml(
        `World "${worldId}" has no renderable Gaussian-splat assets yet. It may still be generating, or its prompt type doesn't produce splats.`,
      ),
      422,
    );
  }
  return c.html(renderViewerHtml(splatUrl));
});

/** Escape hatch: render any publicly-reachable .spz URL, without touching the Marble API. */
app.get("/view", (c) => {
  const raw = c.req.query("url");
  if (!raw) {
    return c.html(renderViewerErrorHtml("Usage: /view?url=<spz-url> or /view/:worldId"), 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return c.html(renderViewerErrorHtml(`Invalid url: "${raw}"`), 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return c.html(renderViewerErrorHtml(`Unsupported URL scheme: "${parsed.protocol}"`), 400);
  }
  return c.html(renderViewerHtml(parsed.toString()));
});

app.onError((err, c) => errorResponse(err, c));

export default app;

/**
 * Map a thrown error to an HTTP response. Never spreads a raw `err.body` —
 * only `err.message` (redacted, see src/errors.ts) and known-safe structured
 * fields (`.detail`, `.validation`) are surfaced.
 */
function errorResponse(err: unknown, c: Context<AppEnv>): Response {
  if (err instanceof ZodError) {
    return c.json({ error: "ValidationError", message: "Invalid request body", issues: err.issues }, 400);
  }
  if (err instanceof SyntaxError) {
    return c.json({ error: "InvalidJSON", message: err.message }, 400);
  }
  if (err instanceof MissingApiKeyError) {
    return c.json(
      { error: "MissingApiKeyError", message: "Server is not configured with a Marble API key" },
      500,
    );
  }
  if (err instanceof OutOfCreditsError) {
    return c.json({ error: "OutOfCreditsError", message: err.message, detail: err.detail }, 402);
  }
  if (err instanceof RequestValidationError) {
    return c.json({ error: "RequestValidationError", message: err.message, validation: err.validation }, 422);
  }
  if (err instanceof AuthError) {
    return c.json({ error: "AuthError", message: err.message }, (err.status ?? 401) as 401 | 403);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: "NotFoundError", message: err.message }, 404);
  }
  if (err instanceof RateLimitError) {
    return c.json({ error: "RateLimitError", message: err.message }, 429);
  }
  if (err instanceof OperationTimeoutError) {
    return c.json({ error: "OperationTimeoutError", message: err.message }, 504);
  }
  if (
    err instanceof ServerError ||
    err instanceof NetworkError ||
    err instanceof OperationFailedError
  ) {
    return c.json({ error: err.name, message: err.message }, 502);
  }
  if (err instanceof WorldLabsError) {
    return c.json({ error: err.name, message: err.message }, (err.status ?? 500) as 500);
  }
  return c.json({ error: "InternalError", message: "Internal Server Error" }, 500);
}
