import assert from 'node:assert/strict';
import { test, afterEach, mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { execute, executeBatch, runPersisted, BatchRejectedError } from '../lib/twitch/gql.ts';
import { documentPolicy } from '../lib/twitch/request-policy.ts';
import { parseChapters, parseClassification, fetchVideoDetails } from '../lib/twitch/video-details.ts';
import { PERSISTED } from '../lib/twitch/operations.ts';
const fixtures = [...JSON.parse(readFileSync(new URL('./fixtures/research/round15/persisted-quartet-fixture.json', import.meta.url))),
  JSON.parse(readFileSync(new URL('./fixtures/search/autocomplete-rubius.json', import.meta.url)))];
const op = (query = 'query VideoMetadata { video(id:"1") { id } }', family = 'video') => ({ name: 'VideoMetadata', family, document: { query }, validate: data => data });
afterEach(() => mock.restoreAll());

test('owned documents reject traversal, reporting, additional operations and over-budget aliases locally', () => {
  for (const query of ['query VideoMetadata { video(id:"1") { comments(after:"x") { id } } }', 'query VideoMetadata { WatchTrack }', 'query VideoMetadata { search }', 'mutation VideoMetadata { video { id } }', 'query VideoMetadata { video { id } } mutation Other { x }']) assert.throws(() => documentPolicy(query));
  assert.equal(documentPolicy('query VideoMetadata { ' + Array.from({length:15}, (_,i)=>`v${i}:video(id:"${i}"){id}`).join(' ') + ' }').aliases, 15);
  assert.throws(() => documentPolicy('query VideoMetadata { ' + Array.from({length:16}, (_,i)=>`v${i}:video(id:"${i}"){id}`).join(' ') + ' }'), {kind:'cap'});
  assert.throws(() => documentPolicy('query SearchCandidates { searchFor(userQuery:"a",platform:"web",options:{targets:[{index:CHANNEL,cursor:"x"}]}) { channels { edges { item { id } } } } }'), {kind:'unavailable'});
});
test('35-document batches preserve accepted per-operation successes; 36 never sends', async () => {
  let calls=0;
  mock.method(globalThis,'fetch',async (_url,init)=>{calls++; const docs=JSON.parse(init.body); return Response.json(docs.map((_,i)=>i===1?{errors:[{message:'PersistedQueryNotFound'}]}:{data:{video:{id:String(i)}}}));});
  const results=await executeBatch(Array.from({length:35},()=>op()));
  assert.equal(results.length,35); assert.equal(results[1].ok,false); assert.equal(results[2].data.video.id,'2');
  await assert.rejects(executeBatch(Array.from({length:36},()=>op())),error=>error instanceof BatchRejectedError && error.delivery==='none');
  assert.equal(calls,1);
});
test('rejected envelopes and wrong array counts deliver no mapped operation results',async()=>{
  for (const payload of [{error:'Invalid GraphQL request'},[],[{data:{video:{id:'1'}}},{data:{video:{id:'2'}}}]]) {
    mock.method(globalThis,'fetch',async()=>Response.json(payload));
    await assert.rejects(executeBatch([op()]),error=>error instanceof BatchRejectedError && error.delivery==='none');
  }
  mock.method(globalThis,'fetch',async()=>Response.json({error:'Invalid GraphQL request'},{status:400}));
  await assert.rejects(executeBatch([op()]),BatchRejectedError);
});
test('pinned GET and POST share validation, while other operations cannot switch to GET',async()=>{
  const fixture=fixtures.find(x=>x.operationName==='UseViewCount'); const methods=[];
  mock.method(globalThis,'fetch',async(url,init)=>{methods.push(init.method); if(init.method==='GET') assert.equal(new URL(url).searchParams.get('operationName'),'UseViewCount'); return Response.json(fixture.response_redacted);});
  const a=await runPersisted('UseViewCount',fixture.variables,data=>data,{method:'GET'});
  const b=await runPersisted('UseViewCount',fixture.variables,data=>data);
  assert.deepEqual(a,b); assert.deepEqual(methods,['GET','POST']);
  await assert.rejects(runPersisted('ContentClassificationContext',{},data=>data,{method:'GET'}),{kind:'unavailable'});
});
test('quartets pin hashes and normalize chapter milliseconds once',()=>{
  for(const name of Object.keys(PERSISTED)) assert.equal(PERSISTED[name].hash,fixtures.find(x=>x.operationName===name).sha256Hash);
  const chapters=parseChapters(fixtures[0].response_redacted.data);
  assert.deepEqual(chapters.map(x=>[x.start,x.end]),[[0,1270],[1270,7894]]);
  const classification=parseClassification(fixtures[1].response_redacted.data);
  assert.equal(classification.broadcastType,'ARCHIVE'); assert.equal(classification.labels[0].id,'MatureGame');
});
test('hash degradation leaves unrelated optional classification available',async()=>{
  mock.method(globalThis,'fetch',async()=>Response.json([{errors:[{message:'PersistedQueryNotFound'}]},fixtures[1].response_redacted]));
  const result=await fetchVideoDetails('12345'); assert.equal(result.availability.chapters,'unavailable'); assert.equal(result.availability.classification,'available');
});
test('integrity codes stop the family without retry or queued shape changes',async()=>{
  let calls=0; mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({errors:[{message:'blocked',extensions:{code:'IntegrityCheckFailed'}}]});});
  await assert.rejects(execute(op()),{kind:'integrity'}); await assert.rejects(execute(op()),{kind:'integrity'}); assert.equal(calls,1);
});
test('unverified raw GET and malformed errors fail locally or as schema failures',async()=>{
  let calls=0;mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({errors:{message:'wrong shape'}});});
  await assert.rejects(execute({...op(),method:'GET'}),{kind:'unavailable'});assert.equal(calls,0);
  await assert.rejects(execute({...op('query ClipMetadata { clip(slug:"Fixture") { id } }','clips'),name:'ClipMetadata'}),{kind:'schema'});assert.equal(calls,1);
});
