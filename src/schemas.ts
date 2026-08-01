/**
 * Zod schemas (camelCase) + the snake_case↔camelCase conversion layer.
 *
 * The wire format is snake_case; the public TS surface is camelCase. Schemas
 * are written in camelCase and used for validation in *both* directions:
 *
 *   - `toWire(schema, input)`  → validate camelCase input, then convert keys
 *     to snake_case for the HTTP body (dropping `undefined`).
 *   - `fromWire(schema, json)` → convert snake_case response keys to camelCase,
 *     then `schema.parse`.
 *
 * Free-form maps (`metadata`, `required_headers`, `spz_urls`) whose inner keys
 * are NOT ours to touch (header names, splat filenames, user metadata) are
 * passed through untouched by the converters — see {@link FREEFORM_KEYS}.
 *
 * Enum *values* that are closed API constants (model names, media kinds,
 * statuses, and the prompt/content discriminator values `type`/`source`) are
 * kept verbatim — they are values, not keys, so the key converters never
 * touch them. The single exception is `sortBy`, whose *value* is remapped
 * (`"createdAt"` ↔ wire `"created_at"`) by {@link buildListWorldsBody}.
 */

import { z } from "zod";
import type { ListWorldsRequest } from "./types.js";

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const MarbleModelSchema = z.enum([
  "marble-1.0-draft",
  "marble-1.0",
  "marble-1.1",
  "marble-1.1-plus",
]);

export const MediaAssetKindSchema = z.enum(["image", "video"]);

/** Public sort values; remapped to wire `created_at`/`updated_at` on send. */
export const WorldSortBySchema = z.enum(["createdAt", "updatedAt"]);

export const WorldStatusSchema = z.enum(["SUCCEEDED", "PENDING", "FAILED", "RUNNING"]);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** Reference to content (input side), discriminated by `source`. */
export const ContentRefSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("media_asset"),
    mediaAssetId: z.string(),
  }),
  z.object({
    source: z.literal("uri"),
    uri: z.string(),
  }),
  z.object({
    source: z.literal("data_base64"),
    dataBase64: z.string(),
    extension: z.string().nullish(),
  }),
]);

/** Plain content descriptor (output side — no discriminator). */
export const ContentSchema = z.object({
  dataBase64: z.string().nullish(),
  extension: z.string().nullish(),
  uri: z.string().nullish(),
});

/** Spherically-located content (input side, references content). */
export const SphericallyLocatedContentInputSchema = z.object({
  content: ContentRefSchema,
  azimuth: z.number().nullish(),
});

/** Spherically-located content (output side, plain content). */
export const SphericallyLocatedContentOutputSchema = z.object({
  azimuth: z.number().nullish(),
  dataBase64: z.string().nullish(),
  extension: z.string().nullish(),
  uri: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// World prompts
// ---------------------------------------------------------------------------

/** World-prompt variants accepted by `worlds:generate` (input). */
export const WorldPromptInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    textPrompt: z.string().nullish(),
    disableRecaption: z.boolean().nullish(),
  }),
  z.object({
    type: z.literal("image"),
    imagePrompt: ContentRefSchema,
    isPano: z.boolean().nullish(),
    disableRecaption: z.boolean().nullish(),
    textPrompt: z.string().nullish(),
  }),
  z.object({
    type: z.literal("multi-image"),
    multiImagePrompt: z.array(SphericallyLocatedContentInputSchema),
    reconstructImages: z.boolean().optional(),
    textPrompt: z.string().nullish(),
    disableRecaption: z.boolean().nullish(),
  }),
  z.object({
    type: z.literal("video"),
    videoPrompt: ContentRefSchema,
    textPrompt: z.string().nullish(),
    disableRecaption: z.boolean().nullish(),
  }),
]);

/** World-prompt variants found on a {@link World} (output). */
export const WorldPromptOutputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    textPrompt: z.string().nullish(),
  }),
  z.object({
    type: z.literal("image"),
    imagePrompt: ContentSchema,
    isPano: z.boolean().optional(),
    textPrompt: z.string().nullish(),
  }),
  z.object({
    type: z.literal("multi-image"),
    multiImagePrompt: z.array(SphericallyLocatedContentOutputSchema),
    reconstructImages: z.boolean().optional(),
    textPrompt: z.string().nullish(),
  }),
  z.object({
    type: z.literal("video"),
    videoPrompt: ContentSchema,
    textPrompt: z.string().nullish(),
  }),
  z.object({
    type: z.literal("depth-pano"),
    depthPanoImage: ContentSchema,
    textPrompt: z.string().nullish(),
    zMin: z.number().nullish(),
    zMax: z.number().nullish(),
  }),
  z.object({
    type: z.literal("inpaint-pano"),
    panoImage: ContentSchema,
    panoMask: ContentSchema,
    textPrompt: z.string().nullish(),
  }),
]);

