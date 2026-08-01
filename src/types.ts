/**
 * Public TypeScript types for the World Labs / Marble Public API v1.
 *
 * All fields are camelCase (per project convention). The wire format is
 * snake_case; {@link import("./schemas.js").toWire} / `fromWire` convert
 * between the two. Enum *values* that are closed API constants (model names,
 * media kinds, statuses) are kept verbatim; `sortBy` is the one value we
 * remap (`"createdAt"` ↔ wire `"created_at"`) so the public surface stays
 * camelCase.
 */

/** Marble model identifiers. `marble-1.0` is the API default. */
export type MarbleModel =
  | "marble-1.0-draft"
  | "marble-1.0"
  | "marble-1.1"
  | "marble-1.1-plus";

/** Allow canonical model names with autocomplete while still accepting
 *  deprecated legacy names (e.g. `"Marble 0.1-mini"`) as raw strings. */
export type MaybeLegacyModel = MarbleModel | (string & {});

/** Kind of a media asset. */
export type MediaAssetKind = "image" | "video";

/** Sort order for listing worlds (remapped to wire `created_at`/`updated_at`). */
export type WorldSortBy = "createdAt" | "updatedAt";

/** Lifecycle status of a world. */
export type WorldStatus = "SUCCEEDED" | "PENDING" | "FAILED" | "RUNNING";

/**
 * Reference to content by uploaded media asset, public URL, or inline
 * base64. Discriminated by `source`. Used by request (input) prompts.
 */
export type ContentRef =
  | { source: "media_asset"; mediaAssetId: string }
  | { source: "uri"; uri: string }
  | { source: "data_base64"; dataBase64: string; extension?: string | null };

/** Plain content descriptor (response/output side — no discriminator). */
export type Content = {
  dataBase64?: string | null;
  extension?: string | null;
  uri?: string | null;
};

/** A piece of content positioned on a sphere (input side, references content). */
export type SphericallyLocatedContentInput = {
  content: ContentRef;
  azimuth?: number | null;
};

/** A piece of content positioned on a sphere (output side, plain content). */
export type SphericallyLocatedContentOutput = {
  azimuth?: number | null;
  dataBase64?: string | null;
  extension?: string | null;
  uri?: string | null;
};

/** Text prompt for world generation. */
export type WorldTextPrompt = {
  type: "text";
  textPrompt?: string | null;
  disableRecaption?: boolean | null;
};

/** Image prompt for world generation (input, references content). */
export type ImagePrompt = {
  type: "image";
  imagePrompt: ContentRef;
  isPano?: boolean | null;
  disableRecaption?: boolean | null;
  textPrompt?: string | null;
};

/** Multi-image prompt for world generation (input). */
export type MultiImagePrompt = {
  type: "multi-image";
  multiImagePrompt: SphericallyLocatedContentInput[];
  reconstructImages?: boolean;
  textPrompt?: string | null;
  disableRecaption?: boolean | null;
};

/** Video prompt for world generation (input, references content). */
export type VideoPrompt = {
  type: "video";
  videoPrompt: ContentRef;
  textPrompt?: string | null;
  disableRecaption?: boolean | null;
};

/** Discriminated union of world-prompt variants accepted by `worlds:generate`. */
export type WorldPromptInput =
  | WorldTextPrompt
  | ImagePrompt
  | MultiImagePrompt
  | VideoPrompt;

/** Image prompt as returned on a world (output, plain content). */
export type PromptOutput = {
  type: "image";
  imagePrompt: Content;
  isPano?: boolean;
  textPrompt?: string | null;
};

/** Multi-image prompt as returned on a world (output). */
export type MultiImagePromptOutput = {
  type: "multi-image";
  multiImagePrompt: SphericallyLocatedContentOutput[];
  reconstructImages?: boolean;
  textPrompt?: string | null;
};

/** Video prompt as returned on a world (output, plain content). */
export type VideoPromptOutput = {
  type: "video";
  videoPrompt: Content;
  textPrompt?: string | null;
};

/** Text prompt as returned on a world (output). */
export type WorldTextPromptOutput = {
  type: "text";
  textPrompt?: string | null;
};

/** Depth-pano prompt as returned on a world (output). */
export type DepthPanoPrompt = {
  type: "depth-pano";
  depthPanoImage: Content;
  textPrompt?: string | null;
  zMin?: number | null;
  zMax?: number | null;
};

/** Inpaint-pano prompt as returned on a world (output). */
export type InpaintPanoPrompt = {
  type: "inpaint-pano";
  panoImage: Content;
  panoMask: Content;
  textPrompt?: string | null;
};

/** Discriminated union of world-prompt variants found on a {@link World}. */
export type WorldPromptOutput =
  | WorldTextPromptOutput
  | PromptOutput
  | MultiImagePromptOutput
  | VideoPromptOutput
  | DepthPanoPrompt
  | InpaintPanoPrompt;

/** Access permission for a world. Defaults to all-false / empty. */
export type Permission = {
  allowIdAccess?: boolean;
  allowedReaders?: string[];
  allowedWriters?: string[];
  public?: boolean;
};

