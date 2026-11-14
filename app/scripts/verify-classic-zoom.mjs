// chrome.tabs.setZoom устанавливает browser zoom, в отличие от pinch/pageScaleFactor или CSS zoom.
import {chromium} from '@playwright/test';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const extension=mkdtempSync(join(tmpdir(),'classic-zoom-extension-'));
writeFileSync(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local browser zoom verification',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));
writeFileSync(join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 await context.addInitScript(()=>{localStorage.setItem('m3102-student-v1','{"login":""}');localStorage.setItem('m3102-settings-v1','{"theme":"light","reduceMotion":true}');});
 await context.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.fulfill({contentType:'text/javascript',body:r.request().url().includes('/marked/')?'window.marked={use(){}}':''}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:4173/');
 await page.waitForSelector('#student-next .lesson-summary');
 const before=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
 const zoom=await worker.evaluate(async()=>{const tab=(await chrome.tabs.query({})).find(t=>t.url.startsWith('http://127.0.0.1:4173/'));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);});
 assert.equal(zoom,2);
 const out=resolve('../docs/classic-plus-plus-evidence');mkdirSync(out,{recursive:true});const results=[];
 for(const hash of ['','#/week/2026-11-14','#/month/2026-11-14','#/settings?section=appearance','#/materials','#/homework']) {
  await page.goto('http://127.0.0.1:4173/'+hash);await page.waitForTimeout(250);
  const result=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(result.width,before.width/2);assert.equal(result.overflow,false,hash);
  await page.screenshot({path:`${out}/zoom-200-${hash.split('/')[1]?.split('?')[0]||'home'}.png`});results.push({hash,...result});
 }
 writeFileSync(`${out}/browser-zoom.json`,JSON.stringify({method:'chrome.tabs.setZoom, verified with chrome.tabs.getZoom, CSS viewport and devicePixelRatio',zoom,before,results},null,2));
 console.log('Actual browser zoom 200%: six page compositions verified.');
}finally{await context.close();}
