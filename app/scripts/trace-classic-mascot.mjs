import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
await context.addInitScript(()=>{localStorage.setItem('m3102-student-v1','{"login":""}');localStorage.setItem('m3102-settings-v1','{"theme":"light"}');});
await context.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.fulfill({contentType:'text/javascript',body:r.request().url().includes('/marked/')?'window.marked={use(){}}':''}));
const page=await context.newPage();await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('.hog-facing canvas');
const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
await page.waitForTimeout(5000);
const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await done;
let source='';while(true){const chunk=await cdp.send('IO.read',{handle:stream});source+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}
await cdp.send('IO.close',{handle:stream});
writeFileSync('../docs/classic-plus-plus-evidence/mobile-animation-trace.json',source);
const trace=JSON.parse(source);const categories={};for(const event of trace.traceEvents)if(['FunctionCall','Layout','Paint','UpdateLayoutTree'].includes(event.name)&&event.dur)categories[event.name]=(categories[event.name]||0)+event.dur/1000;
writeFileSync('../docs/classic-plus-plus-evidence/mobile-animation-summary.json',JSON.stringify({viewport:'390x844',dpr:2,cpuThrottling:4,duration:5000,thread:'desktop Chromium phone emulation; no physical-device claim',milliseconds:categories},null,2));
console.log(categories);await context.close();await browser.close();
