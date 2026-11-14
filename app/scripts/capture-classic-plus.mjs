import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const phase = process.argv[2] || 'after';
const base = `http://127.0.0.1:${phase === 'before' ? 4175 : 4173}/`;
const out = resolve('../docs/classic-plus-plus-evidence');
mkdirSync(out, { recursive:true });
const browser = await chromium.launch();
const results = existsSync(`${out}/${phase}.json`) ? JSON.parse(readFileSync(`${out}/${phase}.json`)) : [];
const root = resolve('..');
const tree = JSON.parse(readFileSync(phase === 'before' ? '/tmp/classic-plus-baseline/data/tree.json' : 'site/data/tree.json'));
const md = tree.tree.find(e => e.path.endsWith('.md') && e.path.startsWith('Конспекты/'))?.path;
for (const width of (process.env.CAPTURE_WIDTHS || '1440,390').split(',').map(Number)) for (const theme of (process.env.CAPTURE_THEMES || 'light,dark').split(',')) {
  const context = await browser.newContext({viewport:{width,height:844}, colorScheme:theme, serviceWorkers:'block'});
  await context.addInitScript(({theme}) => {
    localStorage.setItem('m3102-student-v1',JSON.stringify({login:''}));
    localStorage.setItem('m3102-settings-v1',JSON.stringify({theme,reduceMotion:true}));
    window.__cls=0;
    new PerformanceObserver(list => { for(const e of list.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value; }).observe({type:'layout-shift',buffered:true});
  },{theme});
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00+03:00'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const external = async r => {
    const url = r.request().url();
    if(url.includes('raw.githubusercontent.com')) {
      const path = decodeURIComponent(new URL(url).pathname.split('/').slice(4).join('/'));
      if(existsSync(resolve(root,path))) return r.fulfill({path:resolve(root,path)});
    }
    if(url.includes('/issues?')) return r.fulfill({json:[]});
    if(url.includes('cdnjs.cloudflare.com')) {
      const file = resolve('/tmp/classic-vendors',new URL(url).pathname.replaceAll('/','_'));
      if(existsSync(file)) return r.fulfill({path:file,contentType:url.endsWith('.css')?'text/css':url.endsWith('.woff2')?'font/woff2':'text/javascript'});
    }
    return r.fulfill({contentType:url.includes('googleapis')?'text/css':'text/javascript',body:url.includes('/marked/')?'window.marked={use(){},parse(t){return "<h1>Конспект</h1><p>"+t.slice(0,800)+"</p>"}}':''});
  };
  await context.route(u=>!['localhost','127.0.0.1'].includes(u.hostname), external);
  for(const [name,hash] of [['home',''],['schedule','#/schedule'],['week','#/week'],['month','#/month'],['materials','#/materials'],['homework','#/homework'],['deadlines','#/deadlines'],['reader',`#/note/${encodeURI(md)}`],['settings','#/settings'],['other','#/other'],['students','#/students'],['bookmarks','#/bookmarks'],['links','#/links'],['memes','#/memes'],['diagrams','#/diagrams'],['casino','#/casino']]) {
    await page.goto(base+hash);
    await page.waitForTimeout(800);
    if(name==='home') await page.locator('.home-note').first().waitFor({timeout:10000});
    if(name==='settings' && phase!=='before') await page.locator('[data-settings-category="appearance"]').click();
    await page.screenshot({path:`${out}/${phase}-${name}-${width}-${theme}.png`});
    if(['home','settings','schedule','materials'].includes(name)) await page.screenshot({path:`${out}/${phase}-${name}-${width}-${theme}-full.png`,fullPage:true});
    const previous=results.findIndex(r=>r.width===width&&r.theme===theme&&r.name===name);if(previous>=0)results.splice(previous,1);
    results.push({width,theme,name,errors:[...errors],...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,cls:window.__cls,resources:performance.getEntriesByType('resource').map(r=>({url:r.name,size:r.transferSize,type:r.initiatorType}))}))});
  }
  const fresh = await browser.newContext({viewport:{width,height:844}, colorScheme:theme, serviceWorkers:'block'});
  await fresh.addInitScript(t=>localStorage.setItem('m3102-settings-v1',JSON.stringify({theme:t,reduceMotion:true})),theme);
  await fresh.route(u=>!['localhost','127.0.0.1'].includes(u.hostname),external);
  const setup=await fresh.newPage();await setup.goto(base);await setup.locator('[data-home-dialog]').waitFor();
  await setup.screenshot({path:`${out}/${phase}-setup-${width}-${theme}.png`});await fresh.close();
  if(phase!=='before') {
    await page.goto(base);
    await page.setContent(readFileSync('classic/component-sheet.html','utf8'));
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await page.waitForTimeout(300);
    await page.screenshot({path:`${out}/components-${width}-${theme}.png`,fullPage:true});
  }
  await context.close();
}
writeFileSync(`${out}/${phase}.json`,JSON.stringify(results,null,2));
await browser.close();
console.log(`${phase}: ${results.length} page compositions captured`);
