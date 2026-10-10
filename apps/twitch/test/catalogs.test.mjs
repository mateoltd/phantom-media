import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { viewSlice, validateSlice, sliceKey, DEFAULT_VIEW, VIEW_SIZE, VIDEO_LANGUAGES, CLIP_LANGUAGES } from '../lib/catalog/slices.ts';
import { fetchCatalogSlice, seedCatalog } from '../lib/twitch/catalogs.ts';
afterEach(()=>mock.restoreAll());
const channel={kind:'channel',anchor:'fixturechannel'}, game={kind:'game',anchor:'Chess'};
test('every view is one slice with source-specific axes and no cursor fields',()=>{
  // The default view lists every kind of video together, newest first, in a single request.
  assert.deepEqual(viewSlice(channel,DEFAULT_VIEW),{source:'channel-videos',anchor:'fixturechannel',first:VIEW_SIZE,sort:'TIME'});
  assert.deepEqual(viewSlice(channel,{...DEFAULT_VIEW,type:'PAST_PREMIERE',sort:'VIEWS'}),{source:'channel-videos',anchor:'fixturechannel',first:VIEW_SIZE,sort:'VIEWS',type:'PAST_PREMIERE'});
  // Axes a source does not have are dropped rather than sent.
  assert.equal(viewSlice(channel,{...DEFAULT_VIEW,language:'de'}).language,undefined);
  assert.equal(viewSlice(game,{...DEFAULT_VIEW,type:'ARCHIVE'}).type,undefined);
  assert.equal(viewSlice(game,{...DEFAULT_VIEW,language:'DE'}).language,'de');
  const clips=viewSlice(game,{...DEFAULT_VIEW,media:'clip',language:'de'});
  assert.deepEqual(clips,{source:'game-clips',anchor:'Chess',first:VIEW_SIZE,sort:'TRENDING',period:'LAST_WEEK',language:'DE'});
  const user=viewSlice(channel,{...DEFAULT_VIEW,media:'clip',period:'ALL_TIME',language:'de'});
  assert.deepEqual(user,{source:'channel-clips',anchor:'fixturechannel',first:VIEW_SIZE,sort:'TRENDING',period:'ALL_TIME'});
  const videos=viewSlice(channel,DEFAULT_VIEW), gameVideos=viewSlice(game,DEFAULT_VIEW);
  for(const slice of [{...videos,first:101},{...gameVideos,first:2501},{...user,language:'DE'},{...clips,sort:'VIEWS'},{...videos,after:'cursor'},{...videos,type:'CLIP'}]) assert.throws(()=>validateSlice(slice));
  assert.notEqual(sliceKey(videos),sliceKey({...videos,sort:'VIEWS'}));
  assert.equal(sliceKey(videos),sliceKey({...videos,type:undefined}));
});
test('language axes come from the ID matrix',()=>{
  const matrix=JSON.parse(readFileSync(new URL('./fixtures/research/round13/fanout-matrix.json',import.meta.url)));
  assert.deepEqual(VIDEO_LANGUAGES,Object.keys(matrix).filter(key=>key.startsWith('gamevid TIME/')).map(key=>key.split('/')[1]));
  assert.deepEqual(CLIP_LANGUAGES,Object.keys(matrix).filter(key=>key.startsWith('gameclip LAST_DAY/')).map(key=>key.split('/')[1].toLowerCase()));
});
test('captured user video totals stay type scoped',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/catalog-totals.json',import.meta.url)));
  const highlights=fixture.responses[1].data.user.videos;assert.equal(highlights.edges.length,2);assert.ok(highlights.edges.some(edge=>edge.node.id==='1667569838'));
});
test('slice adapters coalesce canonical keys and never send after or user-clip language',async()=>{
  let calls=0;
  mock.method(globalThis,'fetch',async(_url,init)=>{calls++;const request=JSON.parse(init.body);assert.ok(!request.query.includes('after'));assert.ok(!request.query.includes('languages'));return Response.json({data:{user:{clips:{edges:[{node:{id:'1',slug:'FixtureClip',title:'fixture',createdAt:'2026-01-01',durationSeconds:10,viewCount:1,thumbnailURL:''}}]}}}});});
  const slice=viewSlice(channel,{...DEFAULT_VIEW,media:'clip',period:'LAST_DAY'});
  const results=await Promise.all([fetchCatalogSlice(slice),fetchCatalogSlice(slice)]); assert.equal(calls,1);assert.deepEqual(results[0],results[1]);assert.equal(results[0].items[0].kind,'clip');
});
test('a channel\'s videos are read in one request, with a type only when one is chosen',async()=>{
  const queries=[];
  mock.method(globalThis,'fetch',async(_url,init)=>{const request=JSON.parse(init.body);queries.push(request.query);return Response.json({data:{user:{videos:{totalCount:51,edges:[{node:{id:'9',title:'fixture',createdAt:'2026-01-01',lengthSeconds:60,viewCount:3,previewThumbnailURL:'',owner:{login:'typeless'}}}]}}}});});
  const all=await fetchCatalogSlice(viewSlice({kind:'channel',anchor:'typeless'},DEFAULT_VIEW));
  assert.equal(queries.length,1);assert.ok(!queries[0].includes('type:'));assert.ok(queries[0].includes('sort:TIME'));
  assert.equal(all.totalCount,51);assert.deepEqual(all.items.map(item=>item.id),['9']);
  await fetchCatalogSlice(viewSlice({kind:'channel',anchor:'typeless'},{...DEFAULT_VIEW,type:'HIGHLIGHT'}));
  assert.equal(queries.length,2);assert.ok(queries[1].includes('type:HIGHLIGHT'));
});
test('a page seed gives up quietly and never rejects',async()=>{
  mock.method(globalThis,'fetch',async()=>{throw new TypeError('fetch failed');});
  assert.equal(await seedCatalog(viewSlice({kind:'channel',anchor:'seedfails'},DEFAULT_VIEW)),null);
  mock.restoreAll();
  let release;
  mock.method(globalThis,'fetch',()=>new Promise(resolve=>{release=()=>resolve(Response.json({data:{user:{videos:{totalCount:0,edges:[]}}}}));}));
  const slice=viewSlice({kind:'channel',anchor:'seedslow'},DEFAULT_VIEW);
  assert.equal(await seedCatalog(slice,10),null);
  // The read it started keeps going, so the browser's request for the same slice joins it instead of starting another.
  const joined=fetchCatalogSlice(slice);release();
  assert.deepEqual((await joined).items,[]);
});
