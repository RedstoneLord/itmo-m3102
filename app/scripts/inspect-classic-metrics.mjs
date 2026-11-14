import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch();const page=await browser.newPage();
await page.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.fulfill({contentType:'text/javascript',body:r.request().url().includes('/marked/')?'window.marked={use(){}}':''}));
await page.addInitScript(()=>localStorage.setItem('m3102-student-v1','{"login":""}'));
await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('#student-next .lesson-summary');
const result=await page.evaluate(async()=>{
 await document.fonts.load('400 16px "Golos Text"');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
 const text='Съешь же ещё этих мягких французских булок, да выпей чаю. 0123456789';
 const fonts={};for(const font of ['Golos Text','Arial']){ctx.font=`400 16px "${font}"`;const m=ctx.measureText(text);fonts[font]={width:m.width,ascent:m.fontBoundingBoxAscent,descent:m.fontBoundingBoxDescent};}
 const {drawHog}=await import(`/releases/${document.documentElement.dataset.classicRelease}/js/home-hog-art.js`);
 const poses=[];
 for(const curl of [0,.2,.5,1])for(const leg of [0,1,2,3]){
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,128,128);ctx.translate(64,64);drawHog(ctx,16,{curl,roll:1,leg,run:.55,hat:'none'});
 const a=ctx.getImageData(0,0,128,128).data;let top=128,bottom=0;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(a[(y*128+x)*4+3]>10){top=Math.min(top,y);bottom=Math.max(bottom,y);}
 poses.push({curl,leg,top:top-64,bottom:bottom-64});
 }
 return{fonts,poses};
});
writeFileSync('../docs/classic-plus-plus-evidence/font-art-metrics.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
