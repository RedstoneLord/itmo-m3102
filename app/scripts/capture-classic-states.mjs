import {chromium} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const browser=await chromium.launch();const out=resolve('../docs/classic-plus-plus-evidence');
const all=['student-next-panel','schedule-panel','materials-panel','notes-panel','student-queues-panel','deadline-panel','homework-panel','plan-panel'];
try {
for(const theme of (process.env.CAPTURE_THEMES||'light,dark').split(','))for(const state of ['empty','error','loading','cached','queues','long']) {
 const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:theme,serviceWorkers:'block'});
 await context.addInitScript(({theme,state,all})=>{localStorage.setItem('m3102-settings-v1',JSON.stringify({theme,reduceMotion:true}));localStorage.setItem('m3102-student-v1',JSON.stringify({login:state==='queues'?'RedstoneLord':''}));if(['empty','queues'].includes(state))localStorage.setItem('m3102-home-layout-v1',JSON.stringify({order:all,visible:all}));},{theme,state,all});
 await context.route(u=>!['localhost','127.0.0.1'].includes(u.hostname),r=>{
  const url=r.request().url();
  if(url.includes('/issues?'))return r.fulfill({json:state==='queues'?[{title:'[demo] Жупиков Федор',user:{login:'other'},html_url:'https://github.com/example/1'}]:[]});
  if(url.includes('cdnjs.cloudflare.com')){const file=resolve('/tmp/classic-vendors',new URL(url).pathname.replaceAll('/','_'));if(existsSync(file))return r.fulfill({path:file,contentType:url.endsWith('.css')?'text/css':'text/javascript'});}
  return r.fulfill({body:'',contentType:url.includes('googleapis')?'text/css':'text/javascript'});
 });
 const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-14T12:00:00+03:00'));
 if(['empty','long'].includes(state)) await page.route('**/data/schedule.json',r=>r.fulfill({json:{anchorMonday:'2026-11-09',anchorParity:'odd',cycle:Array.from({length:14},()=>state==='empty'?[]:[{id:'long',subject:'Инструментальные средства разработки программного обеспечения: проектирование и архитектура',start:'13:30',end:'15:00',kind:'practice',room:'2304',teacher:'Александра Константинопольская',location:'Кронверкский проспект, 49'}]),vacations:[],overrides:{}}}));
 if(state==='empty'){await page.route('**/data/recent-notes.json',r=>r.fulfill({json:{entries:[]}}));await page.route('**/data/homework.json',r=>r.fulfill({json:{version:1,items:[]}}));}
 if(state==='queues')await page.route('**/deadlines.json',r=>r.fulfill({json:[{id:'demo',name:'Дискретная математика: практика',deadline:'2026-12-01T18:00:00+03:00'}]}));
 if(state==='error')for(const p of ['**/data/schedule.json','**/data/recent-notes.json'])await page.route(p,r=>r.fulfill({status:503}));
 let release;
 if(state==='loading') {
  const gate=new Promise(r=>release=r);
  for(const p of ['**/data/schedule.json','**/data/recent-notes.json'])await page.route(p,async r=>{await gate;await r.fulfill({status:503}).catch(()=>{});});
 }
 await page.goto('http://127.0.0.1:4173/');
 if(state==='loading')await page.waitForTimeout(300);else await page.waitForTimeout(900);
 if(state==='cached') {
  await page.locator('.lesson-summary').waitFor();
  for(const p of ['**/data/schedule.json','**/data/recent-notes.json'])await page.route(p,r=>r.fulfill({status:503}));
  await page.locator('.home-refresh').click();await page.locator('[data-refresh-message]').filter({hasText:'Часть данных'}).waitFor();
 }
 if(state==='long')await page.locator('.home-hero h1').evaluate(el=>el.textContent='Доброе утро. Сегодня разбираемся со сложными задачами.');
 await page.screenshot({path:`${out}/state-${state}-${theme}.png`,fullPage:true});
 await page.screenshot({path:`${out}/state-${state}-${theme}-viewport.png`});
 if(release)release();await context.close();
}
}finally{await browser.close();}
console.log('Core data states captured in both themes.');
