import { createServer } from "node:http";
import { SERVERS, DirectClient, DirectError } from "./direct-client.mjs";

const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const client = new DirectClient();

function corsHeaders(request) {
  const origin = request.headers.origin;
  return origin && allowedOrigins.has(origin)
    ? {
        "access-control-allow-origin": origin,
        vary: "origin",
      }
    : {};
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function mediaFrom(url) {
  const type = url.searchParams.get("type");
  const tmdbId = Number(url.searchParams.get("tmdbId"));
  const media = { type, tmdbId };
  if (url.searchParams.has("title")) {
    media.title = (url.searchParams.get("title") ?? "").slice(0, 300);
    media.year = (url.searchParams.get("year") ?? "").slice(0, 10);
    media.date = (url.searchParams.get("date") ?? "").slice(0, 30);
    const imdbId = url.searchParams.get("imdbId") ?? "";
    media.imdbId = /^tt\d{5,12}$/i.test(imdbId) ? imdbId.toLowerCase() : "";
  }

  if (type === "tv") {
    media.season = Number(url.searchParams.get("season"));
    media.episode = Number(url.searchParams.get("episode"));
  }

  return media;
}

function publicResult(result) {
  return {
    server: result.server,
    serverLabel: result.serverLabel,
    latencyMs: result.latencyMs,
    attemptedServers: result.attemptedServers,
    media: {
      type: result.media.type,
      tmdbId: result.media.tmdbId,
      season: result.media.season,
      episode: result.media.episode,
      title: result.media.title,
      year: result.media.year,
    },
    candidates: result.candidates.map(({ raw: _raw, ...candidate }) => candidate),
    subtitles: result.subtitles,
    dubs: result.dubs,
    fallback: result.fallback,
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...cors,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    return response.end();
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { ok: true, servers: client.serverHealth() }, cors);
  }

  if (request.method !== "GET" || url.pathname !== "/api/resolve") {
    return sendJson(response, 404, { error: "Not found" }, cors);
  }

  try {
    const media = mediaFrom(url);
    const requestedServer = url.searchParams.get("server") ?? "auto";
    const preferred =
      url.searchParams
        .get("prefer")
        ?.split(",")
        .filter((value) => SERVERS.includes(value)) ?? SERVERS;
    const options = {
      language: url.searchParams.get("language") ?? "en-US",
      dubCode: url.searchParams.get("dubCode") ?? undefined,
      dubType: url.searchParams.get("dubType") ?? undefined,
      useProvidedMetadata: url.searchParams.has("title"),
    };

    const result =
      requestedServer === "auto"
        ? await client.resolveAuto(media, { ...options, servers: preferred })
        : await client.resolveServer(media, requestedServer, options);

    return sendJson(response, 200, publicResult(result), cors);
  } catch (error) {
    const known = error instanceof DirectError;
    const status =
      known && error.status && error.status >= 400 ? error.status : 502;
    return sendJson(
      response,
      status,
      {
        error: error.message,
        retryable: known ? error.retryable : false,
        retryAfterMs: known ? error.retryAfterMs : null,
        server: known ? error.server : null,
        details: known ? error.details : null,
      },
      cors,
    );
  }
});

server.listen(port, () => {
  console.log(`Resolver listening on http://localhost:${port}`);
});
