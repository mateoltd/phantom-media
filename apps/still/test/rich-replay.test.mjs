import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeReplayNode, emoteImage } from '../lib/chat/messages.ts';
import { createChatIndex } from '../lib/chat/index.ts';
import { parseStoryboards, storyboardFrame } from '../lib/previews/storyboards.ts';
test('captured badges, null colors and decoded emotes retain their presentation identities',()=>{
  const nodes=JSON.parse(readFileSync(new URL('./fixtures/research/round15/badge-receipt.json',import.meta.url)));
  const normalized=nodes.map(normalizeReplayNode).filter(Boolean);
  assert.equal(normalized.length,nodes.length); assert.ok(normalized.every(message=>/^#[a-f0-9]{6}$/i.test(message.color)));
  assert.ok(normalized.some(message=>message.badges.some(badge=>badge.imageUrl))); assert.ok(normalized.every(message=>!message.badges.some(badge=>badge.id==='Ozs=')));
  assert.ok(normalized.some(message=>message.fragments.some(fragment=>fragment.emoteId)));
  assert.equal(emoteImage('../evil'),undefined);
});
test('search index stays separate from panel retention and normalizes reactions to sampled baseline',()=>{
  const index=createChatIndex(3);
  index.add([{id:'1',user:'a',text:'hello',offset:0},{id:'2',user:'b',text:'HELLO',offset:1},{id:'3',user:'a',text:'other',offset:60}],{from:0,through:60,partial:true});
  assert.equal(index.search('hello').length,2); assert.equal(index.reactions()[0].relative,2/1.5);
  index.add([{id:'4',user:'c',text:'latest',offset:120}],{from:120,through:120,partial:true});assert.equal(index.size(),3);assert.equal(index.search('hello').length,1);assert.equal(index.ranges().length,2);
});
test('storyboards select sheet and cell using sampled intervals without guessed dimensions',()=>{
  const [board]=parseStoryboards([{count:200,width:220,height:124,rows:10,cols:5,interval:91,quality:'high',images:['0.jpg','1.jpg','2.jpg','3.jpg']}],'https://d123.cloudfront.net/record/storyboards/preview.json');
  const frame=storyboardFrame(board,51*91+20);assert.equal(frame.url,'https://d123.cloudfront.net/record/storyboards/1.jpg');assert.equal(frame.sourceX,220);assert.equal(frame.sourceY,0);assert.equal(frame.position,51*91);
  assert.equal(storyboardFrame(board,-1),null);assert.throws(()=>parseStoryboards([{...board,images:['https://internal.example/0.jpg']}],'https://d123.cloudfront.net/record/preview.json'));
});
