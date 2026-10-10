import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server.js';
import nextConfig from '../next.config.ts';

const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
  else process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
});

test('unconfigured builds emit no host redirects', async () => {
  for (const baseUrl of [undefined, '', '   ']) {
    if (baseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = baseUrl;
    assert.deepEqual(await nextConfig.redirects(), []);
  }
});

test('configured www redirects preserve paths and query strings without matching other hosts', async () => {
  process.env.NEXT_PUBLIC_BASE_URL = 'https://watch.example.com/';
  for (const path of ['/?q=hello%20world', '/videos/123?t=0&kind=archive']) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://www.watch.example.com${path}`,
      nextConfig,
    });
    assert.equal(response.status, 308);
    const destination = new URL(response.headers.get('location'));
    const requested = new URL(path, 'https://watch.example.com');
    assert.equal(destination.origin, requested.origin);
    assert.equal(destination.pathname, requested.pathname);
    assert.deepEqual([...destination.searchParams], [...requested.searchParams]);
  }
  for (const host of ['watch.example.com', 'other.example.com', 'wwwXwatchXexampleXcom']) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://${host}/videos/123?t=0`,
      nextConfig,
    });
    assert.equal(response.headers.get('location'), null);
  }
});
