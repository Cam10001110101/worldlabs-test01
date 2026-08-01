import { describe, expect, it } from "vitest";
import { pickSpzUrl, renderViewerErrorHtml, renderViewerHtml } from "../worker/viewer.js";

describe("pickSpzUrl", () => {
  it("returns null for null, undefined, or empty maps", () => {
    expect(pickSpzUrl(null)).toBeNull();
    expect(pickSpzUrl(undefined)).toBeNull();
    expect(pickSpzUrl({})).toBeNull();
  });

  it("returns the only URL for a single-entry map", () => {
    expect(pickSpzUrl({ full: "https://example.com/a.spz" })).toBe("https://example.com/a.spz");
  });

  it("prefers full_res when present among multiple resolutions", () => {
    const urls = {
      "500k": "https://example.com/500k.spz",
      "100k": "https://example.com/100k.spz",
      full_res: "https://example.com/full_res.spz",
    };
    expect(pickSpzUrl(urls)).toBe(urls.full_res);
  });

  it("picks the largest <N>k label when full_res is absent", () => {
    const urls = {
      "500k": "https://example.com/500k.spz",
      "100k": "https://example.com/100k.spz",
    };
    expect(pickSpzUrl(urls)).toBe(urls["500k"]);
  });

  it("uses the preferred label when present, overriding default order", () => {
    const urls = {
      "500k": "https://example.com/500k.spz",
      "100k": "https://example.com/100k.spz",
      full_res: "https://example.com/full_res.spz",
    };
    expect(pickSpzUrl(urls, "100k")).toBe(urls["100k"]);
  });

  it("falls back to default order when preferred label is absent", () => {
    const urls = {
      "500k": "https://example.com/500k.spz",
      full_res: "https://example.com/full_res.spz",
    };
    expect(pickSpzUrl(urls, "bogus")).toBe(urls.full_res);
  });

  it("falls back to the first key for unrecognized labels", () => {
    expect(pickSpzUrl({ draft: "https://example.com/draft.spz" })).toBe("https://example.com/draft.spz");
  });
});

describe("renderViewerHtml", () => {
  it("includes the doctype, pinned CDN imports, and the embedded splat URL", () => {
    const html = renderViewerHtml("https://cdn.example.com/scene.spz");
    expect(html).toContain("<!doctype html");
    expect(html).toContain("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    expect(html).toContain("https://sparkjs.dev/releases/spark/2.1.0/spark.module.js");
    expect(html).toContain('"https://cdn.example.com/scene.spz"');
  });

  it("escapes < in the splat URL so a </script> breakout is impossible", () => {
    const malicious = "https://evil.example.com/scene.spz</script><script>alert(1)</script>";
    const html = renderViewerHtml(malicious);
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script>");
  });
});

describe("renderViewerErrorHtml", () => {
  it("HTML-escapes the message", () => {
    const html = renderViewerErrorHtml('World "abc" has <no> splats & such');
    expect(html).toContain("&lt;no&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<no>");
  });

  it("escapes a script-injecting message rather than emitting it literally", () => {
    const html = renderViewerErrorHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
