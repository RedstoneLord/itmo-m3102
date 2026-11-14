// Настоящие старый и новый assembled shell, один origin и включённые service workers.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const oldRoot = readFileSync('/tmp/classic-previous-path','utf8').trim();
let root = oldRoot, fault = '', faultCount=0, incompatibleCore='', legacyMismatch=false;
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server = createServer((req,res) => {
  const path=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'') || 'index.html';
  if(path.includes('..')) {res.writeHead(400);res.end();return;}
  if(root !== oldRoot && path.includes('/js/home-setup.js') && fault) {
    faultCount++;
    if(fault==='interrupt') {req.socket.destroy();return;}
    res.writeHead(503);res.end('fixture critical failure');return;
  }
  if(path==='__probe_empty.html') {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Module upgrade probe</title>');return;}
  if(legacyMismatch && path==='js/student-core.js') {res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(incompatibleCore);return;}
  const file=resolve(root,path);
  if(!existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch();
const context=await browser.newContext({serviceWorkers:'allow'});
await context.route(u=>!['127.0.0.1','localhost'].includes(u.hostname), r=>r.fulfill({contentType:r.request().url().endsWith('.css')?'text/css':'text/javascript',body:r.request().url().includes('/marked/')?'window.marked={use(){},parse(){return "<p>Занятие</p>"}}':''}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base);
await page.evaluate(()=>{localStorage.setItem('m3102-student-v1',JSON.stringify({login:''}));localStorage.setItem('m3102-setup-v1',JSON.stringify({version:1,completed:true}));localStorage.setItem('m3102-study-plan-v1',JSON.stringify({tasks:[{id:'keep',name:'Сохранить'}],done:{keep:true}}));});
await page.reload();
await page.evaluate(()=>navigator.serviceWorker.ready);
await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
await page.waitForSelector('#student-next .lesson-summary');
const baselineMarkup=await page.locator('html').getAttribute('data-classic-release');
assert.equal(baselineMarkup,null);
// Сеем именно старый core без forget из предыдущей ревизии: воспроизведение наблюдённой несовместимости.
const oldCore=execFileSync('git',['show','df97ee0:app/classic/student-core.js'],{cwd:resolve('..'),encoding:'utf8'});
incompatibleCore=oldCore;legacyMismatch=true;
const originalCore=readFileSync(resolve(oldRoot,'js/student-core.js'),'utf8');
await page.evaluate(async ({base,oldCore})=>{const c=await caches.open('m3102-shell-student-v1');await c.put(base+'js/student-core.js',new Response(oldCore,{headers:{'Content-Type':'text/javascript'}}));},{base,oldCore});
const probe=await context.newPage();
probe.on('pageerror',e=>errors.push(e.message));
const cdp=await context.newCDPSession(probe);await cdp.send('Network.clearBrowserCache');
await probe.goto(base+'__probe_empty.html');
const mismatch = await probe.evaluate(async()=>{try{await import('./js/home-setup.js?upgrade-probe');return '';}catch(e){return e.message;}});

assert.match(mismatch,/forget|remember/);
errors.push(mismatch);
await probe.close();
const reproducedErrors=[...errors];errors.length=0;legacyMismatch=false;
await page.evaluate(async ({base,originalCore})=>{const c=await caches.open('m3102-shell-student-v1');await c.put(base+'js/student-core.js',new Response(originalCore,{headers:{'Content-Type':'text/javascript'}}));},{base,originalCore});
await page.reload();await page.waitForSelector('#student-next .lesson-summary');
const saved=await page.evaluate(()=>localStorage.getItem('m3102-study-plan-v1'));
root=resolve('site');
const current=JSON.parse(readFileSync(resolve(root,'shell-manifest.json')));
const waitUntil=async fn=>{const end=Date.now()+45000;while(!(await fn())){if(Date.now()>end)throw new Error('Timed out waiting for worker lifecycle');await new Promise(r=>setTimeout(r,100));}};
const outcomes=[];
for(const failure of ['http','interrupt']) {
  fault=failure;faultCount=0;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  const deadline=Date.now()+30000;
  while(!faultCount && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
  assert(faultCount>0,'critical request exercised');
  await waitUntil(()=>page.evaluate(async()=>!(await navigator.serviceWorker.getRegistration()).installing));
  const names=await page.evaluate(()=>caches.keys());
  assert(!names.includes(current.shellCache),'incomplete cache discarded');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>Boolean(r.waiting))),false);
  // Старый активный worker остаётся рабочим, личные данные не изменены.
  assert.equal(await page.evaluate(()=>localStorage.getItem('m3102-study-plan-v1')),saved);
  outcomes.push({failure,criticalRequests:faultCount,activePrevious:true,incompleteCacheRemoved:true});
}
fault='';
await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
await waitUntil(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting)));
assert.equal(await page.evaluate(async name=>Boolean(await (await caches.open(name)).match(location.origin+'/__complete__')),current.shellCache),true);
const oldTab=await context.newPage();
await oldTab.goto(base);await oldTab.waitForSelector('#student-next .lesson-summary');
// Старый воркер берёт новый HTML из сети. Неизменяемые адреса предотвращают смешение.
assert.equal(await oldTab.locator('html').getAttribute('data-classic-release'),current.release);
await page.evaluate(()=>new Promise(resolve=>{navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(true),{once:true});navigator.serviceWorker.getRegistration().then(r=>r.waiting.postMessage({type:'ACTIVATE_CLASSIC'}));}));
await page.waitForTimeout(300);
await page.reload();await page.waitForSelector('#student-next .lesson-summary');
assert.equal(await page.locator('html').getAttribute('data-classic-release'),current.release);
assert.equal(await page.evaluate(()=>localStorage.getItem('m3102-study-plan-v1')),saved);
// Для детерминированного офлайн-прогона существующие CDN заменены теми же тестовыми ответами.
await page.evaluate(async({base,cacheName})=>{
  const cache=await caches.open(cacheName);
  const manifest=await (await cache.match(base+'shell-manifest.json')).json();
  for(const {url} of manifest.files.filter(e=>e.url.startsWith('https://'))) await cache.put(url,new Response(url.includes('/marked/')?'window.marked={use(){},parse(){return "<p>Занятие</p>"}}':'',{headers:{'Content-Type':url.endsWith('.css')?'text/css':'text/javascript'}}));
},{base,cacheName:current.shellCache});
await context.setOffline(true);
await page.reload();await page.waitForSelector('#student-next .lesson-summary');
assert.equal(await page.locator('html').getAttribute('data-classic-release'),current.release);
assert.equal(await page.evaluate(()=>localStorage.getItem('m3102-study-plan-v1')),saved);
assert.deepEqual(errors,[]);
const out=resolve('../docs/classic-plus-plus-evidence');mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'upgrade.json'),JSON.stringify({previous:'353f30b82e274dfbac76368538153be938519e57',release:current.release,reproducedErrors,outcomes,oldOpenTab:true,offlineReopen:true,personalDataPreserved:true,errors},null,2));
await context.close();await browser.close();await new Promise(r=>server.close(r));
console.log('Upgrade: mixed core reproduced; HTTP/interrupted installs rejected; open tabs, activation, offline and personal data passed.');
