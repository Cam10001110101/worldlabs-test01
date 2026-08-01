import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../worker/index.js";
import { jsonResponse, wireCreditsResponse, wireWorld, wireWorldNoSplats } from "./fixtures.js";

const env = { WLT_API_KEY: "test-key" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worker", () => {
  it("GET /health returns ok without needing a key or hitting fetch", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("proxies GET /marble/v1/credits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(wireCreditsResponse)),
    );
    const res = await app.request("/marble/v1/credits", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ remainingCredits: 42 });
  });

  it("maps an upstream 404 to a 404 JSON error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "not found" }, 404)),
    );
    const res = await app.request("/marble/v1/worlds/does-not-exist", {}, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NotFoundError");
  });

  it("maps a client-side validation failure to a 400 ValidationError, without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await app.request(
      "/marble/v1/worlds:generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldPrompt: { type: "bogus" } }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ValidationError");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /view/:worldId renders the world's splat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(wireWorld)),
    );
    const res = await app.request("/view/world-123", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain(wireWorld.assets.splats.spz_urls.full);
  });

  it("GET /view/:worldId returns 422 HTML when the world has no splats yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(wireWorldNoSplats)),
    );
    const res = await app.request("/view/world-123", {}, env);
    expect(res.status).toBe(422);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("world-123");
  });

  it("GET /view/:worldId still maps an upstream 404 to a JSON error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "not found" }, 404)),
    );
    const res = await app.request("/view/does-not-exist", {}, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NotFoundError");
  });

  it("GET /view?url= renders an arbitrary splat URL without calling the Marble API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await app.request("/view?url=https://example.com/scene.spz", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("https://example.com/scene.spz");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /view?url=<invalid> returns 400 without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await app.request("/view?url=not-a-url", {}, env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /view with no query returns a 400 usage message without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await app.request("/view", {}, env);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("/view/:worldId");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
