/**
 * Shared snake_case wire JSON fixtures for schemas/client/worker tests. Not
 * matched by vitest.config.ts's `test/**\/*.test.ts` include glob.
 */

export const wireWorld = {
  world_id: "world-123",
  display_name: "Test World",
  world_marble_url: "https://marble.worldlabs.ai/w/world-123",
  assets: {
    caption: "A test world",
    imagery: { pano_url: "https://example.com/pano.jpg" },
    mesh: { collider_mesh_url: "https://example.com/mesh.glb" },
    splats: {
      spz_urls: { full: "https://example.com/splat.spz" },
      semantics_metadata: null,
    },
    thumbnail_url: "https://example.com/thumb.jpg",
  },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:05:00Z",
  model: "marble-1.1",
  permission: {
    allow_id_access: false,
    allowed_readers: [],
    allowed_writers: [],
    public: false,
  },
  tags: ["test"],
  world_prompt: { type: "text", text_prompt: "A mystical forest with glowing mushrooms" },
};

export const wirePanoResult = {
  pano_url: "https://example.com/rgb-pano.jpg",
};

export const wireWorldNoSplats = {
  ...wireWorld,
  assets: { ...wireWorld.assets, splats: null },
};

export const wireWorldMultiRes = {
  ...wireWorld,
  assets: {
    ...wireWorld.assets,
    splats: {
      spz_urls: {
        "500k": "https://example.com/scene_500k.spz",
        "100k": "https://example.com/scene_100k.spz",
        full_res: "https://example.com/scene_full_res.spz",
      },
      semantics_metadata: null,
    },
  },
};

export const wireOperationPending = {
  operation_id: "op-123",
  done: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  expires_at: null,
  error: null,
  metadata: { progress: 42 },
  response: null,
};

export const wireOperationDone = {
  ...wireOperationPending,
  done: true,
  response: wireWorld,
};

export const wireOperationError = {
  ...wireOperationPending,
  done: true,
  error: { code: 500, message: "generation failed" },
  response: null,
};

export const wireMediaAsset = {
  media_asset_id: "asset-123",
  file_name: "photo.jpg",
  kind: "image",
  created_at: "2024-01-01T00:00:00Z",
  extension: "jpg",
  metadata: null,
  updated_at: null,
};

export const wireMediaAssetPrepareUploadResponse = {
  media_asset: wireMediaAsset,
  upload_info: {
    upload_url: "https://upload.example.com/asset-123",
    upload_method: "PUT",
    curl_example: null,
    required_headers: { "Content-Type": "image/jpeg" },
  },
};

export const wireListWorldsResponse = {
  worlds: [wireWorld],
  next_page_token: null,
};

export const wireDeleteWorldResponse = {
  world_id: "world-123",
  deleted: true,
};

export const wireCreditsResponse = {
  remaining_credits: 42,
};

/** Build a `Response` for a mock `fetch` implementation. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
