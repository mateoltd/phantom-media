import assert from 'node:assert/strict';
import { test, afterEach, mock } from 'node:test';
import { createPermitPool } from '../lib/concurrency.ts';
import { readBytes } from '../lib/media/read.ts';
import { resourceKey, historyPath, discoveryHistory, validHistory, playbackKey } from '../lib/history.ts';
import { readPlaybackSource } from '../lib/playback/resolve.ts';
import { parseMediaManifest } from '../lib/media/manifest.ts';
import { proxyMedia } from '../lib/media/proxy.ts';
import { parseStartTime, buildVodPath } from '../lib/validation.ts';
afterEach(()=>mock.restoreAll());
test('canceling a queued permit does not leak or overtake the reserved slot',async()=>{
  const pool=createPermitPool(1,2), first=await pool.acquire(), cancel=new AbortController();
  const waiting=pool.run(async()=>assert.fail('canceled work ran'),cancel.signal);cancel.abort();await assert.rejects(waiting,{name:'AbortError'});
  let ran=false;const next=pool.run(async()=>{ran=true;return 2;});assert.equal(ran,false);first();first();assert.equal(await next,2);assert.equal(await pool.run(async()=>3),3);
});
test('byte limits and canceled stalled bodies release their readers',async()=>{
  let canceled=false;const stop=new AbortController();const response=new Response(new ReadableStream({cancel(){canceled=true;}}));
  const pending=readBytes(response,10,stop.signal);stop.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(canceled,true);
  await assert.rejects(readBytes(new Response(new Uint8Array(11)),10),{kind:'cap'});
});
test('history and resume keys distinguish clips from VODs without legacy adapters',()=>{
  const vod={resource:{kind:'vod',id:'123'},channel:'fixturechannel',timestamp:1},clip={resource:{kind:'clip',slug:'123'},channel:'',timestamp:2};
  assert.notEqual(resourceKey(vod.resource),resourceKey(clip.resource));assert.notEqual(playbackKey(vod.resource),playbackKey(clip.resource));
  assert.equal(historyPath(vod),'/videos/123');assert.equal(historyPath(clip),'/clips/123');assert.equal(discoveryHistory([vod,clip]).length,1);
  assert.equal(validHistory([{vodId:'123',channel:'old',timestamp:0},vod,clip]).length,2);
});
test('explicit start-of-video timestamps remain distinct from absent resume requests',()=>{
  assert.equal(parseStartTime('0'),0);
  assert.equal(parseStartTime('12.9'),12);
  for(const value of [null,undefined,['0','10'],'',' ','-1','invalid','Infinity']) assert.equal(parseStartTime(value),undefined);
  assert.equal(buildVodPath('123'),'/videos/123');
  assert.equal(buildVodPath('123',0),'/videos/123?t=0');
  assert.equal(buildVodPath('123',12.9),'/videos/123?t=12');
});
test('fixed archive sources require stream identity and cannot become VOD IDs',()=>{
  assert.equal(readPlaybackSource(new URLSearchParams({archive:'fixturechannel'})),null);
  const fixed=readPlaybackSource(new URLSearchParams({archive:'fixturechannel',streamId:'456',startedAt:'2026-10-09T00:00:00Z'}));
  assert.deepEqual(fixed,{archive:'fixturechannel',streamId:'456',startedAt:'2026-10-09T00:00:00.000Z'});assert.equal('vodId' in fixed,false);
  assert.equal(readPlaybackSource(new URLSearchParams({vodId:'123',archive:'fixturechannel'})),null);
});
test('media durations require corresponding segment URIs and valid sequence numbers',()=>{
  for(const text of ['#EXTM3U\n#EXTINF:10,','#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:NaN\n#EXTINF:10,\na.ts']) assert.throws(()=>parseMediaManifest(text),{kind:'schema'});
});
test('a partial response whose whole representation is a stub uses silent fallback',async()=>{
  let calls=0;mock.method(globalThis,'fetch',async()=>++calls===1?new Response(new Uint8Array(10),{status:206,headers:{'Content-Range':'bytes 0-9/111','Content-Length':'10'}}):new Response(new Uint8Array(10),{status:206,headers:{'Content-Range':'bytes 0-9/1000'}}));
  const request=new Request('https://app.test/api/proxy?url='+encodeURIComponent('https://video-edge.ttvnw.net/record/1-unmuted.ts'),{headers:{Range:'bytes=0-9'}});
  const response=await proxyMedia(request);assert.equal(calls,2);assert.equal(response.headers.get('X-Phantom-Audio'),'silent-fallback');await response.body.cancel();
});
test('prepaint history hint reads canonical resources and counts only valid channel shortcuts',async()=>{
  const {runInNewContext}=await import('node:vm');
  const {HISTORY_HINT}=await import('../lib/history-hint.ts');
  const dataset={};
  const entries=[{resource:{kind:'vod',id:'123'},channel:' RICKYEDIT ',timestamp:1},{resource:{kind:'clip',slug:'Clip'},channel:'',timestamp:2},{vodId:'456',channel:'old',timestamp:3}];
  runInNewContext(HISTORY_HINT,{localStorage:{getItem:key=>{assert.equal(key,'phantom-watch-history');return JSON.stringify(entries);}},document:{documentElement:{dataset}}});
  assert.equal(dataset.history,2);assert.equal(dataset.historyChannels,1);
});
