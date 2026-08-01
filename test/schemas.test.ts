import { describe, expect, it } from "vitest";
import {
  MediaAssetPrepareUploadRequestSchema,
  SplatAssetsSchema,
  UploadUrlInfoSchema,
  WorldSchema,
  WorldsGenerateRequestSchema,
  buildListWorldsBody,
  deepCamelToSnake,
  deepSnakeToCamel,
  fromWire,
  toWire,
} from "../src/schemas.js";
import { wireWorld } from "./fixtures.js";

describe("deepSnakeToCamel / deepCamelToSnake", () => {
  it("converts nested object and array keys", () => {
    const snake = { world_id: "w1", nested: { pano_url: "x" }, items: [{ text_prompt: "hi" }] };
    expect(deepSnakeToCamel(snake)).toEqual({
      worldId: "w1",
      nested: { panoUrl: "x" },
      items: [{ textPrompt: "hi" }],
    });
  });

  it("round-trips back to snake_case", () => {
    const camel = { worldId: "w1", nested: { panoUrl: "x" }, items: [{ textPrompt: "hi" }] };
    expect(deepCamelToSnake(camel)).toEqual({
      world_id: "w1",
      nested: { pano_url: "x" },
      items: [{ text_prompt: "hi" }],
    });
  });

  it("drops undefined values", () => {
    expect(deepCamelToSnake({ worldId: "w1", displayName: undefined })).toEqual({ world_id: "w1" });
  });
});

describe("toWire / fromWire round-trips", () => {
  it("converts a WorldsGenerateRequest to a snake_case wire body", () => {
    const wire = toWire(WorldsGenerateRequestSchema, {
      displayName: "My World",
      model: "marble-1.1",
      worldPrompt: { type: "text", textPrompt: "A mystical forest" },
    });
    expect(wire).toMatchObject({
      display_name: "My World",
      model: "marble-1.1",
      world_prompt: { type: "text", text_prompt: "A mystical forest" },
    });
    // camelCase keys must not leak onto the wire.
    expect(wire).not.toHaveProperty("displayName");
    expect(wire).not.toHaveProperty("worldPrompt");
  });

  it("parses a snake_case World response into camelCase", () => {
    const world = fromWire(WorldSchema, wireWorld);
    expect(world.worldId).toBe("world-123");
    expect(world.worldMarbleUrl).toBe(wireWorld.world_marble_url);
    expect(world.assets?.thumbnailUrl).toBe(wireWorld.assets.thumbnail_url);
    expect(world.assets?.splats?.spzUrls).toEqual(wireWorld.assets.splats.spz_urls);
    expect(world.worldPrompt).toEqual({ type: "text", textPrompt: wireWorld.world_prompt.text_prompt });
  });
});

describe("FREEFORM_KEYS passthrough", () => {
  it("leaves metadata's inner keys untouched on the way to the wire", () => {
    const wire = toWire(MediaAssetPrepareUploadRequestSchema, {
      fileName: "photo.jpg",
      kind: "image",
      metadata: { userSuppliedKey: "value", another_key: 1 },
    });
    expect(wire.metadata).toEqual({ userSuppliedKey: "value", another_key: 1 });
  });

  it("leaves requiredHeaders' inner keys untouched coming from the wire", () => {
    const parsed = fromWire(UploadUrlInfoSchema, {
      upload_url: "https://upload.example.com",
      upload_method: "PUT",
      curl_example: null,
      required_headers: { "Content-Type": "image/jpeg", "X-Custom-Header": "x" },
    });
    expect(parsed.requiredHeaders).toEqual({ "Content-Type": "image/jpeg", "X-Custom-Header": "x" });
  });

  it("leaves spzUrls' inner keys (filenames) untouched coming from the wire", () => {
    const parsed = fromWire(SplatAssetsSchema, {
      spz_urls: { "scene_full.spz": "https://example.com/scene_full.spz" },
      semantics_metadata: null,
    });
    expect(parsed.spzUrls).toEqual({ "scene_full.spz": "https://example.com/scene_full.spz" });
  });
});

describe("buildListWorldsBody", () => {
  it("remaps sortBy's value (not just the key) to the wire enum", () => {
    expect(buildListWorldsBody({ sortBy: "createdAt" })).toMatchObject({ sort_by: "created_at" });
    expect(buildListWorldsBody({ sortBy: "updatedAt" })).toMatchObject({ sort_by: "updated_at" });
  });

  it("omits sortBy from the body when not provided", () => {
    expect(buildListWorldsBody({ pageSize: 10 })).not.toHaveProperty("sort_by");
  });
});