/** Request body for `POST /marble/v1/worlds:generate`. */
export type WorldsGenerateRequest = {
  worldPrompt: WorldPromptInput;
  displayName?: string;
  model?: MarbleModel;
  permission?: Permission;
  seed?: number;
  tags?: string[];
};

/** Request body for `POST /marble/v1/worlds:list`. */
export type ListWorldsRequest = {
  pageSize?: number;
  pageToken?: string | null;
  sortBy?: WorldSortBy;
  status?: WorldStatus | null;
  model?: MaybeLegacyModel | null;
  tags?: string[] | null;
  isPublic?: boolean | null;
  createdAfter?: string | null;
  createdBefore?: string | null;
};

/** Request body for `POST /marble/v1/media-assets:prepare_upload`. */
export type MediaAssetPrepareUploadRequest = {
  fileName: string;
  kind: MediaAssetKind;
  extension?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Request body for `POST /marble/v1/pano:depth_to_rgb`. */
export type PanoDepthToRgbRequest = {
  depthPanoImage: ContentRef;
  textPrompt: string;
  seed?: number | null;
  zMin?: number | null;
  zMax?: number | null;
};

/** Remaining credit balance. */
export type CreditsResponse = {
  remainingCredits: number;
};

/** Error carried on a completed (failed) operation. */
export type OperationError = {
  code?: number | null;
  message?: string | null;
};

/** A long-running operation. `response` is present once `done` is true. */
export type Operation<T> = {
  operationId: string;
  done: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  expiresAt?: string | null;
  error?: OperationError | null;
  metadata?: Record<string, unknown> | null;
  response?: T | null;
};

/** Panorama imagery assets on a world. */
export type ImageryAssets = {
  panoUrl?: string | null;
};

/** Mesh assets on a world. */
export type MeshAssets = {
  colliderMeshUrl?: string | null;
};

/** Semantic metadata for Gaussian splats. */
export type WorldSemanticsMetadata = {
  groundPlaneOffset?: number | null;
  metricScaleFactor?: number | null;
};

/** Gaussian-splat assets on a world. `spzUrls` maps filename → URL. */
export type SplatAssets = {
  semanticsMetadata?: WorldSemanticsMetadata | null;
  spzUrls?: Record<string, string> | null;
};

/** Asset bundle attached to a world. */
export type WorldAssets = {
  caption?: string | null;
  imagery?: ImageryAssets | null;
  mesh?: MeshAssets | null;
  splats?: SplatAssets | null;
  thumbnailUrl?: string | null;
};

/** A generated world. */
export type World = {
  worldId: string;
  displayName: string;
  worldMarbleUrl: string;
  assets?: WorldAssets | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  model?: string | null;
  permission?: Permission | null;
  tags?: string[] | null;
  worldPrompt?: WorldPromptOutput | null;
};

/** Result of `GET /marble/v1/operations/{id}` (world or pano depth→RGB). */
export type GetOperationResponse = Operation<World | PanoDepthToRgbResult>;

/** Initial response from `POST /marble/v1/worlds:generate`. */
export type GenerateWorldResponse = Operation<World | PanoDepthToRgbResult>;

/** Response from `POST /marble/v1/worlds:list`. */
export type ListWorldsResponse = {
  worlds: World[];
  nextPageToken?: string | null;
};

/** A registered media asset. */
export type MediaAsset = {
  mediaAssetId: string;
  fileName: string;
  kind: MediaAssetKind;
  createdAt: string;
  extension?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

/** Signed upload URL plus the headers/method required to PUT bytes to it. */
export type UploadUrlInfo = {
  uploadUrl: string;
  uploadMethod: string;
  curlExample?: string | null;
  requiredHeaders?: Record<string, string> | null;
};

/** Response from `prepare_upload`: the asset record + how to upload it. */
export type MediaAssetPrepareUploadResponse = {
  mediaAsset: MediaAsset;
  uploadInfo: UploadUrlInfo;
};

/** Response from `DELETE /marble/v1/worlds/{id}`. */
export type DeleteWorldResponse = {
  worldId: string;
  deleted: boolean;
};

/** Result of `POST /marble/v1/pano:depth_to_rgb`. */
export type PanoDepthToRgbResult = {
  panoUrl?: string | null;
};

/** One validation error from a 422 `HttpValidationError` body. */
export type ValidationErrorItem = {
  loc: (string | number)[];
  msg: string;
  type: string;
};

/** Body of a 422 response. */
export type HttpValidationError = {
  detail: ValidationErrorItem[];
};

/** Options for {@link import("./client.js").createClient}. */
export type ClientOptions = {
  /** API key. Falls back to `process.env.WLT_API_KEY`. Never logged. */
  apiKey?: string;
  /** Override base URL (default `https://api.worldlabs.ai`). */
  baseUrl?: string;
  /** Inject a `fetch` implementation (used in tests / Workers). */
  fetch?: typeof fetch;
  /** Request timeout in ms (default 30000). */
  timeoutMs?: number;
};