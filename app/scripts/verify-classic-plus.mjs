import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
await context.addInitScript(()=>{localStorage.setItem('m3102-student-v1','{"login":""}');localStorage.setItem('m3102-settings-v1','{"theme":"auto","reduceMotion":true}');});
await context.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>{
 const url=r.request().url();
 if(url.includes('raw.githubusercontent.com')) { const path=decodeURIComponent(new URL(url).pathname.split('/').slice(4).join('/'));if(existsSync(resolve('..',path)))return r.fulfill({path:resolve('..',path)}); }
 if(url.includes('cdnjs.cloudflare.com')){const file=resolve('/tmp/classic-vendors',new URL(url).pathname.replaceAll('/','_'));if(existsSync(file))return r.fulfill({path:file,contentType:url.endsWith('.css')?'text/css':'text/javascript'});}
 if(url.includes('/issues?'))return r.fulfill({json:[]});
 return r.fulfill({contentType:url.includes('googleapis')?'text/css':'text/javascript',body:''});
});
const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-14T12:00:00+03:00'));
const base='http://127.0.0.1:4173/';const out=resolve('../docs/classic-plus-plus-evidence');mkdirSync(out,{recursive:true});
const checks=[],contrasts=[],failures=[];
const tree=JSON.parse(readFileSync('site/data/tree.json'));
const md=tree.tree.find(e=>e.path.endsWith('.md')&&e.path.startsWith('Конспекты/'))?.path;
const routes=[['home',''],['day','#/schedule/2026-11-14'],['week','#/week/2026-11-14'],['month','#/month/2026-11-14'],['materials','#/materials'],['homework','#/homework'],['settings','#/settings?section=appearance'],['reader',`#/note/${encodeURI(md)}`]];
try {
 for(const [name,hash] of routes) {
  await page.goto(base+hash);await page.waitForTimeout(200);
  for(const theme of ['light','dark','system']) {
   await page.emulateMedia({colorScheme:theme==='system'?'dark':theme});
   await page.evaluate(t=>{if(t==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme=t;},theme);
   for(const width of [320,360,390,430,760,920,1100,1440]) for(const scale of [100,125,140]) {
    await page.setViewportSize({width,height:844});await page.evaluate(s=>{document.documentElement.dataset.textScale=String(s);},scale);
    const result=await page.evaluate(()=>{
     const visible=el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden';
     const nav=[...document.querySelectorAll('.bn-item>span:last-child')].filter(visible).map(el=>({text:el.textContent,whole:getComputedStyle(el).whiteSpace==='nowrap'&&el.getBoundingClientRect().width<=el.parentElement.getBoundingClientRect().width+1}));
     const clipped=[...document.querySelectorAll('.lesson-description h3,.home-today-row strong,.sched-card-main strong,.timetable-subject,.panel-head h2,.home-note strong,.settings-nav button,.student-action-label')].filter(visible).filter(el=>{const s=getComputedStyle(el);return (['hidden','clip'].includes(s.overflowX)&&el.scrollWidth>el.clientWidth+2)||(['hidden','clip'].includes(s.overflowY)&&el.scrollHeight>el.clientHeight+2);}).map(el=>el.textContent);
     return {root:document.documentElement.scrollWidth<=innerWidth,nav:nav.every(x=>x.whole),clipped};
    });
    const row={name,theme,width,scale,...result};checks.push(row);if(!result.root||!result.nav||result.clipped.length)failures.push(row);
   }
  }
 }
 writeFileSync(`${out}/verification.json`,JSON.stringify({checks,failures},null,2));
 // Все сохранённые шрифты на реальных рабочих страницах, телефон/desktop и крупный текст.
 for(const font of ['golos','noto','liberation','ubuntu','urw']) for(const [name,hash] of routes) {
  await page.goto(base+hash);await page.waitForTimeout(150);
  await page.evaluate(f=>document.documentElement.dataset.font=f,font);await page.evaluate(()=>document.fonts.ready);
  for(const theme of ['light','dark']) {
   await page.emulateMedia({colorScheme:theme});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for(const width of [320,390,1440]) for(const scale of [100,140]) {
    await page.setViewportSize({width,height:844});await page.evaluate(s=>document.documentElement.dataset.textScale=String(s),scale);
    const result=await page.evaluate(()=>({root:document.documentElement.scrollWidth<=innerWidth,nav:[...document.querySelectorAll('.bn-item>span:last-child')].filter(el=>el.getClientRects().length).every(el=>getComputedStyle(el).whiteSpace==='nowrap'&&el.getBoundingClientRect().width<=el.parentElement.getBoundingClientRect().width+1)}));
    const row={font,name,theme,width,scale,...result};checks.push(row);if(!result.root||!result.nav)failures.push(row);
   }
  }
 }
 writeFileSync(`${out}/verification.json`,JSON.stringify({checks,failures},null,2));
 // Реальный system theme без data-theme, затем все смысловые пары палитр и состояний.
 await page.goto(base+'#/settings?section=appearance');
 await page.evaluate(()=>{
  const region=document.createElement('section');region.id='contrast-fixture';region.className='dash-panel';
  region.innerHTML='<button class="btn2 btn-primary">Сохранить</button><button class="btn2">Скачать копию</button><button class="btn2" aria-pressed="true">Выбрано ✓</button><button class="btn2 btn-danger">Удалить материалы</button><label class="home-field">Название<input value="Текст" aria-invalid="true"></label><p role="alert">Ошибка: повторите попытку</p><p class="home-cache">Сохранённые данные</p><p style="color:var(--ok)">Сохранено</p><a href="#/schedule">Открыть расписание</a><span class="sched-kind">Лекция</span>';
  document.body.append(region);
 });
 for(const theme of ['light','dark'])for(const palette of ['purple','orange','green','blue','cyan','gold','neon','aurora','graphite','sakura','ruby','tropic']) {
  await page.emulateMedia({colorScheme:theme});
  await page.evaluate(p=>{document.documentElement.removeAttribute('data-theme');if(p==='purple')document.documentElement.removeAttribute('data-palette');else document.documentElement.dataset.palette=p;},palette);
  const result=await page.locator('#contrast-fixture').evaluate(root=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
   const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((x,i)=>i===3?x/255:x/255);};
   const composite=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
   const bg=el=>{const c=rgb(getComputedStyle(el).backgroundColor);return c[3]>=1?c:composite(c,el.parentElement?bg(el.parentElement):[1,1,1,1]);};
   const lum=rgb=>{const c=rgb.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
   const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   const text=[...root.querySelectorAll('button,input,p,a,.sched-kind')].map(el=>({label:el.textContent||el.value,ratio:ratio(composite(rgb(getComputedStyle(el).color),bg(el)),bg(el))}));
   const input=root.querySelector('input'),s=getComputedStyle(input);
   const boundary=ratio(rgb(s.borderColor),bg(input));
   input.focus();const focus=ratio(rgb(getComputedStyle(input).outlineColor),bg(input));
   const subjectMarkers=Array.from({length:8},(_,i)=>ratio(rgb(getComputedStyle(document.documentElement).getPropertyValue('--subject-'+i)),bg(root)));
   return {text,boundary,focus,subjectMarkers};
  });
  const row={theme,palette,...result};contrasts.push(row);
  if(result.text.some(x=>x.ratio<4.5)||result.boundary<3||result.focus<3||result.subjectMarkers.some(x=>x<3))failures.push(row);
 }
 for(const font of ['golos','noto','liberation','ubuntu','urw']) {
  await page.evaluate(f=>document.documentElement.dataset.font=f,font);await page.evaluate(()=>document.fonts.ready);
  const loaded=await page.evaluate(()=>getComputedStyle(document.body).fontFamily);
  checks.push({font,loaded});
 }
 writeFileSync(`${out}/verification.json`,JSON.stringify({checks,contrasts,failures},null,2));
 assert.equal(failures.length,0,JSON.stringify(failures.slice(0,8)));
 console.log(`Verified ${checks.length-5} page/theme/width/text cases, 24 composited palette/state sets, 5 fonts`);
} finally {await context.close();await browser.close();}
