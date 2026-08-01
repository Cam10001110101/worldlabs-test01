/**
 * Zero-build HTML viewer for Marble worlds' Gaussian-splat (.spz) assets,
 * rendered client-side with @sparkjsdev/spark (https://github.com/sparkjsdev/spark)
 * loaded via a CDN import map — no bundler, no npm dependency on spark/three.
 */

/** CDN pins — bump deliberately, keep in sync with README. */
const THREE_VERSION = "0.180.0";
const SPARK_VERSION = "2.1.0";

export type ViewerOptions = {
  /** <title> text. Defaults to "Marble Splat Viewer". */
  title?: string;
};

/**
 * Pick a splat URL from a world's `spzUrls` label→URL map.
 *
 * Resolution order:
 *  1. `preferred` label, if given and present in `spzUrls` (exact match).
 *  2. `"full_res"`, if present.
 *  3. The `"<N>k"`-labeled URL with the largest N (e.g. "500k" over "100k").
 *  4. The first key in object-insertion order, as a last resort.
 *
 * Returns `null` if `spzUrls` is null/undefined/empty.
 */
export function pickSpzUrl(
  spzUrls: Record<string, string> | null | undefined,
  preferred?: string | null,
): string | null {
  if (!spzUrls) return null;
  const keys = Object.keys(spzUrls);
  if (keys.length === 0) return null;

  if (preferred && Object.prototype.hasOwnProperty.call(spzUrls, preferred)) {
    return spzUrls[preferred] ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(spzUrls, "full_res")) {
    return spzUrls.full_res ?? null;
  }

  let bestKey: string | null = null;
  let bestN = -Infinity;
  for (const key of keys) {
    const match = /^(\d+)k$/i.exec(key);
    if (match?.[1] !== undefined) {
      const n = Number(match[1]);
      if (n > bestN) {
        bestN = n;
        bestKey = key;
      }
    }
  }
  if (bestKey) return spzUrls[bestKey] ?? null;

  const firstKey = keys[0];
  if (firstKey === undefined) return null; // unreachable given the length check above
  return spzUrls[firstKey] ?? null;
}

/** Escape `&<>"'` for text embedded in the HTML body (not inside a <script> block). */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * JSON.stringify with `<` escaped to `<`, safe to embed inside a
 * `<script type="module">` block (prevents a `</script>` breakout).
 */
function jsonScriptSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  canvas { display: block; width: 100vw; height: 100vh; }
  #status {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #fff; font: 14px/1.4 system-ui, sans-serif; background: rgba(0,0,0,0.55);
    text-align: center; padding: 1rem;
  }
  #status.hidden { display: none; }
  #status.error { color: #ff6b6b; }
  #hint {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    color: #fff; font: 13px system-ui, sans-serif; background: rgba(0,0,0,0.45);
    padding: 0.4rem 0.8rem; border-radius: 6px; pointer-events: none;
  }
  #hint.hidden { display: none; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Full HTML document: CDN import map + SparkRenderer/SplatMesh/SparkControls loading `splatUrl`. */
export function renderViewerHtml(splatUrl: string, opts: ViewerOptions = {}): string {
  const title = escapeHtml(opts.title ?? "Marble Splat Viewer");
  const body = `<canvas id="canvas"></canvas>
<div id="status">Loading splat…</div>
<div id="hint" class="hidden">Drag to look around &middot; scroll or WASD to move</div>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/",
  "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/${SPARK_VERSION}/spark.module.js"
} }
</script>
<script type="module">
  import * as THREE from "three";
  import { SparkRenderer, SplatMesh, SparkControls } from "@sparkjsdev/spark";

  const SPLAT_URL = ${jsonScriptSafe(splatUrl)};
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const canvas = document.getElementById("canvas");

  function showError(msg) {
    statusEl.classList.remove("hidden");
    statusEl.classList.add("error");
    statusEl.textContent = "Failed to load splat: " + msg;
  }
  window.addEventListener("error", (e) => showError(e.message ?? String(e.error ?? e)));
  window.addEventListener("unhandledrejection", (e) => showError(e.reason?.message ?? String(e.reason)));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);
  const controls = new SparkControls({ canvas });

  // Frame the camera on the splat's actual bounding box once loaded — Marble
  // worlds vary widely in scale, so a fixed initial camera distance would
  // often start inside or far outside the geometry.
  function frameCamera(mesh) {
    mesh.updateMatrixWorld(true);
    const box = mesh.getBoundingBox().clone().applyMatrix4(mesh.matrixWorld);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.001) * 0.5;
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.3;
    camera.position.set(center.x, center.y, center.z + distance);
    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = distance * 1000;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  }

  const mesh = new SplatMesh({
    url: SPLAT_URL,
    onLoad: (loaded) => {
      statusEl.classList.add("hidden");
      hintEl.classList.remove("hidden");
      frameCamera(loaded);
    },
    onProgress: (event) => {
      if (event?.lengthComputable) {
        statusEl.textContent = "Loading splat… " + Math.round((event.loaded / event.total) * 100) + "%";
      }
    },
  });
  mesh.quaternion.set(1, 0, 0, 0);
  scene.add(mesh);

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.setAnimationLoop((time) => {
    controls.update(camera);
    renderer.render(scene, camera);
  });
</script>`;
  return pageShell(title, body);
}

/** Minimal HTML "message" page — used for the no-splats-yet (422) and bad-url (400) cases. */
export function renderViewerErrorHtml(message: string, opts: ViewerOptions = {}): string {
  const title = escapeHtml(opts.title ?? "Marble Splat Viewer");
  const body = `<div id="status" class="error">${escapeHtml(message)}</div>`;
  return pageShell(title, body);
}
