import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { parseDownloadPlaylist, downloadHls } from '../lib/downloads/hls.ts';
import { downloadFile } from '../lib/downloads/file.ts';
import { prepareDownload, downloadMedia } from '../lib/downloads/download.ts';
import { extractClipSlug } from '../lib/validation.ts';
afterEach(()=>{ mock.restoreAll(); delete globalThis.location; delete globalThis.window; });
const base='https://cdn.example.test/a/index.m3u8';
test('HLS assembly preserves initialization and explicit/implicit byte ranges',()=>{
  const plan=parseDownloadPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="5@0"\n#EXTINF:10,\n#EXT-X-BYTERANGE:10@5\ninit.mp4\n#EXTINF:10,\n#EXT-X-BYTERANGE:7\ninit.mp4\n#EXT-X-ENDLIST',base);
  assert.equal(plan.extension,'mp4'); assert.equal(plan.complete,true); assert.deepEqual(plan.requests.map(x=>x.range),[{start:0,end:4},{start:5,end:14},{start:15,end:21}]);
  for(const text of ['#EXTM3U\n#EXT-X-KEY:METHOD=AES-128\n#EXTINF:10,\na.ts','#EXTM3U\n#EXTINF:10,','#EXTM3U\n#EXT-X-MAP:URI="a.mp4"\n#EXTINF:10,\na.m4s\n#EXT-X-MAP:URI="b.mp4"']) assert.throws(()=>parseDownloadPlaylist(text,base));
});
test('a stalled first segment prevents fetch-ahead and preserves output order',async()=>{
  globalThis.location={href:'https://app.test/',origin:'https://app.test'};
  const requests=Array.from({length:12},(_,i)=>({url:`https://app.test/${i}`})); let finish, calls=0; const written=[];
  mock.method(globalThis,'fetch',async(url)=>{ calls++; if(url.endsWith('/0')) await new Promise(resolve=>finish=resolve); return new Response(Uint8Array.of(Number(url.split('/').at(-1)))); });
  const running=downloadHls({requests,extension:'ts',complete:true},{write:async bytes=>written.push(bytes[0])},()=>{},new AbortController().signal);
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(calls,1); finish(); await running;
  assert.deepEqual(written,Array.from({length:12},(_,i)=>i));
});
test('expired clip resumes only after matching representation and anchor bytes',async()=>{
  const bytes=new Uint8Array(4*1024*1024+12).fill(7); let expires=true, writes=0;
  mock.method(globalThis,'fetch',async(url,init)=>{
    const [,a,b]=/bytes=(\d+)-(\d+)/.exec(init.headers.Range); const start=Number(a),end=Math.min(Number(b),bytes.length-1);
    if(url==='old' && start>0 && expires){expires=false;return new Response(null,{status:403});}
    return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'ETag':'"stable"'}});
  });
  await downloadFile({url:'old',identity:'720'},async()=>({url:'fresh',identity:'720'}),{write:async data=>writes+=data.length},()=>{},new AbortController().signal);
  assert.equal(writes,bytes.length);
});
test('ignored ranges cannot corrupt a file',async()=>{
  mock.method(globalThis,'fetch',async()=>new Response('whole-file'));
  await assert.rejects(downloadFile({url:'test',identity:'a'},undefined,{write:async()=>assert.fail()},()=>{},new AbortController().signal),/valid file range/);
});
test('clip URLs route to clips before channel parsing',()=>{
  assert.equal(extractClipSlug('https://clips.twitch.tv/Clip-A'),'Clip-A');
  assert.equal(extractClipSlug('https://www.twitch.tv/channel/clip/Clip-B'),'Clip-B');
  assert.equal(extractClipSlug('https://example.com/channel/clip/Clip-B'),null);
});
test('Source segments above 8 MB stream with disk backpressure and exact length',async()=>{
  globalThis.location={href:'https://app.test/',origin:'https://app.test'};
  const chunk=new Uint8Array(1024*1024).fill(9);let produced=0,written=0;
  mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({
    pull(controller){if(produced===12){controller.close();return;}produced++;controller.enqueue(chunk);}
  }),{headers:{'Content-Length':String(12*chunk.length)}}));
  await downloadHls({requests:[{url:'https://app.test/0.ts'}],extension:'ts',complete:true},{write:async data=>{assert.ok(produced-written<=2);written++;assert.equal(data.length,chunk.length);await new Promise(resolve=>setImmediate(resolve));}},()=>{},new AbortController().signal);
  assert.equal(written,12);
});
test('manifest preparation determines the container before a fresh Save gesture opens the picker',async()=>{
  globalThis.location={href:'https://app.test/',origin:'https://app.test'};
  let active=false,picked=false,writes=0;
  globalThis.window={showSaveFilePicker:async options=>{
    assert.equal(active,true);assert.equal(picked,false);picked=true;
    assert.ok(options.suggestedName.endsWith('.ts'));
    return {createWritable:async()=>({write:async data=>writes+=data.length,close:async()=>{},abort:async()=>{}})};
  }};
  mock.method(globalThis,'fetch',async url=>{
    if(url.endsWith('index.m3u8')){active=false;await new Promise(resolve=>setImmediate(resolve));return new Response('#EXTM3U\n#EXTINF:12,\n0.ts\n#EXT-X-ENDLIST');}
    assert.equal(picked,true);return new Response(Uint8Array.of(1,2,3));
  });
  const signal=new AbortController().signal;
  const prepared=await prepareDownload({delivery:'hls',playlistUrl:'https://app.test/index.m3u8'},'source',signal);
  assert.equal(picked,false);
  active=true;
  const saving=downloadMedia(prepared,()=>{},signal);
  assert.equal(picked,true);
  active=false;await saving;assert.equal(writes,3);
});
test('proxied download manifests resolve segments from their final redirect location',async()=>{
  globalThis.location={href:'https://app.test/',origin:'https://app.test'};
  mock.method(globalThis,'fetch',async()=>new Response('#EXTM3U\n#EXTINF:2,\npart.ts\n#EXT-X-ENDLIST',{headers:{'X-Phantom-Media-URL':'https://video-edge.ttvnw.net/new/index.m3u8'}}));
  const prepared=await prepareDownload({delivery:'hls',playlistUrl:'https://video-edge.ttvnw.net/old/index.m3u8'},'source',new AbortController().signal);
  assert.equal(prepared.playlist.requests[0].url,'https://video-edge.ttvnw.net/new/part.ts');
});
