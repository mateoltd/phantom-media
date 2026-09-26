import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURED_CHANNELS } from "../lib/featured-channels.ts";
import { isValidChannelName } from "../lib/channel-page.ts";

/**
 * These channels are linked from the homepage, the /videos hub, and the
 * sitemap.
 *
 * Scope, stated plainly so this file is not mistaken for more than it is:
 * liveness is NOT covered here and cannot be offline. A renamed or banned
 * channel is a real 404, and that is the failure this file will not catch --
 * it happened during development and only a live request or a post-deploy
 * link check finds it. What is covered is the typo class: a malformed or
 * duplicated login, which would 404 or emit duplicate sitemap URLs.
 */
test("every featured channel is a well-formed, unique channel path", () => {
  const logins = FEATURED_CHANNELS.map((channel) => channel.login);

  assert.equal(
    new Set(logins).size,
    logins.length,
    "duplicate login would emit a duplicate sitemap URL and a duplicate React key"
  );

  for (const channel of FEATURED_CHANNELS) {
    assert.ok(
      isValidChannelName(channel.login),
      `${channel.login} is malformed or app-owned, so it would 404`
    );
    assert.ok(channel.label.trim().length > 0, `${channel.login} has no display label`);
  }
});
