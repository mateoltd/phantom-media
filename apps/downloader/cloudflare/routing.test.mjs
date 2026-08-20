import assert from "node:assert/strict";
import test from "node:test";
import { routeRequest } from "./routing.ts";

const origin = "https://ewyoutube.com";
const jobId = "123e4567-e89b-12d3-a456-426614174000";

function route(path, init) {
  return routeRequest(new Request(`${origin}${path}`, init));
}

function assertAsset(decision, expectedPath) {
  assert.equal(decision.kind, "asset");
  assert.equal(new URL(decision.request.url).pathname, expectedPath);
}

test("keeps HTML and RSC responses coupled to the current container image", () => {
  assert.deepEqual(route("/?utm_source=bot&fbclid=ignored"), {
    kind: "container",
  });
  assert.deepEqual(route("/watch?v=video-id&_rsc=random"), {
    kind: "container",
  });
  assert.deepEqual(
    route("/watch?v=video-id&_rsc=random", { headers: { RSC: "1" } }),
    { kind: "container" }
  );
  assert.deepEqual(route("/es/search?q=hola"), { kind: "container" });
});

test("canonicalizes known static assets", () => {
  const chunk = route("/_next/static/chunks/app.js?v=deployment");
  assertAsset(chunk, "/_next/static/chunks/app.js");
  assert.equal(new URL(chunk.request.url).search, "");

  assertAsset(route("/phantom-mark-v2.png?cache=bust"), "/phantom-mark-v2.png");
});

test("accepts only local Next image optimization inputs", () => {
  const image = route("/_next/image?q=75&w=640&url=%2Fbrush-stroke.png");
  assert.equal(image.kind, "asset");
  assert.equal(
    new URL(image.request.url).search,
    "?url=%2Fbrush-stroke.png&w=640&q=75"
  );

  assert.deepEqual(
    route("/_next/image?url=https%3A%2F%2Fevil.example%2Ftrack.png&w=640&q=75"),
    { kind: "not_found" }
  );
  assert.deepEqual(route("/_next/image?url=%2Fog.png&w=641&q=75"), {
    kind: "not_found",
  });
});

test("routes only known API operations to the container", () => {
  assert.deepEqual(route("/api/search", { method: "POST" }), {
    kind: "container",
  });
  assert.deepEqual(route(`/api/download/jobs/${jobId}`), {
    kind: "container",
  });
  assert.deepEqual(route(`/api/download/jobs/${jobId}`, { method: "DELETE" }), {
    kind: "container",
  });
  assert.deepEqual(route(`/api/download/jobs/${jobId}/file`), {
    kind: "container",
  });

  assert.deepEqual(route("/api/search"), {
    kind: "method_not_allowed",
    allow: "POST",
  });
  assert.deepEqual(route("/api/download/jobs/not-a-job"), {
    kind: "not_found",
  });
});

test("answers health checks and junk paths without waking the container", () => {
  assert.deepEqual(route("/api/health"), { kind: "health" });
  assert.deepEqual(route("/wp-login.php"), { kind: "not_found" });
  assert.deepEqual(route("/anything", { method: "POST" }), {
    kind: "not_found",
  });
});

test("redirects legacy results and canonical trailing slashes at the edge", () => {
  assert.deepEqual(route("/results?search_query=lofi&junk=ignored"), {
    kind: "redirect",
    location: "/search?q=lofi",
  });
  assert.deepEqual(route("/es/results?search_query=m%C3%BAsica"), {
    kind: "redirect",
    location: "/es/search?q=m%C3%BAsica",
  });
  assert.deepEqual(route("/watch/?v=video-id"), {
    kind: "redirect",
    location: "/watch?v=video-id",
  });
});

test("rejects unsupported methods before the container", () => {
  assert.deepEqual(route("/", { method: "POST" }), {
    kind: "method_not_allowed",
    allow: "GET, HEAD",
  });
  assert.deepEqual(route(`/api/download/jobs/${jobId}/file`, { method: "DELETE" }), {
    kind: "method_not_allowed",
    allow: "GET, HEAD",
  });
});