// ---------------------------------------------------------------------------
// Shared structs
// ---------------------------------------------------------------------------

export const PermissionSchema = z.object({
  allowIdAccess: z.boolean().optional(),
  allowedReaders: z.array(z.string()).optional(),
  allowedWriters: z.array(z.string()).optional(),
  public: z.boolean().optional(),
});

export const OperationErrorSchema = z.object({
  code: z.number().int().nullish(),
  message: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const ImageryAssetsSchema = z.object({
  panoUrl: z.string().nullish(),
});

export const MeshAssetsSchema = z.object({
  colliderMeshUrl: z.string().nullish(),
});

export const WorldSemanticsMetadataSchema = z.object({
  groundPlaneOffset: z.number().nullish(),
  metricScaleFactor: z.number().nullish(),
});

export const SplatAssetsSchema = z.object({
  semanticsMetadata: WorldSemanticsMetadataSchema.nullish(),
  spzUrls: z.record(z.string(), z.string()).nullish(),
});

export const WorldAssetsSchema = z.object({
  caption: z.string().nullish(),
  imagery: ImageryAssetsSchema.nullish(),
  mesh: MeshAssetsSchema.nullish(),
  splats: SplatAssetsSchema.nullish(),
  thumbnailUrl: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// World + operations
// ---------------------------------------------------------------------------

export const WorldSchema = z.object({
  worldId: z.string(),
  displayName: z.string(),
  worldMarbleUrl: z.string(),
  assets: WorldAssetsSchema.nullish(),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  model: z.string().nullish(),
  permission: PermissionSchema.nullish(),
  tags: z.array(z.string()).nullish(),
  worldPrompt: WorldPromptOutputSchema.nullish(),
});

export const PanoDepthToRgbResultSchema = z.object({
  panoUrl: z.string().nullish(),
});

/** A completed operation's `response` is either a World or a pano depth→RGB result. */
export const WorldOrPanoSchema = z.union([WorldSchema, PanoDepthToRgbResultSchema]);

/** Generic long-running operation. `response` is present once `done` is true. */
export const operationSchema = <T extends z.ZodTypeAny>(responseSchema: T) =>
  z.object({
    operationId: z.string(),
    done: z.boolean(),
    createdAt: z.string().nullish(),
    updatedAt: z.string().nullish(),
    expiresAt: z.string().nullish(),
    error: OperationErrorSchema.nullish(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
    response: responseSchema.nullish(),
  });

export const GetOperationResponseSchema = operationSchema(WorldOrPanoSchema);
export const GenerateWorldResponseSchema = operationSchema(WorldOrPanoSchema);

export const ListWorldsResponseSchema = z.object({
  worlds: z.array(WorldSchema),
  nextPageToken: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// Media assets
// ---------------------------------------------------------------------------

export const MediaAssetSchema = z.object({
  mediaAssetId: z.string(),
  fileName: z.string(),
  kind: MediaAssetKindSchema,
  createdAt: z.string(),
  extension: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  updatedAt: z.string().nullish(),
});

export const UploadUrlInfoSchema = z.object({
  uploadUrl: z.string(),
  uploadMethod: z.string(),
  curlExample: z.string().nullish(),
  requiredHeaders: z.record(z.string(), z.string()).nullish(),
});

export const MediaAssetPrepareUploadResponseSchema = z.object({
  mediaAsset: MediaAssetSchema,
  uploadInfo: UploadUrlInfoSchema,
});

// ---------------------------------------------------------------------------
// Simple responses / validation
// ---------------------------------------------------------------------------

export const CreditsResponseSchema = z.object({
  remainingCredits: z.number(),
});

export const DeleteWorldResponseSchema = z.object({
  worldId: z.string(),
  deleted: z.boolean(),
});

export const ValidationErrorItemSchema = z.object({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  type: z.string(),
});

export const HttpValidationErrorSchema = z.object({
  detail: z.array(ValidationErrorItemSchema),
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const WorldsGenerateRequestSchema = z.object({
  worldPrompt: WorldPromptInputSchema,
  displayName: z.string().max(64).optional(),
  model: MarbleModelSchema.optional(),
  permission: PermissionSchema.optional(),
  seed: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

export const ListWorldsRequestSchema = z.object({
  pageSize: z.number().int().min(1).max(100).optional(),
  pageToken: z.string().nullish(),
  sortBy: WorldSortBySchema.optional(),
  status: WorldStatusSchema.nullish(),
  /** Accept canonical names with autocomplete plus legacy names as raw strings. */
  model: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  isPublic: z.boolean().nullish(),
  createdAfter: z.string().nullish(),
  createdBefore: z.string().nullish(),
});

export const MediaAssetPrepareUploadRequestSchema = z.object({
  fileName: z.string().max(64),
  kind: MediaAssetKindSchema,
  extension: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const PanoDepthToRgbRequestSchema = z.object({
  depthPanoImage: ContentRefSchema,
  textPrompt: z.string(),
  seed: z.number().nullish(),
  zMin: z.number().nullish(),
  zMax: z.number().nullish(),
});

// ---------------------------------------------------------------------------
// snake_case ↔ camelCase conversion
// ---------------------------------------------------------------------------

/**
 * Object keys whose *values* are free-form maps we must not recurse into:
 * header names (`required_headers`), splat filenames (`spz_urls`), and
 * user-supplied metadata. The key name itself is still camelized, but the
 * value passes through untouched. Both snake and camel spellings are listed
 * so the set matches the key in whichever direction we are converting.
 */
const FREEFORM_KEYS = new Set([
  "metadata",
  "required_headers",
  "requiredHeaders",
  "spz_urls",
  "spzUrls",
]);

/** Convert a single snake_case key to camelCase. */
function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

/** Convert a single camelCase key to snake_case. */
function camelToSnake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, (_, a: string, b: string) => `${a}_${b.toLowerCase()}`);
}

type Dir = "toCamel" | "toSnake";

function deepConvert(value: unknown, dir: Dir): unknown {
  if (Array.isArray(value)) {
    return value.map((el) => deepConvert(el, dir));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // Drop undefined so exactOptionalPropertyTypes / wire bodies stay clean.
    if (val === undefined) continue;
    const isFreeform = FREEFORM_KEYS.has(key);
    const newKey = dir === "toCamel" ? snakeToCamel(key) : camelToSnake(key);
    // Free-form map values pass through untouched (their inner keys are not ours).
    out[newKey] = isFreeform ? val : deepConvert(val, dir);
  }
  return out;
}

/** Recursively convert snake_case keys to camelCase (drops `undefined`). */
export function deepSnakeToCamel<T = unknown>(value: unknown): T {
  return deepConvert(value, "toCamel") as T;
}

/** Recursively convert camelCase keys to snake_case (drops `undefined`). */
export function deepCamelToSnake<T = unknown>(value: unknown): T {
  return deepConvert(value, "toSnake") as T;
}

/**
 * Validate a snake_case response body against a camelCase schema: convert
 * keys to camelCase, then parse. Throws `ZodError` on mismatch.
 */
export function fromWire<T>(schema: z.ZodSchema<T>, json: unknown): T {
  return schema.parse(deepSnakeToCamel(json));
}

/**
 * Validate a camelCase request input and convert it to a snake_case wire body.
 * `undefined` fields are dropped. Throws `ZodError` on mismatch.
 */
export function toWire<T>(schema: z.ZodSchema<T>, input: unknown): Record<string, unknown> {
  return deepCamelToSnake<Record<string, unknown>>(schema.parse(input));
}

// ---------------------------------------------------------------------------
// list_worlds: the one request with a value-level (not key-level) remap
// ---------------------------------------------------------------------------

const SORT_BY_WIRE: Record<string, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
};

/**
 * Build the `worlds:list` request body. `sortBy` is the only field whose
 * *value* (not key) must be remapped between the public camelCase enum
 * (`"createdAt"`/`"updatedAt"`) and the wire enum (`"created_at"`/`"updated_at"`).
 */
export function buildListWorldsBody(req: ListWorldsRequest): Record<string, unknown> {
  const wire = toWire(ListWorldsRequestSchema, req);
  const sortBy = wire.sort_by;
  if (typeof sortBy === "string") {
    wire.sort_by = SORT_BY_WIRE[sortBy] ?? sortBy;
  }
  return wire;
}