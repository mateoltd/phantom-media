import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { extensionIdentity, hostedExtension, assetDestination } from '../lib/extensions/location.ts';
import { collectExtension } from '../lib/extensions/collect.ts';
import { fetchExtensions } from '../lib/twitch/extensions.ts';
import { readFileSync } from 'node:fs';
afterEach(()=>mock.restoreAll());
const client='d4uvtfdr04uq6raoenvj7m86gdk16v', root=`https://${client}.ext-twitch.tv/${client}/2.4.6/0123456789abcdef0123456789abcdef/`;
const iconReceipt=JSON.parse(readFileSync(new URL('./fixtures/extensions/icon-request.json',import.meta.url)));
test('bare-ID locations preserve actual hosted versions independently of catalog versions',()=>{
  const entry=extensionIdentity({id:`${client}:1.0`,name:'Fixture',authorName:'Fixture',summary:''});const location=hostedExtension(entry.clientId,`${root}panel.html`);
  assert.equal(entry.version,'1.0');assert.equal(location.version,'2.4.6');assert.equal(location.packageHash,'0123456789abcdef0123456789abcdef');
  assert.throws(()=>hostedExtension(client,`${root.replace(client,'other')}panel.html`));
  assert.throws(()=>assetDestination('https://supervisor.internal.example/asset.js',location));
  assert.throws(()=>assetDestination('../outside.js',location));
  assert.equal(assetDestination('https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js',location),'https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js');
});
test('static collection deduplicates relative assets, excludes external hosts and retains partial failures',async()=>{
  let requests=0;
  mock.method(globalThis,'fetch',async url=>{requests++;const path=new URL(url).pathname;if(path.endsWith('panel.html'))return new Response('<script src="app.js"></script><script src="app.js"></script><link href="style.css"><img src="https://private.example/hidden.png">',{headers:{'Content-Type':'text/html'}});if(path.endsWith('style.css'))return new Response('body {background:url(bg.png)}',{headers:{'Content-Type':'text/css'}});if(path.endsWith('bg.png'))return new Response(null,{status:404});return new Response('console.log("static only")',{headers:{'Content-Type':'application/javascript'}});});
  const result=await collectExtension(hostedExtension(client,`${root}panel.html`));assert.equal(requests,4);assert.equal(result.assets.length,3);assert.equal(result.failures.length,1);assert.equal(result.skipped.length,1);assert.equal(result.coverage,'static-references-only');
  assert.ok(atob(result.assets[0].base64).includes('<script'));
});
test('redirects outside the package are stopped before requesting another host',async()=>{
  let calls=0;mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://internal.example/private.js'}});});
  const result=await collectExtension(hostedExtension(client,`${root}panel.html`));assert.equal(calls,1);assert.equal(result.assets.length,0);assert.equal(result.failures.length,1);
});
test('verified extension logos retain their actual URL and reject invalid image destinations',()=>{
  const raw=iconReceipt.response.data.extensions.edges[0].node;
  const entry=extensionIdentity(raw);
  assert.equal(entry.iconUrl,raw.iconURLs.square100);
  assert.equal(entry.version,'2.4.6');
  assert.ok(entry.iconUrl.includes('/2.2.41/'),'logo asset version is not reconstructed from catalog version');
  for(const square100 of [null,42,'javascript:alert(1)','https://example.com/logo.png','https://user:pass@extensions-discovery-images.twitch.tv/logo','http://extensions-discovery-images.twitch.tv/logo']) {
    assert.equal(extensionIdentity({...raw,iconURLs:{square100}}).iconUrl,undefined);
  }
  assert.equal(extensionIdentity({...raw,iconURLs:null}).iconUrl,undefined);
});
test('catalog artwork is normalized from its receipt and schema degradation preserves a logo-less catalog',async()=>{
  let now=Date.now(), calls=0;
  mock.method(Date,'now',()=>now);
  mock.method(globalThis,'fetch',async(_url,init)=>{
    calls++;
    const {query}=JSON.parse(init.body);
    if(calls===1) {
      assert.ok(query.includes('iconURLs { square100 }'));
      return Response.json({errors:[{message:'Cannot query field iconURLs on type Extension'}]});
    }
    if(calls===2) {
      assert.ok(!query.includes('iconURLs'));
      const node={...iconReceipt.response.data.extensions.edges[0].node}; delete node.iconURLs;
      return Response.json({data:{extensions:{edges:[{node}]}}});
    }
    assert.ok(query.includes('iconURLs { square100 }'));
    return Response.json(iconReceipt.response);
  });
  assert.equal((await fetchExtensions())[0].iconUrl,undefined);
  assert.equal(calls,2);
  now+=301000;
  assert.equal((await fetchExtensions())[0].iconUrl,iconReceipt.response.data.extensions.edges[0].node.iconURLs.square100);
  assert.equal(calls,3);
});
