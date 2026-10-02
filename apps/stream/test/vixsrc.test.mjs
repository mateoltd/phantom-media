import assert from "node:assert/strict";
import test from "node:test";
import {
  VixsrcError,
  createVixsrcResolver,
  parseVixsrcEmbed,
  parseVixsrcPlaylists,
} from "../src/providers/vixsrc.mjs";

const media = { type: "tv", tmdbId: 1396, season: 3, episode: 5 };

function fixture() {
  const embedExpires = Math.floor((Date.now() + 30_000) / 1_000);
  const playlistExpires = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1_000) / 1_000);
  const src = `/embed/278711?token=${"a".repeat(32)}&expires=${embedExpires}&canPlayFHD=1`;
  const html = `<script>
    window.streams = [{"active":true,"url":"https:\\/\\/vixsrc.to\\/playlist\\/278711?ub=1"},
      {"active":false,"url":"https:\\/\\/vixsrc.to\\/playlist\\/278711?ab=1"}];
    window.masterPlaylist = {
      params: { 'token': '${"b".repeat(32)}', 'expires': '${playlistExpires}', 'asn': '' },
      url: 'https://vixsrc.to/playlist/278711',
    }
    window.canPlayFHD = true;
  </script>`;
  const manifest = `#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Italian",LANGUAGE="ita"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="eng"\n#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080,AUDIO="audio"\n/playlist/278711?type=video`;
  return { src, html, manifest };
}

test("the live player contract yields native HLS with the requested audio available", async () => {
  const { src, html, manifest } = fixture();
  const requested = [];
  const resolver = createVixsrcResolver("y8");
  const result = await resolver(media, {
    fetchImpl: async (input) => {
      const url = new URL(input);
      requested.push(url.pathname);
      if (url.pathname.startsWith("/api/")) return Response.json({ src });
      if (url.pathname.startsWith("/embed/")) return new Response(html);
      return new Response(manifest);
    },
  });
  assert.deepEqual(requested, [
    "/api/tv/1396/3/5",
    "/embed/278711",
    "/playlist/278711",
    "/playlist/278711",
  ]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].serverLabel, "Source 29");
  assert.equal(result.candidates[0].deliveryMode, "native-direct");
  assert.deepEqual(result.candidates[0].audioLanguages, ["it", "en"]);
  assert.equal(new URL(result.candidates[0].url).searchParams.get("h"), "1");
});

test("the resolver refuses off-origin player and playlist URLs", () => {
  const { src, html } = fixture();
  assert.throws(
    () => parseVixsrcEmbed(JSON.stringify({ src: "https://other.example/embed/278711" })),
    VixsrcError,
  );
  const embed = parseVixsrcEmbed(JSON.stringify({ src }));
  assert.throws(
    () => parseVixsrcPlaylists(html.replaceAll("vixsrc.to", "other.example"), embed),
    VixsrcError,
  );
});
