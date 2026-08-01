import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client.js";
import {
  MissingApiKeyError,
  NetworkError,
  NotFoundError,
  OperationFailedError,
  OperationTimeoutError,
} from "../src/errors.js";
import {
  jsonResponse,
  wireCreditsResponse,
  wireDeleteWorldResponse,
  wireListWorldsResponse,
  wireMediaAsset,
  wireMediaAssetPrepareUploadResponse,
  wireOperationDone,
  wireOperationError,
  wireOperationPending,
  wireWorld,
} from "./fixtures.js";

const API_KEY = "test-api-key";

describe("createClient", () => {
  let originalEnvKey: string | undefined;

  beforeEach(() => {
    originalEnvKey = process.env.WLT_API_KEY;
  });

  afterEach(() => {
    if (originalEnvKey === undefined) delete process.env.WLT_API_KEY;
    else process.env.WLT_API_KEY = originalEnvKey;
  });

  it("throws MissingApiKeyError when no key is supplied and WLT_API_KEY is unset", () => {
    delete process.env.WLT_API_KEY;
    expect(() => createClient({})).toThrow(MissingApiKeyError);
  });

  it("sends the WLT-Api-Key header and never Authorization", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["WLT-Api-Key"]).toBe(API_KEY);
      expect(headers.Authorization).toBeUndefined();
      return jsonResponse(wireCreditsResponse);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    await client.getCredits();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("generateWorld: sends a snake_case body and parses a camelCase operation", async () => {
    let sentBody: unknown;
    const fetchMock = vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
      expect(init?.method).toBe("POST");
      sentBody = JSON.parse(init?.body as string);
      return jsonResponse(wireOperationPending);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const op = await client.generateWorld({
      displayName: "Demo",
      model: "marble-1.0-draft",
      worldPrompt: { type: "text", textPrompt: "A cabin in the woods" },
    });
    expect(sentBody).toMatchObject({ world_prompt: { type: "text", text_prompt: "A cabin in the woods" } });
    expect(op.operationId).toBe("op-123");
    expect(op.done).toBe(false);
  });

  it("getOperation: fetches and parses a completed operation", async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toBe("https://api.worldlabs.ai/marble/v1/operations/op-123");
      return jsonResponse(wireOperationDone);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const op = await client.getOperation("op-123");
    expect(op.done).toBe(true);
    expect(op.response && "worldId" in op.response ? op.response.worldId : null).toBe("world-123");
  });

  it("getWorld: fetches and parses a World", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireWorld));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const world = await client.getWorld("world-123");
    expect(world.worldMarbleUrl).toBe(wireWorld.world_marble_url);
  });

  it("listWorlds: posts filters and parses the page", async () => {
    let sentBody: unknown;
    const fetchMock = vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://api.worldlabs.ai/marble/v1/worlds:list");
      sentBody = JSON.parse(init?.body as string);
      return jsonResponse(wireListWorldsResponse);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const page = await client.listWorlds({ sortBy: "createdAt", pageSize: 10 });
    expect(sentBody).toMatchObject({ sort_by: "created_at", page_size: 10 });
    expect(page.worlds).toHaveLength(1);
    expect(page.worlds[0]?.worldId).toBe("world-123");
  });

  it("deleteWorld: sends DELETE and parses the confirmation", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://api.worldlabs.ai/marble/v1/worlds/world-123");
      expect(init?.method).toBe("DELETE");
      return jsonResponse(wireDeleteWorldResponse);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const result = await client.deleteWorld("world-123");
    expect(result).toEqual({ worldId: "world-123", deleted: true });
  });

  it("prepareMediaUpload: sends the request and parses the upload info", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireMediaAssetPrepareUploadResponse));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const result = await client.prepareMediaUpload({ fileName: "photo.jpg", kind: "image" });
    expect(result.mediaAsset.mediaAssetId).toBe("asset-123");
    expect(result.uploadInfo.uploadUrl).toBe(wireMediaAssetPrepareUploadResponse.upload_info.upload_url);
  });

  it("getMediaAsset: fetches and parses a MediaAsset", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireMediaAsset));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const asset = await client.getMediaAsset("asset-123");
    expect(asset.fileName).toBe("photo.jpg");
  });

  it("panoDepthToRgb: sends the request and parses the operation", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireOperationPending));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const op = await client.panoDepthToRgb({
      depthPanoImage: { source: "uri", uri: "https://example.com/depth.exr" },
      textPrompt: "A cozy cabin interior",
    });
    expect(op.operationId).toBe("op-123");
  });

  it("getCredits: fetches and parses the balance", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireCreditsResponse));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    expect(await client.getCredits()).toEqual({ remainingCredits: 42 });
  });

  it("maps a non-2xx response to the corresponding typed error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ detail: "not found" }, 404));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    await expect(client.getWorld("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a fetch abort (timeout) to NetworkError", async () => {
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const client = createClient({
      apiKey: API_KEY,
      fetch: fetchMock as unknown as typeof fetch,
      timeoutMs: 5,
    });
    await expect(client.getCredits()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("waitForOperation", () => {
  it("resolves with the response once the operation completes", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return jsonResponse(calls >= 3 ? wireOperationDone : wireOperationPending);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const result = await client.waitForOperation("op-123", {
      intervalMs: 1,
      sleep: () => Promise.resolve(),
    });
    expect("worldId" in result && result.worldId).toBe("world-123");
    expect(calls).toBe(3);
  });

  it("calls onProgress with each polled snapshot", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return jsonResponse(calls >= 2 ? wireOperationDone : wireOperationPending);
    });
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const progress: boolean[] = [];
    await client.waitForOperation("op-123", {
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      onProgress: (op) => progress.push(op.done),
    });
    expect(progress).toEqual([false, true]);
  });

  it("rejects with OperationFailedError when the operation completes with an error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireOperationError));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    await expect(
      client.waitForOperation("op-123", { intervalMs: 1, sleep: () => Promise.resolve() }),
    ).rejects.toBeInstanceOf(OperationFailedError);
  });

  it("rejects with OperationTimeoutError once timeoutMs elapses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wireOperationPending));
    const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
    const err = await client
      .waitForOperation("op-123", { intervalMs: 1, timeoutMs: 5, sleep: () => Promise.resolve() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationTimeoutError);
    expect((err as OperationTimeoutError).lastSnapshot).toMatchObject({ operationId: "op-123" });
  });

  it("polls using the default setTimeout-based sleep under fake timers", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchMock = vi.fn(async () => {
        calls += 1;
        return jsonResponse(calls >= 3 ? wireOperationDone : wireOperationPending);
      });
      const client = createClient({ apiKey: API_KEY, fetch: fetchMock as unknown as typeof fetch });
      const promise = client.waitForOperation("op-123", { intervalMs: 1000 });
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect("worldId" in result && result.worldId).toBe("world-123");
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
